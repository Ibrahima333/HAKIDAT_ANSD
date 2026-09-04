"""Couche service du pipeline Agentic BI.

Ce module orchestre le pipeline complet d'analyse :
1. Réception d'une question en langage naturel
2. Génération du schéma de la base ciblée
3. Génération SQL via LLM
4. Exécution de la requête et export CSV
5. Génération d'un script de visualisation (dataviz)
6. Exécution du script et production du graphique HTML
7. Génération du rapport Insights & Actions en Markdown

Il expose aussi les fonctions utilitaires pour lire/lister/supprimer
les résultats persistés sur disque.
"""

from __future__ import annotations

import contextlib
import hashlib
import io
import json
import os
import re
import shutil
import threading
import time
from pathlib import Path
from typing import Any

import pandas as pd

# Étapes du pipeline
from backend.scripts.generate_dataviz import generate_dataviz
from backend.scripts.generate_insights_actions import generate_insights_actions
from backend.scripts.generate_sql import generate_sql
from backend.scripts.run_analysis import execute_analysis
from backend.scripts.run_dataviz import run_dataviz_script
from backend.scripts.schema import generate_schema
from backend.utils.db_discovery import list_databases, list_schemas


# ── Répertoires de travail ────────────────────────────────────────────────────
REQUESTS_DIR = Path("requests")   # Fichiers .txt contenant les questions
SQL_DIR = Path("sql")             # Fichiers .sql générés par le LLM
DATAVIZ_DIR = Path("dataviz")     # Scripts Python de visualisation générés
OUTPUTS_DIR = Path("outputs")     # CSV, HTML, Markdown, metadata par analyse

# Providers LLM supportés par l'application
PROVIDERS = ["gemini", "groq"]


class PipelineServiceError(RuntimeError):
    """Levée quand le pipeline ne peut pas terminer une étape."""


# Un verrou par question_name — évite qu'un rafraîchissement automatique de
# graphique épinglé (refresh_pinned_chart) et une régénération manuelle
# ("Voir aussi" → regen_dataviz) écrivent/lisent en même temps les mêmes
# fichiers (CSV, script dataviz, HTML) pour la même analyse. Sans ça, l'un
# des deux peut lire un CSV à moitié réécrit par l'autre et échouer avec une
# erreur "Code de sortie 1" sans rapport apparent avec sa propre action —
# confirmé reproductible à 100% lors d'un test de charge concurrente.
_chart_locks: dict[str, threading.Lock] = {}
_chart_locks_guard = threading.Lock()


def _get_chart_lock(question_name: str) -> threading.Lock:
    with _chart_locks_guard:
        lock = _chart_locks.get(question_name)
        if lock is None:
            lock = threading.Lock()
            _chart_locks[question_name] = lock
        return lock


def validate_question(question_text: str) -> dict[str, Any]:
    """Valide heuristiquement une question avant de lancer le pipeline.

    Retourne {"valid": True} ou {"valid": False, "reason": "..."}.
    """
    q = question_text.strip()

    if len(q) < 5:
        return {"valid": False, "reason": "La question est trop courte. Pose une vraie question sur tes données."}

    # Ratio de caractères alphabétiques — trop faible = charabia
    alpha_count = sum(1 for c in q if c.isalpha())
    if len(q) > 0 and alpha_count / len(q) < 0.4:
        return {"valid": False, "reason": "La question contient trop de caractères non alphabétiques. Reformule en langage naturel."}

    # Détecte les suites de touches aléatoires (ex: "azerty", "qsdfgh", "kjhgfd")
    words = re.findall(r"[a-zA-ZÀ-ÿ]{3,}", q)
    if words:
        # Vérifie si tous les mots sont des séquences de consonnes sans voyelle
        vowels = set("aeiouAEIOUàâéèêëîïôùûüÀÂÉÈÊËÎÏÔÙÛÜ")
        gibberish_words = [w for w in words if not any(c in vowels for c in w) and len(w) >= 4]
        if len(gibberish_words) >= len(words) * 0.7:
            return {"valid": False, "reason": "La question semble être du texte aléatoire. Pose une vraie question métier."}

    return {"valid": True}


