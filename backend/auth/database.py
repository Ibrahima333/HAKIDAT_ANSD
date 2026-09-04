"""Connexion MySQL pour la base d'authentification HakiData.

Crée les tables au démarrage et expose get_db() comme dépendance FastAPI.
"""

from __future__ import annotations

import os
import threading
import time

import mysql.connector
from mysql.connector import pooling

# ── Configuration depuis variables d'environnement ───────────────────────────
_DB_CONFIG = {
    "host":     os.getenv("AUTH_DB_HOST", "mysql-auth"),
    "port":     int(os.getenv("AUTH_DB_PORT", "3306")),
    "user":     os.getenv("AUTH_DB_USER", "hakidata"),
    "password": os.getenv("AUTH_DB_PASSWORD", "hakidata_secret"),
    "database": os.getenv("AUTH_DB_NAME", "hakidata_auth"),
}

_pool: pooling.MySQLConnectionPool | None = None
_pool_lock = threading.Lock()


def _get_pool() -> pooling.MySQLConnectionPool:
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                _pool = pooling.MySQLConnectionPool(
                    pool_name="hakidata_auth",
                    pool_size=10,
                    **_DB_CONFIG,
                )
    return _pool


def get_connection() -> mysql.connector.MySQLConnection:
    return _get_pool().get_connection()


def _col_exists(cur, table: str, column: str) -> bool:
    cur.execute("""
        SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND COLUMN_NAME = %s
    """, (table, column))
    return cur.fetchone()[0] > 0


def _col_size(cur, table: str, column: str) -> int:
    cur.execute("""
        SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND COLUMN_NAME = %s
    """, (table, column))
    row = cur.fetchone()
    return int(row[0]) if row and row[0] else 0


def _index_exists(cur, table: str, index_name: str) -> bool:
    cur.execute("""
        SELECT COUNT(*) FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND INDEX_NAME = %s
    """, (table, index_name))
    return cur.fetchone()[0] > 0


def _primary_key_columns(cur, table: str) -> list[str]:
    cur.execute("""
        SELECT COLUMN_NAME FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND INDEX_NAME = 'PRIMARY'
        ORDER BY SEQ_IN_INDEX
    """, (table,))
    return [row[0] for row in cur.fetchall()]


