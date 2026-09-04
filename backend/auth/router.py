"""Routes d'authentification et de gestion des utilisateurs."""

from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException

from backend.auth.database import get_connection
from backend.auth.middleware import get_current_user, require_admin
from backend.auth.service import create_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/login")
def login(payload: dict) -> dict:
    email    = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", ""))

    if not email or not password:
        raise HTTPException(status_code=400, detail="Email et mot de passe requis")

    conn = get_connection()
    cur  = conn.cursor(dictionary=True)
    cur.execute("SELECT * FROM users WHERE email = %s AND is_active = 1", (email,))
    user = cur.fetchone()
    cur.close()
    conn.close()

    if not user or not verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    token = create_token(user["id"], user["email"], user["role"])
    return {
        "token": token,
        "user": {
            "id":    user["id"],
            "email": user["email"],
            "role":  user["role"],
        },
    }


# ── Profil utilisateur connecté ───────────────────────────────────────────────

@router.get("/me")
def me(current_user: dict = Depends(get_current_user)) -> dict:
    return {
        "id":    current_user["sub"],
        "email": current_user["email"],
        "role":  current_user["role"],
    }


# ── Changement de mot de passe ───────────────────────────────────────────────

@router.post("/change-password")
def change_password(payload: dict, current_user: dict = Depends(get_current_user)) -> dict:
    old_password = str(payload.get("old_password", ""))
    new_password = str(payload.get("new_password", ""))

    if not old_password or not new_password:
        raise HTTPException(status_code=400, detail="Ancien et nouveau mot de passe requis")
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Le nouveau mot de passe doit faire au moins 6 caractères")

    conn = get_connection()
    cur  = conn.cursor(dictionary=True)
    cur.execute("SELECT * FROM users WHERE id = %s", (current_user["sub"],))
    user = cur.fetchone()

    if not user or not verify_password(old_password, user["password_hash"]):
        cur.close(); conn.close()
        raise HTTPException(status_code=401, detail="Ancien mot de passe incorrect")

    cur.execute(
        "UPDATE users SET password_hash = %s WHERE id = %s",
        (hash_password(new_password), current_user["sub"])
    )
    conn.commit()
    cur.close()
    conn.close()
    return {"message": "Mot de passe mis à jour avec succès"}


# ── Gestion des utilisateurs (admin only) ────────────────────────────────────

MAX_USERS: int = int(os.getenv("MAX_USERS", "100"))


@router.get("/users")
def list_users(_admin: dict = Depends(require_admin)) -> dict:
    conn = get_connection()
    cur  = conn.cursor(dictionary=True)
    cur.execute("SELECT id, email, role, is_active, created_at FROM users ORDER BY created_at DESC")
    users = cur.fetchall()
    cur.close()
    conn.close()
    for u in users:
        if u.get("created_at"):
            u["created_at"] = str(u["created_at"])
    return {"users": users, "maxUsers": MAX_USERS}


@router.post("/users")
def create_user(payload: dict, _admin: dict = Depends(require_admin)) -> dict:
    email    = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", ""))
    role     = str(payload.get("role", "user"))

    if not email or not password:
        raise HTTPException(status_code=400, detail="Email et mot de passe requis")
    if role not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="Rôle invalide (admin ou user)")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Mot de passe trop court (6 caractères minimum)")

    conn = get_connection()
    cur  = conn.cursor()
    try:
        cur.execute("SELECT COUNT(*) FROM users")
        (count,) = cur.fetchone()
        if count >= MAX_USERS:
            raise HTTPException(
                status_code=403,
                detail=f"Limite de {MAX_USERS} utilisateurs atteinte pour ce forfait. Contactez votre administrateur pour augmenter la limite.",
            )
        cur.execute(
            "INSERT INTO users (email, password_hash, role) VALUES (%s, %s, %s)",
            (email, hash_password(password), role),
        )
        conn.commit()
        new_id = cur.lastrowid
    except HTTPException:
        raise
    except Exception as exc:
        conn.rollback()
        if "Duplicate entry" in str(exc):
            raise HTTPException(status_code=409, detail="Cet email est déjà utilisé")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        cur.close()
        conn.close()

    return {"id": new_id, "email": email, "role": role, "is_active": True}


@router.patch("/users/{user_id}")
def update_user(user_id: int, payload: dict, _admin: dict = Depends(require_admin)) -> dict:
    """Désactive/réactive un compte ou change son rôle."""
    allowed = {"is_active", "role"}
    updates = {k: v for k, v in payload.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="Aucun champ modifiable fourni")

    set_clause = ", ".join(f"{k} = %s" for k in updates)
    values     = list(updates.values()) + [user_id]

    conn = get_connection()
    cur  = conn.cursor()
    cur.execute(f"UPDATE users SET {set_clause} WHERE id = %s", values)
    conn.commit()
    cur.close()
    conn.close()

    return {"success": True}


@router.post("/users/{user_id}/reset-password")
def reset_user_password(user_id: int, body: dict, admin: dict = Depends(require_admin)) -> dict:
    new_password = (body.get("new_password") or "").strip()
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Le mot de passe doit faire au moins 6 caractères.")

    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("UPDATE users SET password_hash = %s WHERE id = %s",
                (hash_password(new_password), user_id))
    conn.commit()
    cur.close()
    conn.close()
    return {"success": True}


@router.delete("/users/{user_id}")
def delete_user(user_id: int, admin: dict = Depends(require_admin)) -> dict:
    if user_id == admin["sub"]:
        raise HTTPException(status_code=400, detail="Impossible de supprimer son propre compte")

    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
    conn.commit()
    cur.close()
    conn.close()

    return {"success": True}


# ── Seeding admin initial (appelé au démarrage, pas une route HTTP) ───────────

def seed_admin() -> None:
    """Crée le compte admin depuis les variables d'environnement si aucun admin n'existe."""
    email    = os.getenv("ADMIN_EMAIL", "").strip().lower()
    password = os.getenv("ADMIN_PASSWORD", "").strip()

    if not email or not password:
        print("[auth] ADMIN_EMAIL / ADMIN_PASSWORD non définis — admin non créé.")
        return

    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM users WHERE role = 'admin'")
    (count,) = cur.fetchone()

    if count == 0:
        cur.execute(
            "INSERT INTO users (email, password_hash, role) VALUES (%s, %s, 'admin')",
            (email, hash_password(password)),
        )
        conn.commit()
        print(f"[auth] Compte admin créé : {email}")
    else:
        print("[auth] Admin déjà existant — seeding ignoré.")

    cur.close()
    conn.close()
