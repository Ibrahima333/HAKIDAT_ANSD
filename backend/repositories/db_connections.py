"""Repository db_connections — connexions aux bases métier et accès par utilisateur.

Une connexion = un couple (serveur, base). Son ``name`` est le nom réel de la
base : c'est l'identifiant exposé au frontend et celui passé à ``run_query``.
Le mot de passe est stocké chiffré.
"""

from __future__ import annotations

from backend.auth.database import get_connection
from backend.utils.crypto import decrypt_password, encrypt_password


def _row_to_dict(row: dict, *, with_password: bool) -> dict:
    out = {
        "id":       row["id"],
        "name":     row["name"],
        "db_type":  row["db_type"],
        "host":     row["host"],
        "port":     row["port"],
        "user":     row["db_user"],
        "schema":   row["schema_name"],
        "createdAt": row["created_at"],
    }
    if with_password:
        out["password"] = decrypt_password(row["db_password"])
    return out


def list_connections(*, with_passwords: bool = False) -> list[dict]:
    conn = get_connection()
    cur  = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT * FROM db_connections ORDER BY name")
        rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()
    return [_row_to_dict(r, with_password=with_passwords) for r in rows]


def get_by_name(name: str, *, with_password: bool = True) -> dict | None:
    conn = get_connection()
    cur  = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT * FROM db_connections WHERE name = %s", (name,))
        row = cur.fetchone()
    finally:
        cur.close()
        conn.close()
    return _row_to_dict(row, with_password=with_password) if row else None


def create_connection(payload: dict) -> int:
    """Enregistre une connexion. Lève ValueError si le nom existe déjà."""
    name = str(payload.get("name", "")).strip()
    if not name:
        raise ValueError("Le nom de la base est obligatoire.")

    conn = get_connection()
    cur  = conn.cursor()
    try:
        cur.execute("SELECT id FROM db_connections WHERE name = %s", (name,))
        if cur.fetchone():
            raise ValueError(f"La base « {name} » est déjà enregistrée.")
        cur.execute("""
            INSERT INTO db_connections
                (name, db_type, host, port, db_user, db_password, schema_name)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (
            name,
            str(payload.get("db_type", "mysql")).lower(),
            str(payload.get("host", "") or ""),
            int(payload.get("port") or 0),
            str(payload.get("user", "") or ""),
            encrypt_password(str(payload.get("password", "") or "")),
            str(payload.get("schema", "") or ""),
        ))
        conn.commit()
        return cur.lastrowid
    finally:
        cur.close()
        conn.close()


def delete_connection(connection_id: int) -> None:
    conn = get_connection()
    cur  = conn.cursor()
    try:
        cur.execute("DELETE FROM db_connections WHERE id = %s", (connection_id,))
        conn.commit()
    finally:
        cur.close()
        conn.close()


# ── Accès par utilisateur ─────────────────────────────────────────────────────

def get_access_map() -> dict[int, list[int]]:
    """Retourne {connection_id: [user_id, ...]} pour toutes les connexions."""
    conn = get_connection()
    cur  = conn.cursor()
    try:
        cur.execute("SELECT connection_id, user_id FROM user_db_access")
        rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()
    access: dict[int, list[int]] = {}
    for connection_id, user_id in rows:
        access.setdefault(connection_id, []).append(user_id)
    return access


def set_access(connection_id: int, user_ids: list[int]) -> None:
    """Remplace la liste des utilisateurs ayant accès à cette connexion.

    Les admins sont ignorés : leur accès découle du rôle, pas d'une attribution.
    """
    conn = get_connection()
    cur  = conn.cursor()
    try:
        cur.execute("DELETE FROM user_db_access WHERE connection_id = %s", (connection_id,))
        if user_ids:
            placeholders = ",".join(["%s"] * len(user_ids))
            cur.execute(
                f"SELECT id FROM users WHERE role <> 'admin' AND id IN ({placeholders})",
                tuple(user_ids),
            )
            grantable = [row[0] for row in cur.fetchall()]
            if grantable:
                cur.executemany(
                    "INSERT INTO user_db_access (user_id, connection_id) VALUES (%s, %s)",
                    [(uid, connection_id) for uid in grantable],
                )
        conn.commit()
    finally:
        cur.close()
        conn.close()


def accessible_names(user_id: int) -> list[str]:
    """Noms des bases auxquelles cet utilisateur a explicitement accès."""
    conn = get_connection()
    cur  = conn.cursor()
    try:
        cur.execute("""
            SELECT c.name FROM db_connections c
            JOIN user_db_access a ON a.connection_id = c.id
            WHERE a.user_id = %s
            ORDER BY c.name
        """, (user_id,))
        return [row[0] for row in cur.fetchall()]
    finally:
        cur.close()
        conn.close()


def grant_all_users(connection_id: int) -> None:
    """Donne accès à tous les utilisateurs existants (migration initiale uniquement).

    Les admins sont exclus : ils accèdent à toutes les bases via leur rôle, une
    ligne explicite serait redondante et faussterait le décompte des accès.
    """
    conn = get_connection()
    cur  = conn.cursor()
    try:
        cur.execute("""
            INSERT IGNORE INTO user_db_access (user_id, connection_id)
            SELECT id, %s FROM users WHERE role <> 'admin'
        """, (connection_id,))
        conn.commit()
    finally:
        cur.close()
        conn.close()
