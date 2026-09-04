"""Génération du script de visualisation de données (backend Agentic BI).

Ce script lit les résultats d'une analyse (CSV, SQL, metadata), construit
un prompt et appelle le provider LLM pour générer un script Python
qui produira un graphique HTML via Plotly.

Utilisation en ligne de commande :
    python -m backend.scripts.generate_dataviz \\
        --request requests/ma_question.txt \\
        --provider gemini
"""

import ast
import csv
import json
import argparse
import re
import sys
from pathlib import Path

# Ajout du chemin parent pour les imports directs (hors package)
if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from backend.llm.factory import generate_with_fallback
from backend.scripts.chart_palette_injector import inject_palette_switcher, needs_palette_switcher

# Dossiers de données
SQL_DIR = Path("sql")
OUTPUTS_DIR = Path("outputs")
DATAVIZ_DIR = Path("dataviz")

# Template de prompt pour la génération du script dataviz
PROMPT_TEMPLATE = Path(__file__).parent / "prompt_template_dataviz.txt"


def sanitize_python_output(text: str) -> str:
    """Extrait le bloc Python le plus probable depuis la sortie du provider LLM.

    Si la réponse contient un bloc de code Markdown (```python ... ```),
    seul le contenu du bloc est retourné. Sinon, on cherche la première ligne
    qui ressemble à du code Python (import, from, def, class).
    """
    if "```" in text:
        # Extraction du premier bloc de code délimité par des backticks
        fenced_blocks = re.findall(r"```(?:python)?\s*(.*?)```", text, flags=re.DOTALL | re.IGNORECASE)
        if fenced_blocks:
            return fenced_blocks[0].strip()

    # Recherche de la première ligne de code Python ou du commentaire VIZ_TYPE
    lines = text.splitlines()
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("# VIZ_TYPE:") or stripped.startswith(("import ", "from ", "def ", "class ")):
            return "\n".join(lines[i:])
    return text


def validate_python_output(text: str) -> None:
    """Vérifie que la sortie du provider est un script Python valide.

    Lève ValueError si :
    - La sortie est vide
    - La sortie contient encore du Markdown (backticks)
    - La syntaxe Python est invalide
    """
    if not text.strip():
        raise ValueError("Le provider a retourné une sortie vide pour la dataviz.")
    if "```" in text:
        raise ValueError("Le provider a retourné du Markdown au lieu d'un script Python brut.")
    try:
        ast.parse(text)
    except SyntaxError as exc:
        raise ValueError(f"Le provider a retourné un script Python invalide : {exc}") from exc


