"""Dépendance FastAPI qui vérifie le JWT sur les routes protégées."""

from __future__ import annotations

from typing import Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend.auth.service import decode_token

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict[str, Any]:
    """Extrait et valide le JWT. Retourne le payload (user_id, email, role).

    Vérifie aussi que l'utilisateur existe et n'a pas été bloqué par un admin.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token manquant",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_token(credentials.credentials)

        # Vérifier que l'utilisateur existe et est actif en base
        from backend.auth.database import get_connection
        conn = get_connection()
        cur = conn.cursor(dictionary=True)
        try:
            cur.execute("SELECT is_active FROM users WHERE id = %s", (payload["sub"],))
            user = cur.fetchone()
        finally:
            cur.close()
            conn.close()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Utilisateur introuvable",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not user["is_active"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Ce compte a été bloqué par un administrateur",
            )

        return payload
    except HTTPException:
        raise
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expiré — veuillez vous reconnecter",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide",
            headers={"WWW-Authenticate": "Bearer"},
        )


def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """Vérifie que l'utilisateur connecté est admin."""
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux administrateurs",
        )
    return current_user
