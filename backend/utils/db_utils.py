"""Utilitaires de connexion et d'exécution SQL (backend Agentic BI).

Ce module fournit les fonctions bas niveau pour :
- Établir une connexion à une base PostgreSQL ou MySQL
- Exécuter une requête SQL et retourner les résultats

Les credentials sont résolus par nom de base via :class:`ConnectionRegistry`,
ce qui permet à plusieurs bases d'être actives simultanément.
"""

from dotenv import load_dotenv

# Chargement des variables d'environnement depuis .env (si présent)
load_dotenv()


def _db_type(database_name: str) -> str:
    """Retourne le type de la base ("postgresql", "mysql" ou "sqlite")."""
    from backend.db_config import resolve_config
    return resolve_config(database_name).db_type.lower()


def get_connection(database_name: str):
    """Établit et retourne une connexion vers la base demandée.

    Args:
        database_name: nom de la base de données à laquelle se connecter.

    Returns:
        Objet connexion mysql.connector, psycopg2 ou sqlite3

    Raises:
        DatabaseConfigError: si la base n'est pas enregistrée
        Exception: si la connexion échoue (propagée telle quelle)
    """
    from backend.db_config import resolve_config

    cfg = resolve_config(database_name)
    db_type = cfg.db_type.lower()
    host = cfg.host
    port = cfg.port
    user = cfg.user
    password = cfg.password

    if db_type == "sqlite":
        import sqlite3
        from pathlib import Path
        db_path = Path("uploads") / f"{database_name}.db"
        if not db_path.exists():
            raise FileNotFoundError(f"Fichier SQLite introuvable : {db_path}")
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        return conn

    if db_type == "mysql":
        import mysql.connector
        try:
            return mysql.connector.connect(
                host=host,
                port=int(port),
                database=database_name,
                user=user,
                password=password,
            )
        except mysql.connector.errors.InterfaceError as exc:
            raise ConnectionError(
                f"Impossible de joindre le serveur MySQL sur {host}:{port}. "
                "Vérifiez que le serveur est démarré et que l'hôte/port sont corrects dans Paramètres."
            ) from exc
        except mysql.connector.errors.ProgrammingError as exc:
            raise ConnectionError(
                f"Accès refusé à la base « {database_name} » (utilisateur : {user}). "
                "Vérifiez le nom d'utilisateur et le mot de passe dans Paramètres."
            ) from exc
        except mysql.connector.Error as exc:
            code = exc.errno
            if code == 2003:
                raise ConnectionError(
                    f"Impossible de se connecter au serveur MySQL sur {host}:{port}. "
                    "Vérifiez que le serveur est accessible et que l'hôte/port sont corrects dans Paramètres."
                ) from exc
            if code == 1045:
                raise ConnectionError(
                    f"Accès refusé pour l'utilisateur « {user} ». "
                    "Vérifiez le mot de passe dans Paramètres."
                ) from exc
            if code == 1049:
                raise ConnectionError(
                    f"La base de données « {database_name} » n'existe pas sur le serveur MySQL."
                ) from exc
            raise ConnectionError(f"Erreur MySQL ({code}) : {exc.msg}") from exc
    else:
        import psycopg2
        return psycopg2.connect(
            host=host,
            port=int(port),
            dbname=database_name,
            user=user,
            password=password,
        )


def run_query(sql: str, database_name: str, params: tuple = None):
    """Exécute une requête SQL et retourne les colonnes et les lignes.

    Pour MySQL / PostgreSQL, la connexion est empruntée au pool (taille = MAX_USERS)
    et restituée automatiquement après usage.
    Pour SQLite, une connexion directe est ouverte puis fermée (pas de pool).

    Returns:
        Tuple (columns, rows)
    """
    db_type = _db_type(database_name)

    if db_type == "sqlite":
        # SQLite : connexion directe légère, pool inutile
        conn = get_connection(database_name)
        try:
            cur = conn.cursor()
            if params:
                sql = sql.replace("%s", "?")
            cur.execute(sql, params or ())
            if cur.description:
                columns = [desc[0] for desc in cur.description]
                rows = [tuple(row) for row in cur.fetchall()]
            else:
                columns, rows = [], []
            cur.close()
        finally:
            conn.close()
        return columns, rows

    # MySQL / PostgreSQL : connexion empruntée au pool
    from backend.utils.db_pool import get_pool
    with get_pool().connection(database_name) as conn:
        cur = conn.cursor()
        try:
            cur.execute(sql, params or ())
            if cur.description:
                columns = [desc[0] for desc in cur.description]
                rows = [tuple(row) for row in cur.fetchall()]
            else:
                columns, rows = [], []
        finally:
            cur.close()
    return columns, rows