# ── Utilitaires ───────────────────────────────────────────────────────────────

def slugify(value: str) -> str:
    """Convertit une chaîne en identifiant sans espaces ni caractères spéciaux."""
    normalized = re.sub(r"[^a-zA-Z0-9]+", "_", value.strip().lower())
    normalized = normalized.strip("_")
    return normalized or "analysis"


_STEP_LABELS: dict[str, str] = {
    "Schema generation":      "Lecture du schéma de la base de données",
    "SQL generation":         "Génération SQL",
    "SQL execution":          "Exécution de la requête SQL",
    "Dataviz generation":     "Génération de la visualisation",
    "Dataviz execution":      "Exécution du script de visualisation",
    "Dataviz regeneration":   "Régénération de la visualisation",
    "Insights generation":    "Génération du rapport d'analyse",
}

_FRIENDLY_PATTERNS: list[tuple[str, str]] = [
    # LLM rate limits / quota
    ("Limite de quota Groq",    "{msg}"),
    ("Quota Gemini atteint",    "{msg}"),
    # LLM API key errors
    ("Clé API Groq",            "{msg}"),
    ("Clé API Gemini",          "{msg}"),
    ("Groq non configurée",     "{msg}"),
    ("Gemini non configurée",   "{msg}"),
    # DB connectivity
    ("Impossible de joindre le serveur MySQL", "{msg}"),
    ("Impossible de se connecter au serveur MySQL", "{msg}"),
    ("Accès refusé",            "{msg}"),
    ("n'existe pas sur le serveur", "{msg}"),
    ("Erreur MySQL",            "{msg}"),
    # LLM connectivity
    ("Impossible de joindre",   "{msg}"),
    ("n'a pas répondu à temps", "{msg}"),
    ("temporairement indisponible", "{msg}"),
    # SQL execution errors
    ("OperationalError",  "Erreur SQL : la requête a échoué. La question ne correspond peut-être pas à la structure de vos données."),
    ("ProgrammingError",  "Erreur SQL : la requête générée contient une erreur de syntaxe. Reformulez votre question."),
    ("no such table",     "Erreur SQL : table introuvable. Vérifiez que la base de données est bien connectée."),
    ("no such column",    "Erreur SQL : colonne introuvable. La question fait peut-être référence à un champ inexistant."),
    ("syntax error",      "Erreur SQL : syntaxe incorrecte dans la requête générée. Reformulez votre question."),
    # Dataviz script crash
    ("SyntaxError",       "Le script de visualisation contient une erreur. Réessayez ou changez de modèle LLM."),
    ("ModuleNotFoundError", "Un module Python est manquant dans l'environnement. Contactez l'administrateur."),
    # Schema
    ("schéma",            "{msg}"),
    ("schema",            "{msg}"),
    # Generic LLM failure
    ("Erreur API Groq",   "{msg}"),
    ("Erreur API Gemini", "{msg}"),
]


def _friendly_error(step_name: str, raw: str) -> str:
    """Transforme un message d'erreur technique en message lisible par l'utilisateur."""
    label = _STEP_LABELS.get(step_name, step_name)
    raw_lower = raw.lower()
    for pattern, template in _FRIENDLY_PATTERNS:
        if pattern.lower() in raw_lower:
            # Trouver la ligne qui contient le pattern pour l'afficher directement
            matching_line = next(
                (line.strip() for line in raw.splitlines() if pattern.lower() in line.lower()),
                raw.split("\n")[0],
            )
            msg = template.format(msg=matching_line) if "{msg}" in template else template
            return f"{label} — {msg}"
    # Fallback : première ligne non vide du output
    first_line = next((l.strip() for l in raw.splitlines() if l.strip()), raw[:200])
    return f"{label} — {first_line}"


