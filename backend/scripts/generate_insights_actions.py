"""Génération du rapport Insights & Actions (backend Agentic BI).

Ce script lit les résultats d'une analyse (CSV, metadata), construit
un prompt et appelle le provider LLM pour générer un rapport Markdown
avec des insights métier et des actions recommandées.

Utilisation en ligne de commande :
    python -m backend.scripts.generate_insights_actions \\
        --request requests/ma_question.txt \\
        --provider gemini
"""

import csv
import json
import argparse
import sys
from pathlib import Path

# Ajout du chemin parent pour les imports directs (hors package)
if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from backend.llm.factory import generate_with_fallback

# Dossier contenant les outputs par analyse
OUTPUTS_DIR = Path("outputs")

# Template de prompt pour la génération des insights
PROMPT_TEMPLATE = Path(__file__).parent / "prompt_template_insights.txt"


def preview_csv(csv_path: Path, limit: int = 10):
    """Lit les premières lignes d'un fichier CSV pour enrichir le prompt.

    Args:
        csv_path : chemin vers le fichier CSV
        limit    : nombre maximum de lignes d'aperçu (défaut : 10)

    Returns:
        Tuple (header, rows, total_rows) :
        - header     : liste des noms de colonnes
        - rows       : liste des premières lignes (limit max)
        - total_rows : nombre total de lignes de données
    """
    rows = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        if not header:
            return [], [], 0

        for _ in range(limit):
            try:
                rows.append(next(reader))
            except StopIteration:
                break

    # Comptage du total de lignes (hors en-tête)
    total_rows = sum(1 for _ in open(csv_path, encoding="utf-8")) - 1
    return header, rows, total_rows


def generate_insights_actions(question_file: Path, provider_name: str = "gemini"):
    """Génère un rapport Markdown Insights & Actions depuis les résultats d'analyse.

    Args:
        question_file : chemin vers le fichier .txt de la question originale
        provider_name : provider LLM à utiliser ("gemini" ou "groq")

    Écrit le rapport dans ``outputs/<question_name>/<question_name>.md``.
    """
    question_name = question_file.stem

    # Chemins des fichiers d'entrée et de sortie
    output_dir = OUTPUTS_DIR / question_name
    csv_file = output_dir / f"{question_name}.csv"
    metadata_file = output_dir / "metadata.json"
    output_md = output_dir / f"{question_name}.md"

    # Vérification de la présence des données nécessaires
    if not csv_file.exists():
        print(f"Erreur : CSV introuvable pour {question_name}")
        sys.exit(1)

    if not metadata_file.exists():
        print(f"Erreur : metadata.json introuvable pour {question_name}")
        sys.exit(1)

    if not PROMPT_TEMPLATE.exists():
        print("Erreur : prompt_template_insights.txt introuvable.")
        sys.exit(1)

    # Lecture des données d'entrée
    question_text = question_file.read_text(encoding="utf-8").strip()
    metadata = json.loads(metadata_file.read_text(encoding="utf-8"))

    # Aperçu CSV (10 premières lignes)
    columns, rows_preview, total_rows = preview_csv(csv_file, limit=10)
    columns_string = ", ".join(columns) if columns else "N/A"

    # Construction du texte d'aperçu pour le prompt
    preview_lines = []
    if rows_preview:
        preview_lines.append(", ".join(columns))
        for row in rows_preview:
            preview_lines.append(", ".join(row))
    data_preview_text = "\n".join(preview_lines) if preview_lines else "Aucune donnée disponible."

    # Construction du prompt en substituant les variables dans le template
    prompt = PROMPT_TEMPLATE.read_text(encoding="utf-8")
    prompt = prompt.replace("{business_question}", question_text)
    prompt = prompt.replace("{columns_string}", columns_string)
    prompt = prompt.replace("{rows_returned}", str(metadata.get("rows_returned", total_rows)))
    prompt = prompt.replace("{preview_len}", str(len(rows_preview)))
    prompt = prompt.replace("{data_preview}", data_preview_text)
    prompt = prompt.replace("{sql_file_path}", metadata.get("sql_file", "N/A"))

    # Appel au provider LLM pour générer les insights
    try:
        result = generate_with_fallback(prompt, provider_name)
    except Exception as exc:
        print(f"Erreur lors de l'appel au provider LLM : {exc}")
        sys.exit(1)

    # Création du dossier de sortie si nécessaire
    output_dir.mkdir(parents=True, exist_ok=True)

    # Écriture du rapport Markdown
    output_md.write_text(result.text.strip(), encoding="utf-8")

    if result.used_fallback:
        print(f"[WARN] {result.fallback_reason}")
        print("[WARN] Basculement sur Gemini pour préserver le workflow.")

    print(f"[OK] Insights & Actions générés : {output_md}")


def main():
    """Point d'entrée CLI pour la génération des insights."""
    parser = argparse.ArgumentParser(
        description="Génère un rapport Insights & Actions à partir d'une question."
    )
    parser.add_argument(
        "--request",
        required=True,
        help="Chemin vers le fichier de requête .txt"
    )
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

    generate_insights_actions(request_file, args.provider)


if __name__ == "__main__":
    main()
