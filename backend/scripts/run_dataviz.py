import subprocess
import sys
import argparse
from pathlib import Path

OUTPUTS_DIR = Path("outputs")

_FALLBACK_HTML = """\
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><title>Graphique indisponible</title>
<style>
  body {{ font-family: system-ui, sans-serif; background: #18181b; color: #a1a1aa;
         display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }}
  .box {{ text-align: center; max-width: 480px; padding: 2rem; }}
  .icon {{ font-size: 2.5rem; margin-bottom: 1rem; }}
  h2 {{ color: #f4f4f5; margin: 0 0 .5rem; }}
  pre {{ background: #27272a; border-radius: 8px; padding: 1rem; text-align: left;
        font-size: .8rem; white-space: pre-wrap; word-break: break-word; color: #f87171; }}
</style>
</head>
<body>
<div class="box">
  <div class="icon">📊</div>
  <h2>Graphique non disponible</h2>
  <p>Le script de visualisation a rencontré une erreur.<br>
     Les données restent consultables dans l'onglet <strong>Results</strong>.</p>
  <pre>{error}</pre>
</div>
</body>
</html>
"""


def run_dataviz_script(dataviz_file: Path):
    question_name = dataviz_file.stem
    out_dir = OUTPUTS_DIR / question_name
    html_path = out_dir / f"{question_name}.html"

    if not out_dir.exists():
        print(f"[WARN] Dossier de sortie manquant pour {question_name}, création.")
        out_dir.mkdir(parents=True, exist_ok=True)

    print(f"[RUN] Génération du graphique pour {question_name}...")

    try:
        result = subprocess.run(
            [sys.executable, str(dataviz_file)],
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        if html_path.exists():
            print(f"[OK] Graphique généré : {html_path}")
        else:
            # Script exécuté sans erreur mais sans produire de HTML
            error_msg = result.stdout or "Le script ne produit pas de fichier HTML."
            print(f"[WARN] HTML absent après exécution — fallback généré.")
            html_path.write_text(
                _FALLBACK_HTML.format(error=error_msg[:800]), encoding="utf-8"
            )

    except subprocess.CalledProcessError as e:
        stderr = e.stderr or ""
        stdout = e.stdout or ""
        error_detail = (stderr + "\n" + stdout).strip()
        print(f"[ERREUR] Échec de génération pour {question_name}")
        print(error_detail)
        # Générer un HTML de fallback pour ne pas bloquer l'affichage des données
        html_path.write_text(
            _FALLBACK_HTML.format(error=error_detail[:800]), encoding="utf-8"
        )


def main():
    parser = argparse.ArgumentParser(description="Exécute un script de visualisation de données.")
    parser.add_argument("--dataviz", required=True, help="Chemin vers le script Python de visualisation")
    args = parser.parse_args()

    dataviz_file = Path(args.dataviz)
    if not dataviz_file.exists():
        print(f"Erreur : Le fichier {dataviz_file} n'existe pas.")
        sys.exit(1)

    run_dataviz_script(dataviz_file)

if __name__ == "__main__":
    main()
