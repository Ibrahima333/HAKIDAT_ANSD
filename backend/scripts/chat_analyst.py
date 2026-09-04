"""Prompt builder pour le mode chat analytique (HakiData).

Ce module construit le prompt système envoyé au LLM pour le mode
conversation rapide. Le LLM joue le rôle d'un data analyst consultant
qui connaît le schéma de la base mais ne génère pas de SQL.
"""

from pathlib import Path


def build_system_prompt(database: str, schema: str, schema_markdown: str) -> str:
    """Construit le prompt système du data analyst."""

    db_context = f"Base de données : **{database}**"
    if schema and schema != database:
        db_context += f" / Schéma : **{schema}**"

    schema_section = (
        f"\n\nVoici le schéma de la base :\n\n{schema_markdown}"
        if schema_markdown
        else "\n\n(Schéma non disponible — réponds sur la base des informations fournies.)"
    )

    return f"""Tu es un data analyst senior expert de la base de données {database}.
Tu connais EXACTEMENT le schéma de cette base et tu bases TOUTES tes réponses sur les vraies tables et colonnes disponibles.

{db_context}{schema_section}

RÈGLES ABSOLUES :
- Réponds TOUJOURS en français, de façon claire et concise.
- BASE-TOI TOUJOURS sur les vraies tables et colonnes du schéma ci-dessus. Ne cite JAMAIS des tables ou colonnes qui n'existent pas dans ce schéma.
- Quand tu suggères un KPI ou une analyse, cite TOUJOURS la table et la colonne concernées (ex: "le chiffre d'affaires depuis la colonne `montant` de la table `commandes`").
- Si le schéma est vide ou que tu ne connais pas une information, dis-le clairement.
- NE génère JAMAIS de code SQL ou Python.
- Si l'utilisateur veut une requête SQL ou un graphique, renvoie-le vers l'onglet "Analyse".
- Sois direct et actionnable : chaque réponse doit apporter de la valeur concrète basée sur LES VRAIES DONNÉES.
- Limite tes réponses à 300 mots maximum sauf demande explicite.
"""


def load_schema_markdown(database: str, schema: str) -> str:
    """Charge le schéma de la base.

    Priorité :
    1. Fichier pré-généré par le pipeline (schema/<db>__<schema>.md)
    2. Génération dynamique depuis la base si le fichier est absent
    """
    # 1. Fichier pré-généré
    schema_dir = Path("schema")
    candidates = [
        schema_dir / f"{database}__{schema}_schema.md",
        schema_dir / f"{database}__{database}_schema.md",
    ]
    for path in candidates:
        if path.exists():
            return path.read_text(encoding="utf-8")

    # 2. Génération dynamique depuis la base de données
    if not database:
        return ""
    try:
        from backend.utils.db_utils import run_query, _db_type
        target = schema if schema and schema != database else database
        db_type = _db_type(database)

        if db_type == "mysql":
            _, rows = run_query(
                """SELECT table_name, column_name, column_type, is_nullable, column_key
                   FROM information_schema.columns
                   WHERE table_schema = %s
                   ORDER BY table_name, ordinal_position""",
                target, (target,)
            )
        else:
            # PostgreSQL : se connecter à la vraie base (database), filtrer par schéma
            _, rows = run_query(
                """SELECT table_name, column_name, data_type, is_nullable, ''
                   FROM information_schema.columns
                   WHERE table_schema = %s
                   ORDER BY table_name, ordinal_position""",
                database, (schema or "public",)
            )

        print(f"[chat] Schéma dynamique pour '{database}': {len(rows)} colonnes trouvées")
        if not rows:
            print(f"[chat] Aucune colonne trouvée pour '{target}'")
            return ""

        # Construire un markdown lisible par le LLM
        tables: dict = {}
        for table_name, col_name, col_type, nullable, col_key in rows:
            tables.setdefault(table_name, []).append(
                f"  - {col_name} ({col_type})"
                + (" PK" if col_key == "PRI" else "")
                + (" NULL" if nullable == "YES" else "")
            )

        lines = [f"## Base : {database}\n"]
        for table, cols in sorted(tables.items()):
            lines.append(f"### {table}")
            lines.extend(cols)
            lines.append("")

        return "\n".join(lines)

    except Exception as e:
        print(f"[chat] Erreur chargement schéma dynamique pour '{database}': {e}")
        return ""


def build_messages(
    system_prompt: str,
    history: list[dict],
    user_message: str,
) -> list[dict]:
    """Construit la liste de messages pour l'appel LLM.

    Format compatible OpenAI (Groq) et Gemini.
    history : liste de { role: "user"|"assistant", content: str }
    """
    messages = [{"role": "system", "content": system_prompt}]
    # Limiter l'historique aux 10 derniers échanges pour ne pas dépasser le contexte
    for msg in history[-20:]:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": user_message})
    return messages
