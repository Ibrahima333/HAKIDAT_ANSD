"""Génération du fichier de schéma d'une base de données en Markdown (backend Agentic BI).

Ce script interroge information_schema pour décrire les tables, colonnes
et contraintes d'une base, puis écrit le résultat dans ``schema/``.

Ce fichier de schéma est ensuite utilisé comme contexte dans le prompt
de génération SQL.

Compatible MySQL et PostgreSQL.

Utilisation en ligne de commande :
    python -m backend.scripts.schema --database ma_base --schema public
"""

import argparse
from pathlib import Path
import sys

# Ajout du chemin parent pour les imports directs (hors package)
if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from backend.utils.db_utils import run_query


from backend.utils.db_utils import _db_type


def _generate_schema_mysql(database_name: str, schema_name: str) -> list[str]:
    """Génère le contenu Markdown du schéma pour une base MySQL.

    En MySQL, le schéma est identique à la base de données (schema_name == database_name).
    Récupère les tables, colonnes et contraintes (clés primaires + étrangères).

    Args:
        database_name : nom de la base de données
        schema_name   : nom du schéma (= database_name en MySQL)

    Returns:
        Liste de lignes Markdown
    """
    # En MySQL : le schéma cible est la base elle-même
    target = schema_name if schema_name else database_name

    content = [
        f"# Schéma MySQL : `{target}`\n",
        "_Seules les tables physiques (BASE TABLE) sont prises en compte._\n",
    ]

    # Section TABLES : liste des tables physiques
    _, rows = run_query(
        "SELECT table_name FROM information_schema.tables "
        "WHERE table_schema = %s AND table_type = 'BASE TABLE' ORDER BY table_name;",
        target, (target,)
    )
    content.append("\n## TABLES\n")
    for (table_name,) in rows:
        content.append(f"- {target}.{table_name}")

    # Section COLUMNS : colonnes avec types et nullabilité
    _, rows = run_query(
        "SELECT table_name, column_name, column_type, is_nullable "
        "FROM information_schema.columns "
        "WHERE table_schema = %s "
        "ORDER BY table_name, ordinal_position;",
        target, (target,)
    )
    content.append("\n## COLUMNS\n")
    for row in rows:
        content.append("- " + " | ".join(map(str, [f"{target}.{row[0]}"] + list(row[1:]))))

    # Section CONSTRAINTS : clés primaires et étrangères
    _, rows = run_query(
        """
        SELECT kcu.table_name, kcu.constraint_name, kcu.column_name,
               kcu.referenced_table_name, kcu.referenced_column_name,
               tc.constraint_type
        FROM information_schema.key_column_usage kcu
        JOIN information_schema.table_constraints tc
          ON kcu.constraint_name = tc.constraint_name
         AND kcu.table_schema = tc.table_schema
        WHERE kcu.table_schema = %s
        ORDER BY kcu.table_name, tc.constraint_type;
        """,
        target, (target,)
    )
    content.append("\n## CONSTRAINTS\n")
    for row in rows:
        table, cname, col, ref_table, ref_col, ctype = row
        ref = f" -> {target}.{ref_table}.{ref_col}" if ref_table else ""
        content.append(f"- {target}.{table} | {ctype} | {col}{ref}")

    return content


