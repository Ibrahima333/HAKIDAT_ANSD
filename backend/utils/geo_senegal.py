"""Répertoire géographique du Sénégal et enrichissement des résultats d'analyse.

Les données statistiques publiques sont agrégées par territoire — région,
département, commune — et non géolocalisées au point. Elles ne contiennent donc
jamais de colonnes ``latitude`` / ``longitude``, alors que la couche de
visualisation en a besoin pour produire une carte.

Ce module comble l'écart : il détecte une colonne de territoire dans un résultat
de requête, la rapproche du répertoire ci-dessous, et injecte les coordonnées
correspondantes. La règle carte du prompt de dataviz s'applique alors sans
modification.

Précision des coordonnées : centroïde approximatif pour les régions, position du
chef-lieu pour les départements. Suffisant pour situer une bulle sur une carte,
insuffisant pour un calcul de distance.
"""

from __future__ import annotations

import unicodedata
from typing import Any, Iterable, Sequence

# Régions (14) — centroïde approximatif
REGIONS: dict[str, tuple[float, float]] = {
    "Dakar": (14.75, -17.30),
    "Thiès": (14.79, -16.93),
    "Diourbel": (14.73, -16.15),
    "Fatick": (14.20, -16.30),
    "Kaolack": (14.05, -16.00),
    "Kaffrine": (14.05, -15.35),
    "Louga": (15.55, -15.50),
    "Saint-Louis": (16.25, -15.60),
    "Matam": (15.45, -13.60),
    "Tambacounda": (13.65, -13.30),
    "Kédougou": (12.75, -12.30),
    "Kolda": (12.95, -14.60),
    "Sédhiou": (12.85, -15.60),
    "Ziguinchor": (12.70, -16.20),
}

# Départements et principales villes — position du chef-lieu
DEPARTEMENTS: dict[str, tuple[float, float]] = {
    # Dakar
    "Dakar": (14.6928, -17.4467),
    "Pikine": (14.7549, -17.3906),
    "Guédiawaye": (14.7667, -17.4056),
    "Rufisque": (14.7167, -17.2667),
    "Keur Massar": (14.7833, -17.3167),
    # Thiès
    "Thiès": (14.7886, -16.9260),
    "Mbour": (14.4198, -16.9646),
    "Tivaouane": (14.9500, -16.8167),
    # Diourbel
    "Diourbel": (14.6556, -16.2314),
    "Mbacké": (14.7906, -15.9086),
    "Touba": (14.8500, -15.8833),
    "Bambey": (14.7000, -16.4667),
    # Fatick
    "Fatick": (14.3333, -16.4167),
    "Foundiougne": (14.1333, -16.4667),
    "Gossas": (14.4833, -16.0667),
    # Kaolack
    "Kaolack": (14.1500, -16.0667),
    "Guinguinéo": (14.2667, -15.9500),
    "Nioro du Rip": (13.7500, -15.8000),
    # Kaffrine
    "Kaffrine": (14.1058, -15.5506),
    "Birkelane": (14.1333, -15.7000),
    "Koungheul": (13.9833, -14.8000),
    "Malem Hodar": (14.1167, -15.3000),
    # Louga
    "Louga": (15.6144, -16.2264),
    "Kébémer": (15.3667, -16.4500),
    "Linguère": (15.3928, -15.1194),
    # Saint-Louis
    "Saint-Louis": (16.0179, -16.4896),
    "Dagana": (16.5167, -15.5000),
    "Podor": (16.6500, -14.9667),
    "Richard-Toll": (16.4625, -15.7008),
    # Matam
    "Matam": (15.6559, -13.2554),
    "Kanel": (15.4919, -13.1783),
    "Ranérou": (15.3000, -13.9667),
    # Tambacounda
    "Tambacounda": (13.7708, -13.6672),
    "Bakel": (14.9000, -12.4667),
    "Goudiry": (14.1833, -12.7167),
    "Koumpentoum": (13.9833, -14.5500),
    # Kédougou
    "Kédougou": (12.5556, -12.1794),
    "Salémata": (12.6333, -12.8167),
    "Saraya": (12.8333, -11.7667),
    # Kolda
    "Kolda": (12.8833, -14.9500),
    "Vélingara": (13.1500, -14.1167),
    "Médina Yoro Foulah": (13.0333, -14.7333),
    # Sédhiou
    "Sédhiou": (12.7081, -15.5569),
    "Bounkiling": (13.0500, -15.7000),
    "Goudomp": (12.5833, -15.8833),
    # Ziguinchor
    "Ziguinchor": (12.5833, -16.2719),
    "Bignona": (12.8103, -16.2264),
    "Oussouye": (12.4850, -16.5464),
}

