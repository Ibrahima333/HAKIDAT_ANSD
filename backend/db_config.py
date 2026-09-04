"""Configuration runtime de la base de données (backend Agentic BI).
La config peut être fournie de différentes façons, dans cet ordre de priorité :
1) Config runtime persistée par le frontend dans ``runtime/db_config.json``.
2) Variables d'environnement (``DB_TYPE``, ``DB_HOST``, ...) — ignorées volontairement.
3) Valeurs par défaut (PostgreSQL localhost).

Le module expose :class:`DatabaseConfig` (dataclass) et
:class:`DatabaseConfigManager` (singleton thread-safe), pour que tout le
backend lise une seule source de vérité.
"""

from __future__ import annotations
import json
import os
import threading
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from backend.utils.crypto import decrypt_password, encrypt_password

# Fichier de configuration persisté par le frontend
CONFIG_FILE = Path(os.getenv("DB_RUNTIME_CONFIG", "runtime/db_config.json"))

# Types de bases de données supportés
SUPPORTED_TYPES = ("postgresql", "mysql", "sqlite")

@dataclass
class DatabaseConfig:
    """Paramètres de connexion à la base de données active."""

    db_type: str = "postgresql"   # Type : "postgresql" ou "mysql"
    host: str = "localhost"        # Adresse du serveur
    port: int = 5432               # Port (5432 pour PG, 3306 pour MySQL)
    user: str = "postgres"         # Utilisateur
    password: str = ""             # Mot de passe (jamais affiché en clair)
    database: str = ""             # Nom de la base par défaut
    schema: str = "public"         # Schéma par défaut (PostgreSQL)
    extra: dict[str, Any] = field(default_factory=dict)  # Paramètres additionnels

    def masked(self) -> dict[str, Any]:
        """Retourne une version masquée de la config (mot de passe remplacé par ******)."""
        data = asdict(self)
        if data.get("password"):
            data["password"] = "********"
        return data

    def to_dict(self) -> dict[str, Any]:
        """Retourne la config sous forme de dictionnaire brut (mot de passe en clair)."""
        return asdict(self)


class DatabaseConfigError(RuntimeError):
    """Levée quand une configuration invalide est appliquée."""


class DatabaseConfigManager:
    """Singleton thread-safe qui conserve la configuration DB active.

    La config est chargée depuis le disque au démarrage et peut être mise à
    jour via l'interface web. Toutes les opérations sont protégées par un verrou.
    """

    _instance: "DatabaseConfigManager | None" = None
    _lock = threading.Lock()  # Verrou pour l'initialisation du singleton

    def __init__(self) -> None:
        self._state_lock = threading.Lock()  # Verrou pour les accès concurrents
        # Priorité : fichier disque, sinon valeurs par défaut
        self._config: DatabaseConfig = self._load_from_disk() or DatabaseConfig()
        self._last_test: dict[str, Any] | None = None # l'etat du dernier test de connexion (success + message)

    # ── Accès au singleton ────────────────────────────────────────────────────
    @classmethod
    def instance(cls) -> "DatabaseConfigManager":
        """Retourne l'instance unique du gestionnaire (création à la première demande)."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def get(self) -> DatabaseConfig:
        """Retourne une copie de la configuration active."""
        with self._state_lock:
            return DatabaseConfig(**self._config.to_dict())

    def get_masked(self) -> dict[str, Any]:
        """Retourne la configuration avec le mot de passe masqué."""
        return self.get().masked()

    def update(self, payload: dict[str, Any], persist: bool = True) -> DatabaseConfig:
        """Met à jour la configuration avec les valeurs fournies.

        Les champs inconnus sont ignorés silencieusement.
        Si persist=True, la configuration est sauvegardée sur disque.
        """
        with self._state_lock:
            data = self._config.to_dict()
            for key, value in payload.items():
                if key in {"db_type", "host", "user", "password", "database", "schema"}:
                    # Conversion en chaîne, None → chaîne vide
                    data[key] = "" if value is None else str(value)
                elif key == "port":
                    try:
                        data["port"] = int(value)
                    except (TypeError, ValueError) as exc:
                        raise DatabaseConfigError("le port doit être un entier") from exc
                elif key == "extra" and isinstance(value, dict):
                    data["extra"] = value

            # Validation du type de base de données
            if data["db_type"] not in SUPPORTED_TYPES:
                raise DatabaseConfigError(
                    f"db_type '{data['db_type']}' non supporté. Valeurs acceptées : {', '.join(SUPPORTED_TYPES)}."
                )
            # Pour sqlite : pas de host/port/user/password nécessaires
            if data["db_type"] == "sqlite":
                data["host"] = ""
                data["port"] = 0
                data["user"] = ""
                data["password"] = ""
                data["schema"] = ""
            self._config = DatabaseConfig(**data)
            if persist:
                self._save_to_disk()
        # Réinitialiser le pool car la config a changé
        self._reset_pool()
        return self.get()

    def reset(self) -> DatabaseConfig:
        """Réinitialise la configuration aux valeurs par défaut et supprime le fichier disque."""
        with self._state_lock:
            self._config = DatabaseConfig()
            if CONFIG_FILE.exists():
                try:
                    CONFIG_FILE.unlink()
                except OSError:
                    pass
        self._reset_pool()
        return self.get()

    @staticmethod
    def _reset_pool() -> None:
        """Ferme tous les pools ouverts (import différé pour éviter les cycles)."""
        try:
            from backend.utils.db_pool import get_pool
            get_pool().reset()
        except Exception:
            pass

    def record_test(self, success: bool, message: str) -> None:
        """Enregistre le résultat du dernier test de connexion."""
        with self._state_lock:
            self._last_test = {"success": success, "message": message}

    def last_test(self) -> dict[str, Any] | None:
        """Retourne le résultat du dernier test de connexion (ou None si jamais testé)."""
        with self._state_lock:
            return dict(self._last_test) if self._last_test else None

    # ── Persistance disque ────────────────────────────────────────────────────
    def _load_from_disk(self) -> DatabaseConfig | None:
        """Tente de charger la configuration depuis le fichier JSON runtime.

        Si la config sauvegardée est SQLite mais que le fichier .db n'existe plus,
        retourne None pour déclencher les valeurs par défaut (MySQL).
        """
        if not CONFIG_FILE.exists():
            return None
        try:
            payload = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        # Déchiffrer le mot de passe s'il est chiffré
        if "password" in payload:
            payload["password"] = decrypt_password(payload["password"])
        try:
            cfg = DatabaseConfig(**payload)
        except TypeError:
            return None

        # SQLite invalide (fichier absent) → réinitialisation + réécriture du fichier
        if cfg.db_type == "sqlite":
            db_file = Path("uploads") / f"{cfg.database}.db"
            if not cfg.database or not db_file.exists():
                print(f"[db] Config SQLite '{cfg.database}' introuvable — défaut MySQL appliqué.")
                default = DatabaseConfig()  # PostgreSQL/MySQL par défaut
                try:
                    CONFIG_FILE.write_text(
                        json.dumps(default.to_dict(), indent=2), encoding="utf-8"
                    )
                except OSError:
                    pass
                return default

        return cfg

    def _load_from_env(self) -> DatabaseConfig:
        """Les variables d'environnement sont volontairement ignorées.

        Conservé pour compatibilité avec d'anciens parcours de déploiement.
        """
        return DatabaseConfig()

    def _save_to_disk(self) -> None:
        """Sauvegarde la configuration active dans le fichier JSON runtime.

        Le mot de passe est chiffré avant écriture.
        """
        CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
        data = self._config.to_dict()
        if data.get("password"):
            data["password"] = encrypt_password(data["password"])
        CONFIG_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def get_db_config() -> DatabaseConfig:
    """Raccourci pour accéder à la configuration DB active depuis n'importe quel module."""
    return DatabaseConfigManager.instance().get()


