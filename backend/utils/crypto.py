"""Chiffrement symétrique des mots de passe stockés sur disque.

Utilise Fernet (AES-128-CBC + HMAC-SHA256) depuis la lib `cryptography`.
La clé est lue depuis la variable d'environnement DB_ENCRYPTION_KEY.

Si la variable est absente (dev local), le mot de passe est stocké tel quel
avec un avertissement — cela évite de bloquer le démarrage.
"""

from __future__ import annotations

import base64
import logging
import os

logger = logging.getLogger(__name__)

_PREFIX = "enc:"   # Marqueur indiquant qu'une valeur est chiffrée


def _get_fernet():
    """Retourne une instance Fernet initialisée avec DB_ENCRYPTION_KEY, ou None."""
    key = os.getenv("DB_ENCRYPTION_KEY", "").strip()
    if not key:
        return None
    try:
        from cryptography.fernet import Fernet
        # La clé doit être un base64 url-safe de 32 bytes
        raw = base64.urlsafe_b64decode(key + "==")
        if len(raw) != 32:
            logger.warning("[crypto] DB_ENCRYPTION_KEY invalide (doit faire 32 bytes)")
            return None
        return Fernet(key)
    except Exception as exc:
        logger.warning("[crypto] Impossible d'initialiser Fernet : %s", exc)
        return None


def encrypt_password(plaintext: str) -> str:
    """Chiffre un mot de passe. Retourne une chaîne préfixée 'enc:'."""
    if not plaintext:
        return plaintext
    fernet = _get_fernet()
    if fernet is None:
        logger.warning("[crypto] DB_ENCRYPTION_KEY absente — mot de passe stocké en clair")
        return plaintext
    token = fernet.encrypt(plaintext.encode()).decode()
    return _PREFIX + token


def decrypt_password(value: str) -> str:
    """Déchiffre un mot de passe chiffré. Retourne la valeur telle quelle si non chiffrée."""
    if not value or not value.startswith(_PREFIX):
        return value   # Valeur en clair (ancienne config ou dev sans clé)
    fernet = _get_fernet()
    if fernet is None:
        logger.error("[crypto] DB_ENCRYPTION_KEY absente — impossible de déchiffrer le mot de passe")
        return ""
    try:
        return fernet.decrypt(value[len(_PREFIX):].encode()).decode()
    except Exception as exc:
        logger.error("[crypto] Échec déchiffrement : %s", exc)
        return ""


def generate_key() -> str:
    """Génère une nouvelle clé Fernet prête à coller dans .env / docker-compose."""
    from cryptography.fernet import Fernet
    return Fernet.generate_key().decode()
