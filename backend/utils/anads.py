"""Client ANADS — catalogue et microdonnées des enquêtes de l'ANSD.

L'ANADS (*Archive Nationale des Données du Sénégal*) est le catalogue de
microdonnées de l'Agence nationale de la Statistique et de la Démographie. Il
tourne sur NADA et expose une API REST publique.

Ce module suit le parcours réel d'accès à une enquête :

1. ``search()``       — le catalogue des enquêtes (liste, filtrable).
2. ``get_fiche()``     — la fiche descriptive d'une enquête (métadonnées DDI :
                         producteur, période, couverture, résumé, contact).
3. ``list_resources()`` — les fichiers attachés à l'enquête, avec leur nature
                          (microdonnées vs document) et leur format.
4. ``fetch_microdata()`` — télécharge et met en table le fichier de
                           microdonnées, **après vérification de la condition
                           d'accès** portée par la fiche : seules les enquêtes
                           en accès direct, public ou ouvert sont récupérées
                           automatiquement. Une enquête sous licence lève
                           ``AnadsAccessError`` plutôt que d'échouer en silence.

La table obtenue est ensuite stockée comme n'importe quelle source HakiData :
le pipeline d'analyse en aval ne fait aucune différence.
"""

from __future__ import annotations

import io
import json
import ssl
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path
from typing import Any

import pandas as pd

BASE_URL = "https://anads.ansd.sn/index.php/api"
USER_AGENT = "HakiData/1.0 (+ANADS client)"
DEFAULT_TIMEOUT = 45

# Le serveur anads.ansd.sn ne transmet que son certificat final, sans le
# certificat intermédiaire qui le relie à la racine GlobalSign. Les navigateurs
# et curl comblent le trou en allant chercher l'intermédiaire eux-mêmes ;
# OpenSSL, non — la vérification échoue avec « unable to get local issuer
# certificate ». On fournit donc l'intermédiaire manquant, ce qui rétablit une
# chaîne complète : la vérification TLS reste entière, elle n'est pas contournée.
CERTS_DIR = Path(__file__).parent / "certs"

# Le serveur plafonne la taille de page ; on pagine au-delà.
PAGE_SIZE = 200
MAX_ROWS = 2000

# Conditions d'accès NADA, traduites pour être lisibles dans un tableau français.
ACCESS_LABELS = {
    "direct": "Téléchargement direct",
    "public": "Données publiques",
    "licensed": "Sous licence (demande à l'ANSD)",
    "remote": "Accès distant",
    "data_na": "Données non disponibles",
    "open": "Données ouvertes",
}

# Conditions sous lesquelles le fichier de microdonnées peut être récupéré
# automatiquement, sans démarche préalable auprès de l'ANSD.
ACCESS_TYPES_DOWNLOADABLE = {"direct", "public", "open"}

CONTACT_ANSD = "statsenegal@ansd.sn ; anads@ansd.sn"

# Formats de microdonnées que ce module sait mettre en table, par ordre de
# préférence quand plusieurs fichiers sont proposés pour la même enquête.
# .sav (SPSS) et les archives .rar sont volontairement absents : aucune
# dépendance du projet ne sait les lire sans bibliothèque supplémentaire.
_FORMAT_PRIORITY = [".csv", ".dta", ".xlsx", ".xls", ".zip"]


class AnadsError(RuntimeError):
    """Catalogue ANADS inaccessible ou réponse inexploitable."""


class AnadsAccessError(AnadsError):
    """La condition d'accès de l'enquête interdit une récupération automatique."""


def _ssl_context() -> ssl.SSLContext:
    """Contexte TLS vérifiant, complété des intermédiaires que le serveur omet."""
    context = ssl.create_default_context()
    if CERTS_DIR.is_dir():
        for pem in sorted(CERTS_DIR.glob("*.pem")):
            try:
                context.load_verify_locations(cafile=str(pem))
            except Exception:
                # Un certificat illisible ne doit pas empêcher les autres de servir.
                continue
    return context


