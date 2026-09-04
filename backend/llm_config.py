"""Configuration runtime des providers LLM (backend Agentic BI).

La config peut être fournie de différentes façons, dans cet ordre de priorité :
1) Config runtime persistée par le frontend dans ``runtime/llm_config.json``.
2) Variables d'environnement (``GEMINI_API_KEY``, ``GROQ_API_KEY``, etc.).
3) Valeurs vides (le provider échouera si aucune clé n'est disponible).

Le module expose :class:`LLMConfig` (dataclass) et
:class:`LLMConfigManager` (singleton thread-safe).
"""

from __future__ import annotations

import json
import os
import threading
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

# Fichier de configuration persisté par le frontend
CONFIG_FILE = Path(os.getenv("LLM_RUNTIME_CONFIG", "runtime/llm_config.json"))

# Providers LLM supportés
SUPPORTED_PROVIDERS = ("gemini", "groq", "claude")


@dataclass
class LLMConfig:
    """Clés API pour les providers LLM supportés."""

    gemini_api_key: str = ""   # Clé API Google Gemini
    groq_api_key: str = ""     # Clé API Groq (provider "groq")
    groq_api_url: str = ""     # URL de base Groq (optionnel, défaut : api.groq.com)
    claude_api_key: str = ""   # Clé API Anthropic Claude
    extra: dict[str, Any] = field(default_factory=dict)  # Champs additionnels

    def masked(self) -> dict[str, Any]:
        """Retourne une version masquée de la config (clés API remplacées par ******)."""
        data = asdict(self)
        if data.get("gemini_api_key"):
            data["gemini_api_key"] = "********"
        if data.get("groq_api_key"):
            data["groq_api_key"] = "********"
        if data.get("claude_api_key"):
            data["claude_api_key"] = "********"
        # Masque l'URL Groq uniquement si la clé est absente (URL seule est sensible)
        if data.get("groq_api_url") and not data.get("groq_api_key"):
            data["groq_api_url"] = "********"
        return data

    def to_dict(self) -> dict[str, Any]:
        """Retourne la config sous forme de dictionnaire brut."""
        return asdict(self)


class LLMConfigError(RuntimeError):
    """Levée quand une configuration LLM invalide est appliquée."""


