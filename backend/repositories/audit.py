"""Repository audit_log — traçabilité des actions utilisateurs."""
from __future__ import annotations
from backend.auth.database import get_connection


RETENTION_DAYS = 30  # purge automatique des entrées plus vieilles que ça


def log_action(user_id: int, user_email: str, data: dict) -> None:
    conn = get_connection()
    cur  = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO audit_logs
                (user_id, user_email, question_text, database_name, schema_name,
                 rows_returned, status, error_message)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            user_id,
            user_email,
            data.get("question_text", ""),
            data.get("database_name", ""),
            data.get("schema_name", ""),
            data.get("rows_returned", 0),
            data.get("status", "success"),
            data.get("error_message"),
        ))
        # Purge silencieuse des entrées trop anciennes
        cur.execute(
            "DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL %s DAY",
            (RETENTION_DAYS,)
        )
        conn.commit()
    except Exception:
        pass
    finally:
        cur.close()
        conn.close()


def list_logs(limit: int = 200, user_id: int | None = None) -> list[dict]:
    conn = get_connection()
    cur  = conn.cursor(dictionary=True)
    try:
        if user_id:
            cur.execute("""
                SELECT * FROM audit_logs WHERE user_id = %s
                ORDER BY created_at DESC LIMIT %s
            """, (user_id, limit))
        else:
            cur.execute("""
                SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT %s
            """, (limit,))
        rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()
    for r in rows:
        if r.get("created_at"):
            r["created_at"] = str(r["created_at"])
    return rows