def capture_step(step_name: str, func: Any, *args: Any, **kwargs: Any) -> str:
    """Exécute une étape du pipeline et capture stdout/stderr dans une chaîne.

    En cas d'erreur (exception ou sys.exit), lève PipelineServiceError
    avec un message lisible par l'utilisateur.
    """
    buffer = io.StringIO()
    try:
        with contextlib.redirect_stdout(buffer), contextlib.redirect_stderr(buffer):
            func(*args, **kwargs)
    except SystemExit as exc:
        output = buffer.getvalue().strip()
        raise PipelineServiceError(_friendly_error(step_name, output or f"Code de sortie {exc.code}")) from exc
    except Exception as exc:
        output = buffer.getvalue().strip()
        combined = f"{exc}\n{output}".strip()
        raise PipelineServiceError(_friendly_error(step_name, combined)) from exc
    return buffer.getvalue().strip()


def build_question_name(question_text: str, requested_name: str, overwrite_existing: bool) -> str:
    """Détermine le nom unique de l'artefact pour une question donnée.

    - Si un nom est fourni manuellement, il est utilisé tel quel (slugifié).
    - Sinon, le nom est dérivé automatiquement des 80 premiers caractères.
    - Un suffixe numérique (_2, _3…) est ajouté si le nom est déjà pris.
    """
    if requested_name.strip():
        question_name = slugify(requested_name)
        request_file = REQUESTS_DIR / f"{question_name}.txt"
        if request_file.exists() and not overwrite_existing:
            raise PipelineServiceError(
                f"Le nom '{question_name}' existe déjà. Activez l'écrasement ou choisissez un autre nom."
            )
        return question_name

    # Nom automatique basé sur la question
    base_name = slugify(question_text[:80])
    request_file = REQUESTS_DIR / f"{base_name}.txt"
    if not request_file.exists() or overwrite_existing:
        return base_name

    # Ajout d'un suffixe numérique pour éviter les doublons
    suffix = 2
    while True:
        candidate = f"{base_name}_{suffix}"
        if not (REQUESTS_DIR / f"{candidate}.txt").exists():
            return candidate
        suffix += 1


def write_request_file(question_name: str, question_text: str, overwrite_existing: bool) -> Path:
    """Écrit la question en langage naturel dans un fichier .txt dans REQUESTS_DIR."""
    REQUESTS_DIR.mkdir(exist_ok=True)
    request_file = REQUESTS_DIR / f"{question_name}.txt"
    if request_file.exists() and not overwrite_existing:
        raise PipelineServiceError(f"Fichier de requête déjà existant : {request_file}")
    request_file.write_text(question_text.strip(), encoding="utf-8")
    return request_file


def validate_file(path: Path, label: str) -> None:
    """Vérifie qu'un fichier existe et n'est pas vide (pour les fichiers texte).

    Lève PipelineServiceError si la vérification échoue.
    """
    if not path.exists():
        raise PipelineServiceError(f"{label} n'a pas été généré : {path}")
    if path.suffix in {".sql", ".py", ".md", ".html"} and not path.read_text(encoding="utf-8").strip():
        raise PipelineServiceError(f"{label} est vide : {path}")


def dataframe_to_records(dataframe: pd.DataFrame) -> list[dict[str, Any]]:
    """Convertit un DataFrame pandas en liste de dicts JSON-sérialisables.

    Les valeurs NaN sont remplacées par None pour éviter les erreurs JSON.
    """
    safe_dataframe = dataframe.where(pd.notnull(dataframe), None)
    return safe_dataframe.to_dict(orient="records")


def normalize_dtype(dtype: Any) -> str:
    """Convertit un dtype pandas en type SQL simplifié (INTEGER, FLOAT, etc.)."""
    dtype_name = str(dtype).lower()
    if "int" in dtype_name:
        return "INTEGER"
    if "float" in dtype_name or "double" in dtype_name:
        return "FLOAT"
    if "bool" in dtype_name:
        return "BOOLEAN"
    if "datetime" in dtype_name:
        return "DATETIME"
    return "TEXT"


