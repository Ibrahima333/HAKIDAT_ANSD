"""Exécution d'une requête SQL et export des résultats en CSV (backend Agentic BI).

Ce script lit un fichier .sql, exécute la requête sur la base cible,
écrit les résultats en CSV et génère un fichier metadata.json.

Utilisation en ligne de commande :
    python -m backend.scripts.run_analysis \\
        --sql sql/ma_question.sql \\
        --database ma_base \\
        --schema public
"""

import csv
import json
import argparse
import re
import sys
from pathlib import Path

# Ajout du chemin parent pour les imports directs (hors package)
if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from backend.utils.db_utils import run_query
from backend.utils import geo_senegal

# Dossier de sortie contenant les résultats par analyse
OUTPUTS_DIR = Path("outputs")

# Tables citées après FROM ou JOIN, éventuellement qualifiées par un schéma
_TABLE_PATTERN = re.compile(
    r"\b(?:FROM|JOIN)\s+([A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)?)",
    re.IGNORECASE,
)

# Mots-clés qui suivent FROM/JOIN sans être des tables (sous-requêtes, fonctions)
_NOT_TABLES = {"select", "lateral", "unnest", "values", "generate_series"}


def _referenced_tables(sql: str) -> list[str]:
    """Extrait les tables citées dans les clauses FROM et JOIN du SQL."""
    tables: list[str] = []
    for name in _TABLE_PATTERN.findall(sql):
        if name.lower() in _NOT_TABLES or name in tables:
            continue
        tables.append(name)
    return tables


def diagnose_empty_result(sql: str, database_name: str) -> str | None:
    """Explique pourquoi une requête n'a retourné aucune ligne.

    Retourne un message lisible si des tables interrogées sont vides, sinon
    ``None`` — le vide vient alors des filtres ou des jointures, et inventer
    une explication serait pire que de n'en donner aucune.
    """
    tables = _referenced_tables(sql)
    if not tables:
        return None

    counts: dict[str, int] = {}
    for table in tables:
        try:
            _, rows = run_query(f"SELECT COUNT(*) FROM {table}", database_name)
            counts[table] = int(rows[0][0])
        except Exception:
            # Table introuvable ou inaccessible : pas de diagnostic fiable
            return None

    empty = [t for t, n in counts.items() if n == 0]
    if not empty:
        return None

    noms = ", ".join(f"« {t} »" for t in empty)
    if len(empty) == len(counts):
        if len(empty) == 1:
            return f"La table {noms} ne contient aucune donnée."
        return f"Les tables interrogées ne contiennent aucune donnée : {noms}."
    return f"Aucun résultat car ces tables sont vides : {noms}."


def execute_analysis(sql_file: Path, database_name: str, schema_name: str = "public"):
    """Exécute une requête SQL et sauvegarde les résultats sur disque.

    Args:
        sql_file      : chemin vers le fichier .sql à exécuter
        database_name : nom de la base de données cible
        schema_name   : nom du schéma (utilisé dans les métadonnées)

    Produit dans ``outputs/<question_name>/`` :
    - ``<question_name>.csv`` : résultats de la requête
    - ``metadata.json``        : métadonnées (question, nb lignes, colonnes, base…)
    """
    question_name = sql_file.stem
    out_dir = OUTPUTS_DIR / question_name
    csv_path = out_dir / f"{question_name}.csv"

    # Exécution de la requête SQL sur la base cible
    sql_text = sql_file.read_text()
    columns, rows = run_query(sql_text, database_name)

    # Les statistiques publiques sont agrégées par territoire, jamais géolocalisées.
    # On rattache les coordonnées quand c'est possible, pour que l'étape suivante
    # puisse produire une carte. Un échec ici ne doit pas faire tomber l'analyse.
    geo_info = None
    try:
        columns, rows, geo_info = geo_senegal.enrich(columns, rows)
    except Exception as exc:
        print(f"[warn] Enrichissement géographique ignoré : {exc}")

    # Création du dossier de sortie si nécessaire
    out_dir.mkdir(parents=True, exist_ok=True)

    # Écriture des résultats en CSV (encodage UTF-8, sans BOM)
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(columns)   # En-tête
        writer.writerows(rows)     # Données

    # Écriture des métadonnées d'exécution
    metadata = {
        "question": question_name,
        "rows_returned": len(rows),
        "columns": columns,
        "sql_file": str(sql_file),
        "database": database_name,
        "schema": schema_name
    }

    if geo_info:
        metadata["geo_enrichment"] = geo_info
        print(
            f"[geo] Coordonnées ajoutées depuis « {geo_info['source_column']} » "
            f"({geo_info['matched_rows']}/{geo_info['total_rows']} territoires reconnus)"
        )

    # Résultat vide : on cherche la cause plutôt que de laisser l'utilisateur
    # douter de sa question. Le diagnostic ne doit jamais faire échouer l'analyse.
    if not rows:
        try:
            reason = diagnose_empty_result(sql_text, database_name)
            if reason:
                metadata["empty_reason"] = reason
        except Exception as exc:
            print(f"[warn] Diagnostic du résultat vide ignoré : {exc}")

    (out_dir / "metadata.json").write_text(json.dumps(metadata, indent=2))

    print(f"[OK] Résultat généré pour {question_name} sur {database_name} (schéma : {schema_name})")


def main():
    """Point d'entrée CLI pour l'exécution SQL."""
    parser = argparse.ArgumentParser(description="Exécute une requête SQL et exporte les résultats.")
    parser.add_argument("--sql", required=True, help="Chemin vers le fichier SQL à exécuter")
    parser.add_argument("--database", required=True, help="Nom de la base de données")
    parser.add_argument("--schema", default="public", help="Nom du schéma (défaut : public)")
    args = parser.parse_args()

    sql_file = Path(args.sql)
    if not sql_file.exists():
        print(f"Erreur : Le fichier {sql_file} n'existe pas.")
        sys.exit(1)

    execute_analysis(sql_file, args.database, args.schema)


if __name__ == "__main__":
    main()
