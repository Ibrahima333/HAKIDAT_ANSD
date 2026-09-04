"""Génération de requêtes SQL à partir d'une question en langage naturel.

Ce script lit un fichier de requête .txt, charge le schéma de la base cible,
construit un prompt et appelle le provider LLM pour générer la requête SQL.

Utilisation en ligne de commande :
    python -m backend.scripts.generate_sql \\
        --request requests/ma_question.txt \\
        --database ma_base \\
        --schema public \\
        --provider gemini
"""

import argparse
import re
import sys
from pathlib import Path

# Ajout du chemin parent pour les imports directs (hors package)
if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from backend.llm.factory import generate_with_fallback
from backend.scripts.schema import generate_schema

def _strip_sql_comments(sql: str) -> str:
    """Supprime les commentaires SQL (-- ligne et /* bloc */) du texte."""
    # Supprimer les blocs /* ... */
    sql = re.sub(r"/\*[\s\S]*?\*/", "", sql)
    # Supprimer les commentaires -- jusqu'à fin de ligne
    sql = re.sub(r"--[^\n]*", "", sql)
    # Nettoyer les lignes vides residuelles
    lines = [l for l in sql.splitlines() if l.strip()]
    return "\n".join(lines).strip()


def _clean_sql(text: str) -> str:
    """Supprime les balises markdown, les commentaires et tout texte parasite autour du SQL."""
    # Cas 1 : bloc ```sql ... ``` ou ``` ... ```
    match = re.search(r"```(?:sql)?\s*([\s\S]+?)```", text, re.IGNORECASE)
    if match:
        sql = match.group(1).strip()
        return _strip_sql_comments(sql)

    # Cas 2 : pas de balises — nettoyer les lignes qui ne sont pas du SQL
    lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            if lines:
                lines.append(line)
            continue
        lines.append(line)

    return _strip_sql_comments("\n".join(lines).strip())


# Dossier de sortie pour les fichiers SQL générés
SQL_DIR = Path("sql")

# Template de prompt pour la génération SQL
PROMPT_TEMPLATE = Path(__file__).parent / "prompt_template.txt"

# Noms de dialectes lisibles par le LLM, par type de base
_DIALECT_LABELS = {
    "mysql":      "MySQL",
    "postgresql": "PostgreSQL",
    "sqlite":     "SQLite",
}


def _sql_dialect(database_name: str) -> str:
    """Retourne le dialecte SQL de la base ciblée.

    Indispensable en multi-base : chaque base peut être d'un moteur différent,
    et le LLM doit générer la syntaxe correspondante.
    """
    try:
        from backend.utils.db_utils import _db_type
        return _DIALECT_LABELS.get(_db_type(database_name), "SQL ANSI")
    except Exception:
        return "SQL ANSI"


def generate_sql(
    question_file: Path,
    database_name: str,
    schema_name: str = "public",
    provider_name: str = "gemini",
):
    """Génère une requête SQL depuis une question en langage naturel.

    Args:
        question_file : chemin vers le fichier .txt contenant la question
        database_name : nom de la base de données cible
        schema_name   : nom du schéma (défaut : "public" pour PostgreSQL)
        provider_name : provider LLM à utiliser ("gemini" ou "groq")

    Écrit le SQL généré dans ``sql/<nom_question>.sql``.
    """
    sql_file = SQL_DIR / (question_file.stem + ".sql")
    schema_file = Path(f"schema/{database_name}__{schema_name}_schema.md")

    # Génération automatique du schéma s'il n'existe pas encore
    if not schema_file.exists():
        print(f"[schema] Fichier introuvable, génération automatique pour {database_name}/{schema_name}...")
        try:
            generate_schema(database_name, schema_name)
        except Exception as e:
            print(f"Erreur lors de la génération du schéma : {e}")
            sys.exit(1)

    # Construction du prompt en substituant les variables dans le template
    prompt = PROMPT_TEMPLATE.read_text()
    prompt = prompt.replace("{{SQL_DIALECT}}", _sql_dialect(database_name))
    prompt = prompt.replace("{{SCHEMA}}", schema_file.read_text())
    prompt = prompt.replace("{{QUESTION}}", question_file.read_text())
    prompt = prompt.replace("{{SQL_PATH}}", str(sql_file))

    # Appel au provider LLM pour générer le SQL
    try:
        result = generate_with_fallback(prompt, provider_name)
    except Exception as exc:
        print(f"Erreur lors de l'appel au provider LLM : {exc}")
        sys.exit(1)

    # Nettoyage du SQL : suppression des balises markdown ```sql ... ```
    sql_clean = _clean_sql(result.text)

    # Écriture du fichier SQL généré
    sql_file.parent.mkdir(exist_ok=True)
    sql_file.write_text(sql_clean)

    # Avertissement si un provider de secours a été utilisé
    if result.used_fallback:
        print(f"[WARN] {result.fallback_reason}")
        print("[WARN] Basculement sur Gemini pour préserver le workflow.")

    print(f"[OK] SQL généré pour {question_file.name}")


def main():
    """Point d'entrée CLI pour la génération SQL."""
    parser = argparse.ArgumentParser(description="Génère du SQL à partir d'une requête en langage naturel.")
    parser.add_argument("--request", required=True, help="Chemin vers le fichier de requête .txt")
    parser.add_argument("--database", required=True, help="Nom de la base de données")
    parser.add_argument("--schema", default="public", help="Nom du schéma (défaut : public)")
    parser.add_argument(
        "--provider",
        type=str,
        default="gemini",
        choices=["gemini", "groq"],
        help="Provider LLM à utiliser (défaut : gemini)",
    )
    args = parser.parse_args()

    request_file = Path(args.request)
    if not request_file.exists():
        print(f"Erreur : Le fichier {request_file} n'existe pas.")
        sys.exit(1)

    generate_sql(request_file, args.database, args.schema, args.provider)


if __name__ == "__main__":
    main()
