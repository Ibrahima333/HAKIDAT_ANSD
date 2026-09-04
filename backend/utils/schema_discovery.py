"""Génération du schéma d'une base de données en Markdown (backend Agentic BI).

Ce module expose ``get_schema_markdown`` qui interroge information_schema
pour décrire toutes les tables et colonnes d'un schéma donné, compatible
MySQL et PostgreSQL.

Le résultat est un document Markdown utilisé ensuite comme contexte dans
les prompts LLM de génération SQL.
"""

from backend.utils.db_utils import _db_type, run_query


def get_schema_markdown(database_name: str, schema_name: str) -> str:
    """Génère un document Markdown décrivant toutes les tables et colonnes du schéma.

    Compatible MySQL et PostgreSQL. En MySQL, schema_name == database_name.

    Args:
        database_name: nom de la base de données
        schema_name: nom du schéma (inutilisé en MySQL, = database_name)

    Returns:
        Chaîne Markdown avec les tables, colonnes, types et contraintes
    """
    db_type = _db_type(database_name)

    if db_type == "mysql":
        # En MySQL : le schéma cible est la base de données elle-même
        target_db = schema_name if schema_name else database_name

        # Récupération de la liste des tables physiques
        sql_tables = """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = %s
              AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        """
        try:
            _, rows = run_query(sql_tables, target_db, (target_db,))
            tables = [r[0] for r in rows]
        except Exception as e:
            return f"Erreur lors de la récupération des tables MySQL : {e}"

        lines = [f"# Schéma MySQL : `{target_db}`\n"]

        # Pour chaque table, on liste les colonnes avec leurs propriétés
        for table in tables:
            sql_cols = """
                SELECT column_name, column_type, is_nullable, column_key, column_default
                FROM information_schema.columns
                WHERE table_schema = %s AND table_name = %s
                ORDER BY ordinal_position;
            """
            try:
                _, col_rows = run_query(sql_cols, target_db, (target_db, table))
            except Exception:
                col_rows = []

            lines.append(f"## Table `{table}`\n")
            lines.append("| Colonne | Type | Nullable | Clé | Défaut |")
            lines.append("|---------|------|----------|-----|--------|")
            for col in col_rows:
                col_name, col_type, nullable, key, default = col
                lines.append(f"| {col_name} | {col_type} | {nullable} | {key or ''} | {default or ''} |")
            lines.append("")
        return "\n".join(lines)

    else:
        # PostgreSQL : on liste les tables du schéma cible
        sql_tables = """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = %s
              AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        """
        try:
            _, rows = run_query(sql_tables, database_name, (schema_name,))
            tables = [r[0] for r in rows]
        except Exception as e:
            return f"Erreur lors de la récupération des tables PostgreSQL : {e}"

        lines = [f"# Schéma PostgreSQL : `{database_name}.{schema_name}`\n"]

        # Pour chaque table, on liste les colonnes avec leurs propriétés
        for table in tables:
            sql_cols = """
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_schema = %s AND table_name = %s
                ORDER BY ordinal_position;
            """
            try:
                _, col_rows = run_query(sql_cols, database_name, (schema_name, table))
            except Exception:
                col_rows = []

            lines.append(f"## Table `{table}`\n")
            lines.append("| Colonne | Type | Nullable | Défaut |")
            lines.append("|---------|------|----------|--------|")
            for col in col_rows:
                col_name, data_type, nullable, default = col
                lines.append(f"| {col_name} | {data_type} | {nullable} | {default or ''} |")
            lines.append("")
        return "\n".join(lines)