def build_metadata(
    metadata_path: Path,
    dataframe: pd.DataFrame,
    execution_time_ms: int,
    sql_text: str,
) -> dict[str, Any]:
    """Construit le dictionnaire de métadonnées enrichi pour un résultat d'analyse."""
    raw_metadata = json.loads(metadata_path.read_text(encoding="utf-8"))

    # Informations de colonnes avec types normalisés pour le frontend
    columns = [
        {"name": column_name, "type": normalize_dtype(dataframe[column_name].dtype)}
        for column_name in dataframe.columns
    ]

    return {
        "question": raw_metadata.get("question"),
        "rows_returned": raw_metadata.get("rows_returned", len(dataframe)),
        # Présent uniquement quand la requête n'a rien retourné et que la cause
        # a pu être identifiée (tables vides) — voir run_analysis.diagnose_empty_result
        "empty_reason": raw_metadata.get("empty_reason"),
        "columns": columns,
        "sql_file": raw_metadata.get("sql_file"),
        "database": raw_metadata.get("database"),
        "schema": raw_metadata.get("schema"),
        "execution_time_ms": execution_time_ms,
        # Hash SHA-256 tronqué pour identifier la requête de façon unique
        "query_hash": hashlib.sha256(sql_text.encode("utf-8")).hexdigest()[:20],
    }


# ── Pipeline principal ────────────────────────────────────────────────────────