def _get(path: str, params: dict[str, Any], timeout: int = DEFAULT_TIMEOUT) -> dict:
    url = f"{BASE_URL}/{path}"
    if params:
        url += f"?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(
        url, headers={"Accept": "application/json", "User-Agent": USER_AGENT}
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout, context=_ssl_context()) as response:
            return json.loads(response.read().decode("utf-8", errors="replace"))
    except Exception as exc:
        raise AnadsError(f"Catalogue ANADS inaccessible : {exc}") from exc


def _download(url: str, timeout: int = DEFAULT_TIMEOUT) -> tuple[bytes, str]:
    """Télécharge un fichier de ressource. Retourne le contenu et son type MIME."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=timeout, context=_ssl_context()) as response:
            content_type = response.headers.get("Content-Type", "")
            return response.read(), content_type
    except Exception as exc:
        raise AnadsError(f"Téléchargement du fichier impossible : {exc}") from exc


def _to_int(value: Any) -> int | None:
    """Convertit en ``int`` Python natif, JSON-sérialisable.

    ``pd.to_numeric`` sur un scalaire renvoie un ``numpy.int64``/``numpy.float64`` :
    FastAPI/Pydantic ne sait pas le sérialiser (``Unable to serialize unknown
    type``), il faut redescendre en type Python natif avant de le mettre dans
    une réponse JSON.
    """
    n = pd.to_numeric(value, errors="coerce")
    return None if pd.isna(n) else int(n)


def _row(raw: dict) -> dict[str, Any]:
    """Normalise une entrée du catalogue en colonnes françaises et typées."""
    title = str(raw.get("title") or "").strip()
    subtitle = str(raw.get("subtitle") or "").strip()
    return {
        "identifiant": raw.get("idno") or "",
        "titre": f"{title} — {subtitle}" if subtitle else title,
        "type": raw.get("type") or "",
        "producteur": raw.get("authoring_entity") or "",
        "pays": raw.get("nation") or "",
        "annee_debut": _to_int(raw.get("year_start")),
        "annee_fin": _to_int(raw.get("year_end")),
        "acces": ACCESS_LABELS.get(str(raw.get("form_model")), raw.get("form_model") or ""),
        "nb_variables": _to_int(raw.get("varcount")),
        "consultations": _to_int(raw.get("total_views")),
        "telechargements": _to_int(raw.get("total_downloads")),
        "url": raw.get("url") or "",
    }


def search(
    query: str = "", limit: int = MAX_ROWS, timeout: int = DEFAULT_TIMEOUT
) -> tuple[list[dict[str, Any]], int]:
    """Interroge le catalogue. Retourne les entrées normalisées et le total trouvé.

    ``query`` vide ramène l'intégralité du catalogue, dans la limite de ``limit``.
    """
    wanted = max(1, min(int(limit), MAX_ROWS))
    collected: list[dict[str, Any]] = []
    found = 0
    offset = 0

    while len(collected) < wanted:
        params: dict[str, Any] = {"ps": min(PAGE_SIZE, wanted - len(collected)), "page": offset // PAGE_SIZE + 1}
        if query.strip():
            params["sk"] = query.strip()
        payload = _get("catalog/search", params, timeout)

        result = payload.get("result")
        if not isinstance(result, dict):
            raise AnadsError("Réponse ANADS inattendue : bloc « result » absent.")

        found = int(pd.to_numeric(result.get("found"), errors="coerce") or 0)
        rows = result.get("rows") or []
        if not rows:
            break

        collected.extend(_row(r) for r in rows)
        offset += len(rows)
        if offset >= found:
            break

    return collected[:wanted], found


def catalog_dataframe(
    query: str = "", limit: int = MAX_ROWS, timeout: int = DEFAULT_TIMEOUT
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Construit la table du catalogue ANADS prête à être interrogée en SQL."""
    rows, found = search(query, limit=limit, timeout=timeout)
    if not rows:
        raise AnadsError("Aucune enquête ne correspond à cette recherche.")
    df = pd.DataFrame.from_records(rows)
    meta = {
        "source": "ANADS — Archive Nationale des Données du Sénégal (ANSD)",
        "query": query,
        "rows": len(df),
        "found": found,
        "columns": [str(c) for c in df.columns],
    }
    return df, meta


