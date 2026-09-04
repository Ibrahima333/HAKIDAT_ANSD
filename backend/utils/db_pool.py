"""Pool de connexions à la base de données.

Taille du pool = MAX_USERS (variable d'environnement, défaut 20).
Un pool est créé par configuration active ; il est réinitialisé automatiquement
dès que la configuration DB change (appel à reset()).

Backends supportés :
  - MySQL    : mysql.connector.pooling.MySQLConnectionPool
  - PostgreSQL : psycopg2.pool.ThreadedConnectionPool
  - SQLite   : pas de pool (connexion légère par fichier)
"""

from __future__ import annotations

import contextlib
import logging
import os
import threading
from typing import Any

logger = logging.getLogger(__name__)

# Taille du pool = nombre max d'utilisateurs autorisés
_POOL_SIZE: int = max(1, int(os.getenv("MAX_USERS", "20")))


class _PoolWrapper:
    """Enveloppe unifiée autour du pool MySQL ou PostgreSQL."""

    def __init__(self, pool: Any, db_type: str) -> None:
        self._pool = pool
        self._db_type = db_type

    def acquire(self):
        if self._db_type == "mysql":
            return self._pool.get_connection()
        else:
            return self._pool.getconn()

    def release(self, conn, *, discard: bool = False) -> None:
        if self._db_type == "mysql":
            conn.close()          # mysql.connector renvoie la connexion au pool à la fermeture
        else:
            # discard=True : connexion morte → retirée du pool au lieu d'être réutilisée
            self._pool.putconn(conn, close=discard)

    def close_all(self) -> None:
        with contextlib.suppress(Exception):
            if self._db_type != "mysql":
                self._pool.closeall()


class DBConnectionPool:
    """Singleton thread-safe gérant le pool de connexions.

    Usage typique :
        pool = DBConnectionPool.instance()
        with pool.connection("ma_base") as conn:
            cur = conn.cursor()
            cur.execute("SELECT ...")
    """

    _instance: "DBConnectionPool | None" = None
    _class_lock = threading.Lock()

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._pools: dict[str, _PoolWrapper] = {}   # clé = database_name
        self._keys: dict[str, str] = {}              # database_name → signature des credentials

    @classmethod
    def instance(cls) -> "DBConnectionPool":
        if cls._instance is None:
            with cls._class_lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    # ── API publique ──────────────────────────────────────────────────────────

    @contextlib.contextmanager
    def connection(self, database_name: str):
        """Gestionnaire de contexte : emprunte une connexion du pool et la libère après usage."""
        pool = self._get_or_create(database_name)
        conn = pool.acquire()
        _error = False
        try:
            yield conn
        except Exception:
            _error = True
            # Tente un rollback silencieux si la connexion le supporte
            with contextlib.suppress(Exception):
                conn.rollback()
            raise
        finally:
            # Connexion ayant échoué → retirée du pool (évite les connexions mortes réutilisées)
            pool.release(conn, discard=_error)

    def reset(self) -> None:
        """Ferme tous les pools existants (appelé quand la config DB change)."""
        with self._lock:
            for p in self._pools.values():
                p.close_all()
            self._pools.clear()
            self._keys.clear()
        logger.info("[db_pool] Pool réinitialisé (nouvelle configuration)")

    # ── Interne ───────────────────────────────────────────────────────────────

    def _get_or_create(self, database_name: str) -> _PoolWrapper:
        cfg = self._current_config(database_name)
        config_key = self._make_key(cfg, database_name)

        with self._lock:
            # Credentials modifiés pour cette base → l'ancien pool est périmé
            existing = self._keys.get(database_name)
            if existing is not None and existing != config_key:
                self._pools.pop(database_name).close_all()
                self._keys.pop(database_name)

            if database_name not in self._pools:
                self._pools[database_name] = self._build_pool(cfg, database_name)
                self._keys[database_name] = config_key
                logger.info(
                    "[db_pool] Pool créé — type=%s base=%s taille=%d",
                    cfg.db_type, database_name, _POOL_SIZE,
                )
        return self._pools[database_name]

    @staticmethod
    def _current_config(database_name: str):
        from backend.db_config import resolve_config
        return resolve_config(database_name)

    @staticmethod
    def _make_key(cfg, database_name: str) -> str:
        return f"{cfg.db_type}|{cfg.host}:{cfg.port}:{cfg.user}@{database_name}"

    @staticmethod
    def _build_pool(cfg, database_name: str) -> _PoolWrapper:
        db_type = cfg.db_type.lower()

        if db_type == "mysql":
            import mysql.connector.pooling as mcp
            # mysql-connector-python impose pool_size entre 1 et 32
            mysql_pool_size = max(1, min(_POOL_SIZE, 32))
            pool = mcp.MySQLConnectionPool(
                pool_name=f"hakidata_{database_name[:20]}",
                pool_size=mysql_pool_size,
                pool_reset_session=True,
                host=cfg.host,
                port=int(cfg.port),
                database=database_name,
                user=cfg.user,
                password=cfg.password,
                connection_timeout=10,
            )
            return _PoolWrapper(pool, "mysql")

        elif db_type == "postgresql":
            import psycopg2.pool as pgpool

            # Pour PostgreSQL, database_name peut être le schéma — on utilise cfg.database si vide
            pg_dbname = database_name or cfg.database
            # psycopg2 ThreadedConnectionPool : maxconn doit être entre 1 et 32
            pg_pool_size = max(1, min(_POOL_SIZE, 32))
            pool = pgpool.ThreadedConnectionPool(
                minconn=1,
                maxconn=pg_pool_size,
                host=cfg.host,
                port=int(cfg.port),
                dbname=pg_dbname,
                user=cfg.user,
                password=cfg.password,
                connect_timeout=10,
            )
            return _PoolWrapper(pool, "postgresql")

        else:
            raise ValueError(f"Type de base non supporté par le pool : {db_type!r}")


def get_pool() -> DBConnectionPool:
    """Raccourci pour accéder au pool depuis n'importe quel module."""
    return DBConnectionPool.instance()