def preview_csv(csv_path: Path, limit: int = 5):
    """Lit les premières lignes d'un fichier CSV pour construire l'aperçu du prompt.

    Args:
        csv_path : chemin vers le fichier CSV
        limit    : nombre maximum de lignes d'aperçu (défaut : 5)

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
            return "", [], 0

        for _ in range(limit):
            try:
                rows.append(next(reader))
            except StopIteration:
                break

    # Comptage du nombre total de lignes (hors en-tête)
    total_rows = sum(1 for _ in open(csv_path, encoding="utf-8")) - 1
    return header, rows, total_rows


def generate_dataviz(question_file: Path, provider_name: str = "gemini", forced_chart_type: str | None = None):
    """Génère un script Python de visualisation depuis les résultats d'analyse.

    Lit le CSV, le SQL et les métadonnées pour construire un prompt contextualisé,
    appelle le LLM, valide le code retourné et l'écrit dans dataviz/.

    Args:
        question_file : chemin vers le fichier .txt de la question originale
        provider_name : provider LLM à utiliser ("gemini" ou "groq")
    """
    question_name = question_file.stem

    # Chemins des fichiers d'entrée et de sortie
    sql_file = SQL_DIR / f"{question_name}.sql"
    csv_file = OUTPUTS_DIR / question_name / f"{question_name}.csv"
    metadata_file = OUTPUTS_DIR / question_name / "metadata.json"
    dataviz_file = DATAVIZ_DIR / f"{question_name}.py"
    output_html = OUTPUTS_DIR / question_name / f"{question_name}.html"

    # Vérification de la présence des données nécessaires
    if not (sql_file.exists() and csv_file.exists() and metadata_file.exists()):
        print(f"Erreur : Données manquantes pour {question_name} (SQL, CSV ou metadata absent)")
        sys.exit(1)

    # Lecture des fichiers d'entrée
    question_text = question_file.read_text(encoding="utf-8")
    sql_code = sql_file.read_text(encoding="utf-8")
    metadata = json.loads(metadata_file.read_text(encoding="utf-8"))

    # Aperçu CSV pour enrichir le prompt
    columns, rows_preview, row_count = preview_csv(csv_file)
    csv_preview_text = "\n".join([", ".join(r) for r in rows_preview]) or "(pas de lignes d'aperçu)"

    # Construction du prompt en substituant les variables dans le template
    prompt = PROMPT_TEMPLATE.read_text(encoding="utf-8")
    template_values = {
        "{original_business_question}": question_text.strip(),
        "{question_that_sql_result_can_answer}": metadata.get(
            "question_that_sql_result_can_answer",
            question_text.strip(),
        ),
        "{sql_code}": sql_code,
        "{columns_string}": ", ".join(columns),
        "{dataframe_preview_len}": str(len(rows_preview)),
        "{dataframe_head}": csv_preview_text,
        "{dataframe_len}": str(row_count),
        "{csv_path}": str(csv_file),
        "{output_html_path}": str(output_html),
    }

    for placeholder, value in template_values.items():
        prompt = prompt.replace(placeholder, value)

    # Vérification qu'aucun placeholder n'est resté non substitué
    # Exclut les accolades doublées {{...}} qui servent à échapper des littéraux
    unresolved = sorted(set(re.findall(r"(?<!\{)\{[a-z_][a-z0-9_]*\}(?!\})", prompt)))

    # Décoder les accolades échappées ({{z}} → {z}) après la vérification
    prompt = prompt.replace("{{", "{").replace("}}", "}")
    if unresolved:
        raise ValueError(
            f"Placeholders non résolus dans le template dataviz : {', '.join(unresolved)}"
        )

    # Si un type de graphique est forcé, l'injecter en tête du prompt
    if forced_chart_type:
        override_instruction = (
            f"\n\n⚠️ OVERRIDE — FORCED CHART TYPE:\n"
            f"The user has explicitly requested the chart type: **{forced_chart_type}**.\n"
            f"You MUST use this chart type regardless of CHART SELECTION RULES above.\n"
            f"The VIZ_TYPE comment on line 1 must reflect: # VIZ_TYPE: {forced_chart_type} | VIZ_ALT: (none)\n\n"
        )
        prompt = override_instruction + prompt

    # Appel au provider LLM pour générer le script de visualisation
    try:
        result = generate_with_fallback(prompt, provider_name)
    except Exception as exc:
        print(f"Erreur lors de l'appel au provider LLM : {exc}")
        sys.exit(1)

    # Nettoyage et validation du code Python retourné
    DATAVIZ_DIR.mkdir(exist_ok=True)
    clean_code = sanitize_python_output(result.text)
    validate_python_output(clean_code)

    # Garantie serveur : le prompt demande au LLM d'ajouter le sélecteur de
    # palette, mais il ne le fait pas toujours (observé en conditions
    # réelles). On l'injecte nous-mêmes s'il est absent, plutôt que de
    # dépendre uniquement de la conformité du LLM.
    if needs_palette_switcher(clean_code):
        clean_code = inject_palette_switcher(clean_code)

    dataviz_file.write_text(clean_code, encoding="utf-8")

    if result.used_fallback:
        print(f"[WARN] {result.fallback_reason}")
        print("[WARN] Basculement sur Gemini pour préserver le workflow.")

    print(f"[OK] Code dataviz généré pour {question_name}")


def main():
    """Point d'entrée CLI pour la génération du script dataviz."""
    parser = argparse.ArgumentParser(description="Génère un script de visualisation de données.")
    parser.add_argument("--request", required=True, help="Chemin vers le fichier de requête .txt")
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

    generate_dataviz(request_file, args.provider)


if __name__ == "__main__":
    main()
