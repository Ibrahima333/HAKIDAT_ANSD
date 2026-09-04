"""Découverte des bases de données et schémas disponibles (backend Agentic BI).

Ce module expose les fonctions pour lister :
- Les bases enregistrées par l'administrateur (``list_databases``)
- Les schémas disponibles dans une base donnée (``list_schemas``)

Compatible MySQL, PostgreSQL et SQLite. Chaque base résout ses propres
credentials via :class:`ConnectionRegistry`.
"""

from typing import List

from backend.utils.db_utils import run_query


def list_databases() -> List[str]:
    """Liste les bases enregistrées, plus les fichiers importés existants.

    Contrairement à l'ancien comportement, cette fonction n'énumère plus les
    bases du serveur : seules celles explicitement enregistrées sont exposées.
    """
    from pathlib import Path
    from backend.db_config import get_registry

    names = get_registry().names()
    uploads_dir = Path("uploads")
    if uploads_dir.is_dir():
        for db_file in sorted(uploads_dir.glob("*.db")):
            if db_file.stem not in names:
                names.append(db_file.stem)
    return names


def list_schemas(database_name: str) -> List[str]:
    """Liste les schémas disponibles dans une base de données.

    En MySQL et SQLite, le schéma est identique à la base.
    En PostgreSQL, exclut les schémas systèmes (pg_catalog, pg_toast…).

    Args:
        database_name: nom de la base de données cible

    Returns:
        Liste des schémas disponibles (vide si database_name est absent)
    """
    if not database_name:
        return []

    from backend.db_config import get_registry

    cfg = get_registry().resolve(database_name)
    if cfg is None:
        return []

    if cfg.db_type.lower() in ("mysql", "sqlite"):
        return [database_name]

    # PostgreSQL : on liste les schémas en excluant les schémas internes
    sql = """
        SELECT schema_name
        FROM information_schema.schemata
        WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
          AND schema_name NOT LIKE 'pg_toast%'
          AND schema_name NOT LIKE 'pg_temp%'
        ORDER BY schema_name;
    """
    try:
        _, rows = run_query(sql, database_name)
        schemas = [row[0] for row in rows]
        return schemas if schemas else ["public"]
    except Exception:
        # Fallback si l'utilisateur n'a pas accès à information_schema.schemata
        return ["public"]