def run_pipeline(
    question_text: str,
    artifact_name: str,
    database_name: str,
    schema_name: str,
    provider_name: str,
    overwrite_existing: bool,
) -> dict[str, Any]:
    """Orchestre le pipeline complet d'analyse BI en 6 étapes.

    Étapes :
    1. Validation des paramètres d'entrée
    2. Génération du nom et écriture du fichier de requête
    3. Génération du schéma de la base de données
    4. Génération SQL via LLM → validation
    5. Exécution SQL → CSV + metadata → validation
    6. Génération dataviz → HTML → validation
    7. Génération insights → Markdown → validation
    8. Sauvegarde des logs et contexte d'exécution
    """
    # Validation des paramètres obligatoires
    if not question_text.strip():
        raise PipelineServiceError("questionText est obligatoire.")
    if not database_name.strip():
        raise PipelineServiceError("databaseName est obligatoire.")
    if not schema_name.strip():
        raise PipelineServiceError("schemaName est obligatoire.")
    if provider_name not in PROVIDERS:
        raise PipelineServiceError(
            f"Le provider IA \"{provider_name}\" n'est pas reconnu. "
            f"Vérifiez votre configuration : seuls Gemini et Groq sont supportés. "
            f"Allez dans Paramètres → Modèle IA et sélectionnez un provider valide."
        )

    # Détermination des chemins de fichiers pour cet artefact
    question_name = build_question_name(question_text, artifact_name, overwrite_existing)
    request_file = write_request_file(question_name, question_text, overwrite_existing)
    sql_file = SQL_DIR / f"{question_name}.sql"
    csv_file = OUTPUTS_DIR / question_name / f"{question_name}.csv"
    metadata_file = OUTPUTS_DIR / question_name / "metadata.json"
    dataviz_file = DATAVIZ_DIR / f"{question_name}.py"
    html_file = OUTPUTS_DIR / question_name / f"{question_name}.html"

    logs: list[str] = []

    # Étape 1 : Génération du schéma de la base de données (fichier .md)
    logs.append(capture_step("Schema generation", generate_schema, database_name, schema_name))

    # Étape 2 : Génération du SQL via LLM
    logs.append(capture_step("SQL generation", generate_sql, request_file, database_name, schema_name, provider_name))
    validate_file(sql_file, "Fichier SQL")

    # Vérification de sécurité : bloquer tout SQL non-SELECT
    _raw_sql = sql_file.read_text(encoding="utf-8").strip()
    _first_word = _raw_sql.lstrip("( \t\n").split()[0].upper() if _raw_sql.split() else ""
    if _first_word not in {"SELECT", "WITH", "EXPLAIN"}:
        raise PipelineServiceError(
            f"Requête non autorisée ({_first_word}). Seules les requêtes SELECT sont permises."
        )

    # Étape 3 : Exécution de la requête SQL (mesure du temps d'exécution)
    execution_start = time.perf_counter()
    logs.append(capture_step("SQL execution", execute_analysis, sql_file, database_name, schema_name))
    execution_time_ms = int((time.perf_counter() - execution_start) * 1000)

    validate_file(csv_file, "Sortie CSV")
    validate_file(metadata_file, "Fichier metadata")

    # Étape 4 : Génération du script de visualisation Python
    logs.append(capture_step("Dataviz generation", generate_dataviz, request_file, provider_name))
    validate_file(dataviz_file, "Script dataviz")

    # Étape 5 : Exécution du script dataviz pour produire le graphique HTML
    logs.append(capture_step("Dataviz execution", run_dataviz_script, dataviz_file))
    validate_file(html_file, "Graphique HTML")

    # Étape 6 : Rapport Insights & Actions — génération différée (lazy).
    # Économise un appel LLM par question tant que personne n'ouvre l'onglet
    # "Rapport" : beaucoup d'utilisateurs ne regardent que le graphique/KPI.
    # Voir generate_report() plus bas, appelée à la demande depuis le frontend.

    # Sauvegarde des logs et du contexte d'exécution pour consultation ultérieure
    logs_text = "\n\n".join(log for log in logs if log)
    context_path = OUTPUTS_DIR / question_name / "backend_context.json"
    logs_path = OUTPUTS_DIR / question_name / "logs.txt"
    context_path.write_text(
        json.dumps(
            {
                "provider_name": provider_name,
                "execution_time_ms": execution_time_ms,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    logs_path.write_text(logs_text, encoding="utf-8")

    return load_result(question_name, execution_time_ms, logs_text)


# ── Chargement des résultats ──────────────────────────────────────────────────

def load_result(
    question_name: str,
    execution_time_ms: int | None = None,
    log_output: str | None = None,
) -> dict[str, Any]:
    """Charge tous les artefacts d'un résultat depuis le disque et les retourne en dict.

    Si execution_time_ms ou log_output ne sont pas fournis, ils sont lus depuis
    les fichiers persistés (backend_context.json et logs.txt).
    """
    # Chemins des artefacts attendus
    request_file = REQUESTS_DIR / f"{question_name}.txt"
    sql_file = SQL_DIR / f"{question_name}.sql"
    csv_file = OUTPUTS_DIR / question_name / f"{question_name}.csv"
    metadata_file = OUTPUTS_DIR / question_name / "metadata.json"
    html_file = OUTPUTS_DIR / question_name / f"{question_name}.html"
    markdown_file = OUTPUTS_DIR / question_name / f"{question_name}.md"
    context_file = OUTPUTS_DIR / question_name / "backend_context.json"
    logs_file = OUTPUTS_DIR / question_name / "logs.txt"

    # Validation de la présence de tous les artefacts obligatoires
    validate_file(request_file, "Fichier de requête")
    validate_file(sql_file, "Fichier SQL")
    validate_file(csv_file, "Sortie CSV")
    validate_file(metadata_file, "Fichier metadata")
    validate_file(html_file, "Graphique HTML")
    # Rapport Markdown : généré à la demande (voir generate_report) — absent
    # tant que l'utilisateur n'a pas ouvert l'onglet "Rapport", donc pas de
    # validate_file ici, une chaîne vide signale au frontend qu'il reste à générer.

    # Lecture des données depuis le disque
    sql_text = sql_file.read_text(encoding="utf-8")
    dataframe = pd.read_csv(csv_file)
    context = {}
    if context_file.exists():
        context = json.loads(context_file.read_text(encoding="utf-8"))

    # Temps d'exécution : paramètre en mémoire ou valeur persistée sur disque
    resolved_execution_time_ms = execution_time_ms
    if resolved_execution_time_ms is None:
        resolved_execution_time_ms = int(context.get("execution_time_ms", 0))

    metadata = build_metadata(metadata_file, dataframe, resolved_execution_time_ms, sql_text)
    html_content = html_file.read_text(encoding="utf-8")
    report_text = markdown_file.read_text(encoding="utf-8") if markdown_file.exists() else ""

    # Timestamp basé sur la date de modification du fichier de requête
    timestamp = int(request_file.stat().st_mtime * 1000)

    # Logs : paramètre, fichier disque, ou message par défaut
    resolved_logs = log_output
    if resolved_logs is None and logs_file.exists():
        resolved_logs = logs_file.read_text(encoding="utf-8")
    if resolved_logs is None:
        resolved_logs = f"Artefacts chargés depuis outputs/{question_name}/"

    # Parse viz suggestions from first line of generated dataviz script
    viz_type = None
    viz_alternatives: list[str] = []
    dataviz_py = DATAVIZ_DIR / f"{question_name}.py"
    if dataviz_py.exists():
        first_line = dataviz_py.read_text(encoding="utf-8").splitlines()[0] if dataviz_py.stat().st_size > 0 else ""
        m = re.match(r"#\s*VIZ_TYPE:\s*([^|]+?)(?:\s*\|\s*VIZ_ALT:\s*(.+))?$", first_line.strip())
        if m:
            viz_type = m.group(1).strip()
            if m.group(2):
                viz_alternatives = [a.strip() for a in m.group(2).split(",") if a.strip()]

    return {
        "id": question_name,
        "questionName": question_name,
        "questionText": request_file.read_text(encoding="utf-8").strip(),
        "databaseName": metadata["database"],
        "schemaName": metadata["schema"],
        "providerName": context.get("provider_name", "unknown"),
        "sql": sql_text,
        "csvData": dataframe_to_records(dataframe),
        "metadata": metadata,
        "report": report_text,
        "logs": resolved_logs,
        "timestamp": timestamp,
        "chartHtml": html_content,
        "vizType": viz_type,
        "vizAlternatives": viz_alternatives,
        # URLs des artefacts téléchargeables depuis le frontend
        "artifactUrls": {
            "sql": f"/api/artifacts/{question_name}/sql",
            "csv": f"/api/artifacts/{question_name}/csv",
            "metadata": f"/api/artifacts/{question_name}/metadata",
            "chart": f"/api/artifacts/{question_name}/chart",
            "report": f"/api/artifacts/{question_name}/report",
            "logs": f"/api/artifacts/{question_name}/logs",
        },
    }


def regen_dataviz(question_name: str, chart_type: str, provider_name: str) -> dict[str, Any]:
    """Régénère uniquement le dataviz d'une analyse existante avec un type de graphique forcé."""
    request_file = REQUESTS_DIR / f"{question_name}.txt"
    if not request_file.exists():
        raise PipelineServiceError(f"Analyse introuvable : {question_name}")

    dataviz_file = DATAVIZ_DIR / f"{question_name}.py"
    html_file = OUTPUTS_DIR / question_name / f"{question_name}.html"

    # Verrou par question_name : évite une collision avec un rafraîchissement
    # automatique (refresh_pinned_chart) qui écrirait le CSV pendant que ce
    # script lit/régénère les mêmes fichiers.
    with _get_chart_lock(question_name):
        capture_step(
            "Dataviz regeneration",
            generate_dataviz,
            request_file,
            provider_name,
            chart_type,
        )
        validate_file(dataviz_file, "Script dataviz")
        capture_step("Dataviz execution", run_dataviz_script, dataviz_file)
        validate_file(html_file, "Graphique HTML")

    return load_result(question_name)


def refresh_pinned_chart(question_name: str, database_name: str, sql_query: str) -> str:
    """Ré-exécute la requête SQL d'un graphique épinglé au dashboard et
    régénère son HTML — sans appel LLM : le script de dataviz existant
    (dataviz/{question_name}.py) est simplement ré-exécuté sur les données
    fraîches, comme pour un rafraîchissement de KPI mais avec un rendu
    graphique en plus.
    """
    import csv

    from backend.utils.db_utils import run_query

    dataviz_file = DATAVIZ_DIR / f"{question_name}.py"
    if not dataviz_file.exists():
        raise PipelineServiceError(
            f"Script de visualisation introuvable pour {question_name} — "
            "désépinglez ce graphique et réépinglez-le depuis l'onglet Analyse."
        )

    # La requête SQL elle-même n'a pas besoin du verrou (aucun fichier
    # partagé touché) — seule l'écriture CSV + régénération HTML doit être
    # exclusive vis-à-vis d'une régénération manuelle (regen_dataviz).
    columns, rows = run_query(sql_query, database_name)

    out_dir = OUTPUTS_DIR / question_name
    out_dir.mkdir(parents=True, exist_ok=True)
    csv_path = out_dir / f"{question_name}.csv"
    html_file = out_dir / f"{question_name}.html"

    with _get_chart_lock(question_name):
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(columns)
            writer.writerows(rows)

        capture_step("Dataviz refresh", run_dataviz_script, dataviz_file)
        validate_file(html_file, "Graphique HTML")
        return html_file.read_text(encoding="utf-8")


def generate_report(question_name: str, provider_name: str) -> dict[str, Any]:
    """Génère le rapport Insights & Actions d'une analyse existante, à la
    demande (quand l'utilisateur ouvre l'onglet "Rapport") plutôt que
    systématiquement à chaque question — économise un appel LLM par analyse
    que personne ne consulte jamais.
    """
    request_file = REQUESTS_DIR / f"{question_name}.txt"
    if not request_file.exists():
        raise PipelineServiceError(f"Analyse introuvable : {question_name}")

    markdown_file = OUTPUTS_DIR / question_name / f"{question_name}.md"

    capture_step("Insights generation", generate_insights_actions, request_file, provider_name)
    validate_file(markdown_file, "Rapport Markdown")

    return load_result(question_name)


def list_available_results() -> list[dict[str, Any]]:
    """Retourne la liste des analyses disponibles, triées de la plus récente à la plus ancienne."""
    results: list[dict[str, Any]] = []
    for output_dir in sorted(OUTPUTS_DIR.glob("*"), key=lambda path: path.stat().st_mtime, reverse=True):
        if not output_dir.is_dir():
            continue

        question_name = output_dir.name
        request_file = REQUESTS_DIR / f"{question_name}.txt"
        metadata_file = output_dir / "metadata.json"

        # On ignore les dossiers sans fichier de requête ou de metadata
        if not request_file.exists() or not metadata_file.exists():
            continue

        metadata = json.loads(metadata_file.read_text(encoding="utf-8"))
        context_file = output_dir / "backend_context.json"
        context = {}
        if context_file.exists():
            context = json.loads(context_file.read_text(encoding="utf-8"))

        results.append(
            {
                "id": question_name,
                "questionName": question_name,
                "questionText": request_file.read_text(encoding="utf-8").strip(),
                "databaseName": metadata.get("database"),
                "schemaName": metadata.get("schema"),
                "providerName": context.get("provider_name", "unknown"),
                "timestamp": int(request_file.stat().st_mtime * 1000),
            }
        )
    return results


def delete_result(question_name: str) -> dict[str, str]:
    """Supprime les artefacts d'une seule analyse."""
    request_file = REQUESTS_DIR / f"{question_name}.txt"
    sql_file = SQL_DIR / f"{question_name}.sql"
    dataviz_file = DATAVIZ_DIR / f"{question_name}.py"
    output_dir = OUTPUTS_DIR / question_name

    for file_path in (request_file, sql_file, dataviz_file):
        if file_path.exists():
            file_path.unlink()
    if output_dir.exists():
        shutil.rmtree(output_dir)

    return {"status": "success", "message": f"Analyse '{question_name}' supprimée"}


def clear_history() -> dict[str, str]:
    """Supprime tous les artefacts générés (requests, sql, dataviz, outputs)."""
    for result in list_available_results():
        question_name = result["questionName"]
        request_file = REQUESTS_DIR / f"{question_name}.txt"
        sql_file = SQL_DIR / f"{question_name}.sql"
        dataviz_file = DATAVIZ_DIR / f"{question_name}.py"
        output_dir = OUTPUTS_DIR / question_name

        # Suppression des fichiers individuels
        for file_path in (request_file, sql_file, dataviz_file):
            if file_path.exists():
                file_path.unlink()

        # Suppression récursive du dossier de sortie
        if output_dir.exists():
            shutil.rmtree(output_dir)

    return {"status": "success", "message": "Historique supprimé"}


def get_config(
    database_name: str | None = None,
    allowed_databases: list[str] | None = None,
) -> dict[str, Any]:
    """Retourne la configuration complète : bases, schémas, providers, sélections par défaut.

    ``allowed_databases`` restreint la liste aux bases autorisées pour l'appelant.
    """
    from backend.repositories import llm_config as llm_config_repo

    databases = allowed_databases if allowed_databases is not None else list_databases()
    # Une base demandée hors périmètre autorisé ne doit jamais être sélectionnée
    selected_database = (
        database_name if database_name in databases
        else (databases[0] if databases else "")
    )
    schemas = list_schemas(selected_database) if selected_database else []

    # Sélectionner le premier provider configuré (disponible) au lieu de toujours "gemini"
    available_providers = llm_config_repo.get_available_providers()
    selected_provider = available_providers[0] if available_providers else PROVIDERS[0]

    return {
        "databases": databases,
        "schemas": schemas,
        "providers": PROVIDERS,
        "selectedDatabase": selected_database,
        "selectedSchema": schemas[0] if schemas else "",
        "selectedProvider": selected_provider,
    }


def get_artifact_path(question_name: str, artifact_type: str) -> tuple[Path, str]:
    """Retourne le chemin et le type MIME d'un artefact donné.

    Lève PipelineServiceError si le type d'artefact est inconnu.
    """
    # Table de correspondance : type d'artefact → (chemin, type MIME)
    artifact_map = {
        "sql": (SQL_DIR / f"{question_name}.sql", "text/sql"),
        "csv": (OUTPUTS_DIR / question_name / f"{question_name}.csv", "text/csv"),
        "metadata": (OUTPUTS_DIR / question_name / "metadata.json", "application/json"),
        "chart": (OUTPUTS_DIR / question_name / f"{question_name}.html", "text/html"),
        "report": (OUTPUTS_DIR / question_name / f"{question_name}.md", "text/markdown"),
        "logs": (OUTPUTS_DIR / question_name / "logs.txt", "text/plain"),
    }
    if artifact_type not in artifact_map:
        raise PipelineServiceError(f"Type d'artefact non supporté : {artifact_type}")
    return artifact_map[artifact_type]


def default_cors_origins() -> list[str]:
    """Retourne la liste des origines CORS autorisées depuis les variables d'environnement.

    Inclut automatiquement la variante HTTPS de l'origine principale pour couvrir
    le frontend servi en TLS (Nginx avec certificat auto-signé ou Let's Encrypt).
    """
    # FRONTEND_ORIGIN : origine principale du frontend (dev ou production)
    frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
    # FRONTEND_CORS_ORIGINS : origines supplémentaires séparées par des virgules
    additional = os.getenv("FRONTEND_CORS_ORIGINS", "")

    origins = [frontend_origin]

    # Ajouter automatiquement la variante HTTPS si l'origine principale est HTTP
    # (couvre le frontend HTTPS sans avoir à changer FRONTEND_ORIGIN dans .env)
    if frontend_origin.startswith("http://"):
        https_variant = "https://" + frontend_origin[len("http://"):]
        origins.append(https_variant)

    # Origines Vite dev (toujours utiles en développement local)
    for dev_port in ("5173", "5174"):
        origins.append(f"http://localhost:{dev_port}")
        origins.append(f"https://localhost:{dev_port}")

    if additional.strip():
        origins.extend(origin.strip() for origin in additional.split(",") if origin.strip())

    return origins