# ── Fiche descriptive ────────────────────────────────────────────────────────

def get_fiche(idno: str, timeout: int = DEFAULT_TIMEOUT) -> dict[str, Any]:
    """Récupère la fiche descriptive (métadonnées DDI) d'une enquête.

    C'est l'étape « choix de l'enquête → vérification des conditions d'accès » :
    la fiche porte ``data_access_type``, qui détermine si les microdonnées
    peuvent être récupérées automatiquement ou si elles doivent être demandées
    à l'ANSD.
    """
    payload = _get(f"catalog/{urllib.parse.quote(idno, safe='')}", {}, timeout)
    if payload.get("status") != "success" or "dataset" not in payload:
        raise AnadsError(f"Enquête introuvable dans ANADS : « {idno} ».")

    ds = payload["dataset"]
    study = ds.get("metadata", {}).get("study_desc", {})
    info = study.get("study_info", {})
    coll_dates = info.get("coll_dates") or [{}]
    contact = (study.get("distribution_statement", {}).get("contact") or [{}])[0]
    access_type = str(ds.get("data_access_type") or "")

    return {
        "idno": ds.get("idno") or idno,
        "titre": ds.get("title") or "",
        "producteur": ds.get("authoring_entity") or "",
        "annee_debut": ds.get("year_start"),
        "annee_fin": ds.get("year_end"),
        "access_type": access_type,
        "access_label": ACCESS_LABELS.get(access_type, access_type or "Non renseigné"),
        "access_downloadable": access_type in ACCESS_TYPES_DOWNLOADABLE,
        "resume": info.get("abstract") or "",
        "univers": info.get("universe") or "",
        "couverture_geo": info.get("geog_coverage") or "",
        "periode_collecte": {
            "debut": coll_dates[0].get("start"),
            "fin": coll_dates[0].get("end"),
        },
        "contact": contact.get("email") or CONTACT_ANSD,
        "url_catalogue": f"https://anads.ansd.sn/index.php/catalog/{ds.get('id', '')}",
    }


# ── Ressources (fichiers attachés) ───────────────────────────────────────────

def list_resources(idno: str, timeout: int = DEFAULT_TIMEOUT) -> list[dict[str, Any]]:
    """Liste les fichiers attachés à une enquête, microdonnées et documents confondus."""
    payload = _get(f"catalog/resources/{urllib.parse.quote(idno, safe='')}", {}, timeout)
    if payload.get("status") != "success":
        raise AnadsError(f"Ressources introuvables pour l'enquête « {idno} ».")

    resources = []
    for r in payload.get("resources") or []:
        filename = str(r.get("filename") or "")
        ext = Path(filename).suffix.lower()
        resources.append({
            "resource_id": r.get("resource_id") or "",
            "titre": r.get("title") or filename,
            "type": r.get("dctype") or "",
            "format": r.get("dcformat") or "",
            "filename": filename,
            "extension": ext,
            "is_microdata": "Microdata" in str(r.get("dctype") or ""),
            "supported": ext in _FORMAT_PRIORITY,
            "url": r.get("url") or "",
        })
    return resources


def _select_microdata_resource(
    resources: list[dict[str, Any]], resource_id: str = ""
) -> dict[str, Any]:
    """Choisit le fichier de microdonnées à récupérer.

    Si ``resource_id`` est fourni, ce fichier précis est utilisé — quitte à
    échouer plus loin s'il n'est pas d'un format supporté. Sinon, le meilleur
    candidat est choisi selon ``_FORMAT_PRIORITY`` : un CSV se lit sans risque
    d'ambiguïté, un fichier Stata (.dta) presque aussi bien, une archive .zip
    demande d'en ouvrir le contenu.
    """
    microdata = [r for r in resources if r["is_microdata"]]
    if not microdata:
        raise AnadsError("Cette enquête ne porte aucun fichier de microdonnées dans ANADS.")

    if resource_id:
        chosen = next((r for r in microdata if str(r["resource_id"]) == str(resource_id)), None)
        if chosen is None:
            raise AnadsError(f"Fichier « {resource_id} » introuvable parmi les microdonnées de l'enquête.")
        return chosen

    supported = [r for r in microdata if r["supported"]]
    if not supported:
        formats = ", ".join(sorted({r["extension"] or r["format"] for r in microdata})) or "inconnu"
        raise AnadsError(
            f"Aucun des fichiers de microdonnées n'est dans un format pris en charge "
            f"(formats disponibles : {formats}). Formats lus : "
            f"{', '.join(_FORMAT_PRIORITY)}."
        )
    supported.sort(key=lambda r: _FORMAT_PRIORITY.index(r["extension"]))
    return supported[0]