def _generate_schema_postgresql(database_name: str, schema_name: str) -> list[str]:
    """Génère le contenu Markdown du schéma pour une base PostgreSQL.

    Récupère les tables, colonnes et contraintes (clés primaires + étrangères)
    du schéma spécifié.

    Args:
        database_name : nom de la base de données
        schema_name   : nom du schéma PostgreSQL (ex: "public")

    Returns:
        Liste de lignes Markdown
    """
    content = [
        f"# Schéma PostgreSQL : `{database_name}.{schema_name}`\n",
        "_Seules les tables physiques (BASE TABLE) sont prises en compte._\n",
    ]

    # Requêtes pour chaque section du schéma
    queries = {
        "tables": (
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = %s AND table_type = 'BASE TABLE' ORDER BY table_name;",
            (schema_name,)
        ),
        "columns": (
            "SELECT c.table_name, c.column_name, c.data_type, c.is_nullable "
            "FROM information_schema.columns c "
            "JOIN information_schema.tables t ON c.table_name = t.table_name AND c.table_schema = t.table_schema "
            "WHERE c.table_schema = %s AND t.table_type = 'BASE TABLE' "
            "ORDER BY c.table_name, c.ordinal_position;",
            (schema_name,)
        ),
        "constraints": (
            """
            SELECT tc.table_name, tc.constraint_type, kcu.column_name,
                   ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
            FROM information_schema.table_constraints tc
            JOIN information_schema.tables t ON tc.table_name = t.table_name AND tc.table_schema = t.table_schema
            LEFT JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
            LEFT JOIN information_schema.constraint_column_usage ccu
              ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
            WHERE tc.table_schema = %s AND t.table_type = 'BASE TABLE'
            ORDER BY tc.table_name, tc.constraint_type;
            """,
            (schema_name,)
        ),
    }

    for section, (sql, params) in queries.items():
        _, rows = run_query(sql, database_name, params)
        content.append(f"\n## {section.upper()}\n")
        for row in rows:
            row_list = list(row)
            # Préfixage de la première colonne (nom de table) avec le schéma
            row_list[0] = f"{schema_name}.{row_list[0]}"
            # Préfixage de la table étrangère pour les contraintes FK
            if section == "constraints" and row_list[3] and str(row_list[3]) != "None":
                row_list[3] = f"{schema_name}.{row_list[3]}"
            content.append("- " + " | ".join(map(str, row_list)))

    return content


def _generate_schema_sqlite(database_name: str) -> list[str]:
    """Génère le schéma Markdown pour une base SQLite (fichier uploadé)."""
    content = [
        f"# Schéma SQLite : `{database_name}`\n",
        "_Tables issues d'un fichier CSV/Excel importé._\n",
    ]

    _, tables = run_query(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;",
        database_name
    )
    content.append("\n## TABLES\n")
    for (tname,) in tables:
        content.append(f"- {tname}")

    content.append("\n## COLUMNS\n")
    for (tname,) in tables:
        _, cols = run_query(f"PRAGMA table_info(\"{tname}\");", database_name)
        for col in cols:
            # col: (cid, name, type, notnull, dflt_value, pk)
            nullable = "YES" if not col[3] else "NO"
            content.append(f"- {tname} | {col[1]} | {col[2] or 'TEXT'} | {nullable}")

    content.append("\n## CONSTRAINTS\n")
    for (tname,) in tables:
        _, pks = run_query(f"PRAGMA table_info(\"{tname}\");", database_name)
        for col in pks:
            if col[5]:  # pk flag
                content.append(f"- {tname} | PRIMARY KEY | {col[1]}")

    return content


def generate_schema(database_name: str, schema_name: str = "public"):
    """Génère et sauvegarde le fichier de schéma Markdown pour une base de données.

    Le fichier est écrit dans ``schema/<database_name>__<schema_name>_schema.md``.

    Args:
        database_name : nom de la base de données
        schema_name   : nom du schéma (défaut : "public")
    """
    db_type = _db_type(database_name)

    # En MySQL : si schema_name est vide, on utilise database_name
    if db_type == "mysql" and not schema_name:
        schema_name = database_name

    if db_type != "mysql" and not schema_name:
        schema_name = "public"

    schema_path = Path(f"schema/{database_name}__{schema_name}_schema.md")
    schema_path.parent.mkdir(exist_ok=True)

    # Génération selon le type de base
    if db_type == "sqlite":
        content = _generate_schema_sqlite(database_name)
    elif db_type == "mysql":
        content = _generate_schema_mysql(database_name, schema_name)
    else:
        content = _generate_schema_postgresql(database_name, schema_name)

    # Écriture du fichier Markdown
    schema_path.write_text("\n".join(content), encoding="utf-8")
    print(f"[schema] Généré : {schema_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Génère le schéma d'une base de données en Markdown.")
    parser.add_argument("--database", required=True, help="Nom de la base de données")
    parser.add_argument("--schema", default="", help="Nom du schéma (défaut : vide → public ou database_name)")
    args = parser.parse_args()
    generate_schema(args.database, args.schema)