def init_db(retries: int = 10, delay: float = 3.0) -> None:
    """Crée les tables si elles n'existent pas. Réessaie si MySQL n'est pas prêt."""
    for attempt in range(1, retries + 1):
        conn = None
        try:
            conn = get_connection()
            cur = conn.cursor()

            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id            INT AUTO_INCREMENT PRIMARY KEY,
                    email         VARCHAR(255) NOT NULL UNIQUE,
                    password_hash VARCHAR(255) NOT NULL,
                    role          ENUM('admin','user') NOT NULL DEFAULT 'user',
                    is_active     TINYINT(1) NOT NULL DEFAULT 1,
                    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """)

            # Anciennes installations : kpis/dashboard ont pu être créées par une
            # version antérieure de ce fichier avec un schéma "blob JSON"
            # (id, user_id, data, created_at). Aucun code ne lit plus la colonne
            # `data` — ces lignes sont déjà inertes — donc on peut recréer la
            # table sous le schéma structuré sans perte fonctionnelle réelle.
            for _tbl in ("kpis", "dashboard"):
                if _col_exists(cur, _tbl, "data") and not _col_exists(cur, _tbl, "question_name"):
                    cur.execute(f"DROP TABLE {_tbl}")

            cur.execute("""
                CREATE TABLE IF NOT EXISTS kpis (
                    id             VARCHAR(255) NOT NULL,
                    user_id        INT NOT NULL,
                    question_name  VARCHAR(255) NOT NULL,
                    question_text  TEXT NOT NULL,
                    column_name    VARCHAR(255),
                    value          VARCHAR(255),
                    raw_value      DOUBLE,
                    previous_value DOUBLE,
                    database_name  VARCHAR(255),
                    schema_name    VARCHAR(255),
                    provider_name  VARCHAR(64),
                    pinned_at      BIGINT,
                    last_updated   BIGINT,
                    sql_query      TEXT,
                    PRIMARY KEY (user_id, id),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS dashboard (
                    id             VARCHAR(255) NOT NULL,
                    user_id        INT NOT NULL,
                    question_name  VARCHAR(255) NOT NULL,
                    question_text  TEXT,
                    chart_url      VARCHAR(512),
                    chart_html     LONGTEXT,
                    pinned_at      BIGINT,
                    sql_query      TEXT,
                    database_name  VARCHAR(255),
                    watched        TINYINT(1) NOT NULL DEFAULT 0,
                    PRIMARY KEY (user_id, id),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS llm_config (
                    id              INT AUTO_INCREMENT PRIMARY KEY,
                    gemini_api_key  TEXT NOT NULL,
                    groq_api_key    TEXT NOT NULL,
                    groq_api_url    VARCHAR(512) NOT NULL DEFAULT ''
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS alerts (
                    id                      INT AUTO_INCREMENT PRIMARY KEY,
                    user_id                 INT NOT NULL,
                    name                    VARCHAR(255) NOT NULL,
                    kpi_id                  VARCHAR(255) NOT NULL,
                    kpi_name                VARCHAR(255) NOT NULL,
                    operator                ENUM('<','>','<=','>=','=') NOT NULL,
                    threshold               DOUBLE NOT NULL,
                    recipient_email         VARCHAR(255),
                    check_interval_minutes  INT NOT NULL DEFAULT 30,
                    is_active               TINYINT(1) NOT NULL DEFAULT 1,
                    alert_level             TINYINT NOT NULL DEFAULT 0,
                    last_triggered_at       DATETIME,
                    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS analyses (
                    id             INT AUTO_INCREMENT PRIMARY KEY,
                    user_id        INT NOT NULL,
                    question_name  VARCHAR(255) NOT NULL,
                    question_text  TEXT NOT NULL,
                    database_name  VARCHAR(255),
                    schema_name    VARCHAR(255),
                    provider_name  VARCHAR(64),
                    rows_returned  INT DEFAULT 0,
                    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uniq_user_question (user_id, question_name),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS user_uploads (
                    id           INT AUTO_INCREMENT PRIMARY KEY,
                    user_id      INT NOT NULL,
                    db_name      VARCHAR(255) NOT NULL,
                    display_name VARCHAR(255) NOT NULL,
                    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uq_user_upload (user_id, db_name),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id             INT AUTO_INCREMENT PRIMARY KEY,
                    user_id        INT NOT NULL,
                    user_email     VARCHAR(255),
                    question_text  TEXT,
                    database_name  VARCHAR(255),
                    schema_name    VARCHAR(255),
                    rows_returned  INT DEFAULT 0,
                    status         VARCHAR(20) DEFAULT 'success',
                    error_message  TEXT,
                    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS db_connections (
                    id          INT AUTO_INCREMENT PRIMARY KEY,
                    name        VARCHAR(190) NOT NULL UNIQUE,
                    db_type     VARCHAR(20) NOT NULL,
                    host        VARCHAR(255) NOT NULL DEFAULT '',
                    port        INT NOT NULL DEFAULT 0,
                    db_user     VARCHAR(255) NOT NULL DEFAULT '',
                    db_password VARCHAR(512) NOT NULL DEFAULT '',
                    schema_name VARCHAR(190) NOT NULL DEFAULT '',
                    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS user_db_access (
                    user_id       INT NOT NULL,
                    connection_id INT NOT NULL,
                    granted_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, connection_id),
                    FOREIGN KEY (user_id)       REFERENCES users(id)          ON DELETE CASCADE,
                    FOREIGN KEY (connection_id) REFERENCES db_connections(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """)

            # Migration : purger les accès explicites des admins — leur accès
            # découle du rôle, ces lignes faussaient le décompte par base.
            cur.execute("""
                DELETE a FROM user_db_access a
                JOIN users u ON u.id = a.user_id
                WHERE u.role = 'admin'
            """)

            # Migration : renommer password → password_hash si l'ancienne colonne existe
            if _col_exists(cur, "users", "password") and not _col_exists(cur, "users", "password_hash"):
                cur.execute("ALTER TABLE users CHANGE COLUMN `password` password_hash VARCHAR(255) NOT NULL")

            # Migration : agrandissement colonnes id (seulement si nécessaire — évite lock inutile)
            for tbl in ("kpis", "dashboard"):
                if _col_size(cur, tbl, "id") < 255:
                    cur.execute(f"ALTER TABLE {tbl} MODIFY COLUMN id VARCHAR(255) NOT NULL")

            # Migration : la clé primaire de kpis/dashboard était sur `id` seul,
            # donc globale à toute l'installation au lieu d'être propre à chaque
            # utilisateur. Deux comptes posant une question au libellé proche
            # (même slug sur les 80 premiers caractères) collisionnaient sur le
            # même id : un INSERT ... ON DUPLICATE KEY UPDATE du second compte
            # mettait alors à jour la ligne du premier (user_id inchangé) au
            # lieu de créer la sienne — le pin "disparaissait" silencieusement
            # du dashboard de celui qui venait de cliquer.
            for tbl in ("kpis", "dashboard"):
                if _primary_key_columns(cur, tbl) == ["id"]:
                    cur.execute(f"ALTER TABLE {tbl} DROP PRIMARY KEY, ADD PRIMARY KEY (user_id, id)")

            # Migration : colonnes manquantes dans alerts
            if not _col_exists(cur, "alerts", "recipient_email"):
                cur.execute("ALTER TABLE alerts ADD COLUMN recipient_email VARCHAR(255) AFTER threshold")

            if not _col_exists(cur, "alerts", "check_interval_minutes"):
                cur.execute("ALTER TABLE alerts ADD COLUMN check_interval_minutes INT NOT NULL DEFAULT 30 AFTER recipient_email")

            if not _col_exists(cur, "alerts", "alert_level"):
                cur.execute("ALTER TABLE alerts ADD COLUMN alert_level TINYINT NOT NULL DEFAULT 0 AFTER is_active")
            # Migrer is_triggered → alert_level si l'ancienne colonne existe encore
            if _col_exists(cur, "alerts", "is_triggered"):
                cur.execute("UPDATE alerts SET alert_level = is_triggered WHERE alert_level = 0")
                cur.execute("ALTER TABLE alerts DROP COLUMN is_triggered")

            # Migration : claude_api_key dans llm_config
            if not _col_exists(cur, "llm_config", "claude_api_key"):
                cur.execute("ALTER TABLE llm_config ADD COLUMN claude_api_key VARCHAR(512) NOT NULL DEFAULT ''")

            # Migration : colonnes manquantes dans dashboard — nécessaires pour
            # permettre le rafraîchissement dynamique (optionnel, par graphique)
            # d'un graphique épinglé : il faut pouvoir ré-exécuter sa requête
            # SQL d'origine sans dépendre des fichiers sur disque (supprimés
            # par "Vider l'historique").
            if not _col_exists(cur, "dashboard", "sql_query"):
                cur.execute("ALTER TABLE dashboard ADD COLUMN sql_query TEXT")
            if not _col_exists(cur, "dashboard", "database_name"):
                cur.execute("ALTER TABLE dashboard ADD COLUMN database_name VARCHAR(255)")
            if not _col_exists(cur, "dashboard", "watched"):
                cur.execute("ALTER TABLE dashboard ADD COLUMN watched TINYINT(1) NOT NULL DEFAULT 0")

            # Migration : snapshot HTML du graphique épinglé — sans ça,
            # `chart_url` pointait vers le fichier partagé de l'analyse, que
            # "Voir aussi" (aperçu de types de graphique) écrase directement.
            # Résultat : prévisualiser un autre type de graphique remplaçait
            # silencieusement le graphique déjà épinglé au dashboard. Avec ce
            # snapshot, le dashboard ne change que sur épinglage explicite.
            if not _col_exists(cur, "dashboard", "chart_html"):
                cur.execute("ALTER TABLE dashboard ADD COLUMN chart_html LONGTEXT")

            # Migration : contrainte d'unicité sur analyses, absente des
            # installations créées avant son ajout au CREATE TABLE ci-dessus.
            # Sans elle, `ON DUPLICATE KEY UPDATE` (repositories/analyses.py)
            # ne peut jamais matcher et chaque ré-exécution d'une même
            # question insère une ligne au lieu de la mettre à jour.
            if not _index_exists(cur, "analyses", "uniq_user_question"):
                # Doublons déjà accumulés : on ne garde que la ligne la plus
                # récente (id le plus élevé) par (user_id, question_name).
                cur.execute("""
                    DELETE a1 FROM analyses a1
                    INNER JOIN analyses a2
                        ON a1.user_id = a2.user_id
                       AND a1.question_name = a2.question_name
                       AND a1.id < a2.id
                """)
                cur.execute("ALTER TABLE analyses ADD UNIQUE KEY uniq_user_question (user_id, question_name)")

            conn.commit()
            cur.close()
            print("[auth] Tables créées/vérifiées avec succès.")
            return

        except Exception as exc:
            print(f"[auth] Tentative {attempt}/{retries} — MySQL pas prêt : {exc}")
            if attempt < retries:
                time.sleep(delay)
        finally:
            if conn is not None:
                try:
                    conn.close()
                except Exception:
                    pass

    raise RuntimeError("[auth] Impossible de se connecter à mysql-auth après plusieurs tentatives.")