def _dataframe_from_bytes(content: bytes, filename: str) -> pd.DataFrame:
    """Parse un fichier de microdonnées selon son extension."""
    ext = Path(filename).suffix.lower()

    if ext == ".csv":
        sample = content[:4096].decode("utf-8", errors="replace")
        sep = ";" if sample.count(";") > sample.count(",") else ","
        return pd.read_csv(io.BytesIO(content), sep=sep)

    if ext == ".dta":
        return pd.read_stata(io.BytesIO(content))

    if ext in (".xlsx", ".xls"):
        return pd.read_excel(io.BytesIO(content))

    if ext == ".zip":
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            candidates = [
                n for n in archive.namelist()
                if Path(n).suffix.lower() in (".csv", ".dta", ".xlsx", ".xls")
                and not n.startswith("__MACOSX")
            ]
            if not candidates:
                raise AnadsError(
                    "L'archive ne contient aucun fichier .csv, .dta ou .xlsx exploitable."
                )
            # Le CSV/DTA le plus volumineux est presque toujours la table
            # principale ; les autres sont des annexes (dictionnaire de
            # variables, questionnaire...).
            candidates.sort(key=lambda n: archive.getinfo(n).file_size, reverse=True)
            inner = candidates[0]
            with archive.open(inner) as f:
                return _dataframe_from_bytes(f.read(), inner)

    raise AnadsError(f"Format de fichier non pris en charge : « {ext or filename} ».")


def fetch_microdata(
    idno: str, resource_id: str = "", timeout: int = DEFAULT_TIMEOUT
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Récupère les microdonnées d'une enquête, après vérification de l'accès.

    Lève ``AnadsAccessError`` — pas ``AnadsError`` — quand la condition d'accès
    de la fiche interdit une récupération automatique (enquête sous licence,
    en accès distant, ou données non disponibles). L'appelant peut ainsi
    distinguer « il faut demander l'accès à l'ANSD » d'une vraie panne réseau.
    """
    fiche = get_fiche(idno, timeout=timeout)
    if not fiche["access_downloadable"]:
        raise AnadsAccessError(
            f"« {fiche['titre']} » est en {fiche['access_label'].lower()} : "
            f"les microdonnées ne peuvent pas être récupérées automatiquement. "
            f"Demandez l'accès à l'ANSD ({fiche['contact']}) ou consultez la fiche : "
            f"{fiche['url_catalogue']}"
        )

    resources = list_resources(idno, timeout=timeout)
    resource = _select_microdata_resource(resources, resource_id)

    content, content_type = _download(resource["url"], timeout=timeout)
    if "text/html" in content_type.lower():
        raise AnadsError(
            f"Le fichier « {resource['filename']} » n'a pas pu être téléchargé "
            f"(le serveur ANADS a renvoyé une page d'erreur plutôt que le fichier)."
        )

    df = _dataframe_from_bytes(content, resource["filename"])
    if df.empty:
        raise AnadsError(f"Le fichier « {resource['filename']} » ne contient aucune donnée.")

    meta = {
        "idno": fiche["idno"],
        "titre": fiche["titre"],
        "access_type": fiche["access_type"],
        "access_label": fiche["access_label"],
        "resource_id": resource["resource_id"],
        "filename": resource["filename"],
        "rows": len(df),
        "columns": [str(c) for c in df.columns],
        "source": "ANADS — Archive Nationale des Données du Sénégal (ANSD)",
        "url_catalogue": fiche["url_catalogue"],
    }
    return df, meta