# Le département l'emporte quand un nom désigne les deux (Dakar, Thiès, Kolda…) :
# les coordonnées du chef-lieu sont plus parlantes qu'un centroïde régional.
GAZETTEER: dict[str, tuple[float, float]] = {**REGIONS, **DEPARTEMENTS}

# Noms de colonnes qui désignent explicitement un territoire
_TERRITORY_HINTS = (
    "region", "regions", "departement", "departements", "commune", "communes",
    "ville", "villes", "localite", "localites", "zone", "territoire",
    "arrondissement", "chef_lieu", "cheflieu", "lieu", "geo", "ref_area",
)

# Colonnes déjà géographiques : si elles sont présentes, ne rien injecter
_COORD_NAMES = ("lat", "latitude", "lon", "long", "longitude", "lng")

_MIN_MATCH_RATIO = 0.6


def normalize(value: Any) -> str:
    """Réduit un libellé à sa forme comparable : sans accent, sans ponctuation."""
    text = unicodedata.normalize("NFKD", str(value))
    text = "".join(c for c in text if not unicodedata.combining(c))
    return "".join(c for c in text.lower() if c.isalnum())


_INDEX: dict[str, tuple[float, float]] = {normalize(k): v for k, v in GAZETTEER.items()}


def lookup(name: Any) -> tuple[float, float] | None:
    """Retourne les coordonnées d'un territoire sénégalais, ou ``None``."""
    if name is None:
        return None
    return _INDEX.get(normalize(name))


def has_coordinates(columns: Sequence[str]) -> bool:
    """Indique si le résultat porte déjà des coordonnées exploitables."""
    normalized = {normalize(c) for c in columns}
    return any(c in normalized for c in _COORD_NAMES)


def detect_territory_column(
    columns: Sequence[str], rows: Iterable[Sequence[Any]]
) -> int | None:
    """Repère la colonne contenant des noms de territoires sénégalais.

    Le choix se fait sur les valeurs, pas sur le nom de la colonne : une colonne
    nommée ``libelle`` remplie de noms de régions est un meilleur candidat qu'une
    colonne ``zone`` remplie de codes. Le nom ne sert qu'à départager deux
    colonnes qui reconnaissent autant de valeurs l'une que l'autre.
    """
    materialized = [list(r) for r in rows]
    if not materialized:
        return None

    best: tuple[float, int, int] | None = None
    for idx, col_name in enumerate(columns):
        values = [r[idx] for r in materialized if idx < len(r) and r[idx] is not None]
        if not values:
            continue
        matched = sum(1 for v in values if normalize(v) in _INDEX)
        ratio = matched / len(values)
        if ratio < _MIN_MATCH_RATIO:
            continue
        hinted = 1 if any(h in normalize(col_name) for h in _TERRITORY_HINTS) else 0
        candidate = (ratio, hinted, -idx)
        if best is None or candidate > best:
            best = candidate
            best_idx = idx

    return best_idx if best is not None else None


def enrich(
    columns: Sequence[str], rows: Sequence[Sequence[Any]]
) -> tuple[list[str], list[list[Any]], dict[str, Any] | None]:
    """Ajoute ``latitude`` et ``longitude`` à un résultat agrégé par territoire.

    Retourne le triplet ``(colonnes, lignes, info)``. ``info`` vaut ``None`` quand
    aucun enrichissement n'a eu lieu — parce que le résultat porte déjà des
    coordonnées, ou parce qu'aucune colonne ne contient de territoires reconnus.
    Les lignes dont le territoire est inconnu reçoivent ``None`` : elles restent
    présentes dans le tableau et disparaissent seulement de la carte.
    """
    cols = list(columns)
    data = [list(r) for r in rows]

    if not data or has_coordinates(cols):
        return cols, data, None

    idx = detect_territory_column(cols, data)
    if idx is None:
        return cols, data, None

    matched = 0
    for row in data:
        coords = lookup(row[idx]) if idx < len(row) else None
        if coords:
            matched += 1
            row.extend([coords[0], coords[1]])
        else:
            row.extend([None, None])

    cols.extend(["latitude", "longitude"])
    info = {
        "source_column": columns[idx],
        "matched_rows": matched,
        "total_rows": len(data),
        "gazetteer": "Sénégal — 14 régions, 45 départements et principales villes",
    }
    return cols, data, info