class ConnectionRegistry:
    """Registre des bases configurées, indexé par nom de base.

    Chaque nom de base résout vers ses propres credentials, ce qui permet à
    plusieurs bases — y compris sur des serveurs différents — d'être actives
    simultanément. Les fichiers CSV/Excel importés (SQLite dans ``uploads/``)
    sont résolus dynamiquement et n'ont pas besoin d'être enregistrés.
    """

    _instance: "ConnectionRegistry | None" = None
    _class_lock = threading.Lock()

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._cache: dict[str, DatabaseConfig] | None = None

    @classmethod
    def instance(cls) -> "ConnectionRegistry":
        if cls._instance is None:
            with cls._class_lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def invalidate(self) -> None:
        """À appeler après toute mutation de la table db_connections."""
        with self._lock:
            self._cache = None
        DatabaseConfigManager._reset_pool()

    def names(self) -> list[str]:
        """Noms de toutes les bases enregistrées (hors uploads)."""
        return sorted(self._load().keys())

    def resolve(self, database_name: str) -> DatabaseConfig | None:
        """Retourne les credentials de cette base, ou None si inconnue."""
        if not database_name:
            return None
        cfg = self._load().get(database_name)
        if cfg is not None:
            return cfg
        # Fichier importé (CSV/Excel converti en SQLite)
        if (Path("uploads") / f"{database_name}.db").exists():
            return DatabaseConfig(
                db_type="sqlite", host="", port=0, user="", password="",
                database=database_name, schema="",
            )
        return None

    def _load(self) -> dict[str, DatabaseConfig]:
        with self._lock:
            if self._cache is not None:
                return self._cache
        # Chargement hors verrou : la requête MySQL peut être lente
        try:
            from backend.repositories import db_connections as repo
            rows = repo.list_connections(with_passwords=True)
        except Exception as exc:
            print(f"[db] Lecture du registre de connexions impossible : {exc}")
            return {}
        loaded = {
            row["name"]: DatabaseConfig(
                db_type=row["db_type"],
                host=row["host"],
                port=int(row["port"] or 0),
                user=row["user"],
                password=row["password"],
                database=row["name"],
                schema=row["schema"] or "",
            )
            for row in rows
        }
        with self._lock:
            self._cache = loaded
        return loaded


def get_registry() -> ConnectionRegistry:
    """Raccourci pour accéder au registre des connexions."""
    return ConnectionRegistry.instance()


def resolve_config(database_name: str) -> DatabaseConfig:
    """Retourne les credentials de ``database_name``.

    Lève DatabaseConfigError si la base n'est pas enregistrée — ce qui évite de
    se rabattre silencieusement sur les credentials d'une autre base.
    """
    cfg = get_registry().resolve(database_name)
    if cfg is None:
        raise DatabaseConfigError(
            f"La base « {database_name} » n'est pas configurée. "
            "Un administrateur doit l'enregistrer dans Administration → Bases de données."
        )
    return cfg