class LLMConfigManager:
    """Singleton thread-safe qui conserve la configuration LLM active.

    La config est chargée depuis le disque au démarrage, avec fallback sur les
    variables d'environnement. Toutes les opérations sont thread-safe.
    """

    _instance: "LLMConfigManager | None" = None
    _lock = threading.Lock()  # Verrou pour l'initialisation du singleton

    def __init__(self) -> None:
        self._state_lock = threading.Lock()  # Verrou pour les accès concurrents
        # Priorité : fichier disque → variables d'environnement → valeurs vides
        self._config: LLMConfig = self._load_from_disk() or self._load_from_env() or LLMConfig()
        self._last_test: dict[str, Any] | None = None

    # ── Accès au singleton ────────────────────────────────────────────────────
    @classmethod
    def instance(cls) -> "LLMConfigManager":
        """Retourne l'instance unique du gestionnaire (création à la première demande)."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def get(self) -> LLMConfig:
        """Retourne une copie de la configuration LLM active."""
        with self._state_lock:
            return LLMConfig(**self._config.to_dict())

    def get_masked(self) -> dict[str, Any]:
        """Retourne la configuration avec les clés API masquées."""
        return self.get().masked()

    def update(self, payload: dict[str, Any], persist: bool = True) -> LLMConfig:
        """Met à jour la configuration avec les valeurs fournies.

        Les champs inconnus sont ignorés silencieusement.
        Si persist=True, la configuration est sauvegardée sur disque.
        """
        with self._state_lock:
            data = self._config.to_dict()
            for key, value in payload.items():
                if key in {"gemini_api_key", "groq_api_key", "groq_api_url", "claude_api_key"}:
                    # Conversion en chaîne, None → chaîne vide
                    data[key] = "" if value is None else str(value)
                elif key == "extra" and isinstance(value, dict):
                    data["extra"] = value
            self._config = LLMConfig(**data)
            if persist:
                self._save_to_disk()
        return self.get()

    def get_api_key(self, provider: str) -> str:
        """Retourne la clé API pour le provider donné.

        Cherche d'abord dans la config runtime, puis dans les variables d'environnement.
        Lève LLMConfigError si le provider n'est pas supporté.
        """
        if provider not in SUPPORTED_PROVIDERS:
            raise LLMConfigError(
                f"Le provider IA \"{provider}\" n'est pas reconnu. "
                f"Providers disponibles : {', '.join(SUPPORTED_PROVIDERS)}. "
                f"Vérifiez votre clé API et le provider sélectionné dans les paramètres."
            )
        config = self.get()
        # Correspondance provider → clé API
        key_map = {
            "gemini": config.gemini_api_key,
            "groq": config.groq_api_key,
            "claude": config.claude_api_key,
        }
        key = key_map.get(provider, "")
        # Fallback sur la variable d'environnement si la clé runtime est vide
        if not key:
            key = os.getenv(f"{provider.upper()}_API_KEY", "")
        return key

    def get_api_url(self, provider: str) -> str:
        """Retourne l'URL de base API pour le provider donné (si applicable).

        Fallback sur la variable d'environnement si l'URL runtime est vide.
        """
        if provider not in SUPPORTED_PROVIDERS:
            return ""
        config = self.get()
        # Seul Groq dispose d'une URL configurable
        url_map = {
            "groq": config.groq_api_url,
        }
        url = url_map.get(provider, "")
        if not url:
            url = os.getenv(f"{provider.upper()}_API_URL", "")
        return url

    def reset(self) -> LLMConfig:
        """Réinitialise la configuration LLM aux valeurs par défaut (clés vides)."""
        with self._state_lock:
            self._config = LLMConfig()
            if CONFIG_FILE.exists():
                try:
                    CONFIG_FILE.unlink()
                except OSError:
                    pass
        return self.get()

    def record_test(self, success: bool, message: str) -> None:
        """Enregistre le résultat du dernier test de connexion LLM."""
        with self._state_lock:
            self._last_test = {"success": success, "message": message}

    def last_test(self) -> dict[str, Any] | None:
        """Retourne le résultat du dernier test LLM (ou None si jamais testé)."""
        with self._state_lock:
            return dict(self._last_test) if self._last_test else None

    # ── Persistance disque ────────────────────────────────────────────────────
    def _load_from_disk(self) -> LLMConfig | None:
        """Tente de charger la configuration LLM depuis le fichier JSON runtime."""
        if not CONFIG_FILE.exists():
            return None
        try:
            payload = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        try:
            return LLMConfig(**payload)
        except TypeError:
            return None

    def _load_from_env(self) -> LLMConfig | None:
        """Charge la configuration LLM depuis les variables d'environnement.

        Retourne None si aucune variable pertinente n'est définie.
        """
        gemini_key = os.getenv("GEMINI_API_KEY", "")
        groq_key = os.getenv("GROQ_API_KEY", "")
        groq_url = os.getenv("GROQ_API_URL", "")
        if gemini_key or groq_key or groq_url:
            return LLMConfig(gemini_api_key=gemini_key, groq_api_key=groq_key, groq_api_url=groq_url)
        return None

    def _save_to_disk(self) -> None:
        """Sauvegarde la configuration LLM active dans le fichier JSON runtime."""
        CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
        CONFIG_FILE.write_text(
            json.dumps(self._config.to_dict(), indent=2), encoding="utf-8"
        )


def get_llm_config() -> LLMConfig:
    """Raccourci pour accéder à la configuration LLM active depuis n'importe quel module."""
    return LLMConfigManager.instance().get()
