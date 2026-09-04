"""Repository user_uploads — ownership des fichiers CSV/Excel par user."""
from __future__ import annotations
from backend.auth.database import get_connection


def register_upload(user_id: int, db_name: str, display_name: str) -> None:
    conn = get_connection()
    cur  = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO user_uploads (user_id, db_name, display_name)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE display_name = VALUES(display_name)
        """, (user_id, db_name, display_name))
        conn.commit()
    finally:
        cur.close()
        conn.close()


def list_user_uploads(user_id: int) -> list[dict]:
    conn = get_connection()
    cur  = conn.cursor(dictionary=True)
    try:
        cur.execute(
            "SELECT db_name, display_name, created_at FROM user_uploads WHERE user_id = %s ORDER BY created_at DESC",
            (user_id,)
        )
        rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()
    return rows


def owns_upload(user_id: int, db_name: str) -> bool:
    conn = get_connection()
    cur  = conn.cursor()
    try:
        cur.execute(
            "SELECT COUNT(*) FROM user_uploads WHERE user_id = %s AND db_name = %s",
            (user_id, db_name)
        )
        (count,) = cur.fetchone()
        return count > 0
    finally:
        cur.close()
        conn.close()


def delete_upload(user_id: int, db_name: str) -> None:
    conn = get_connection()
    cur  = conn.cursor()
    try:
        cur.execute(
            "DELETE FROM user_uploads WHERE user_id = %s AND db_name = %s",
            (user_id, db_name)
        )
        conn.commit()
    finally:
        cur.close()
        conn.close()
