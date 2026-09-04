"""Repository analyses — historique des analyses par user."""

from __future__ import annotations

from backend.auth.database import get_connection


def save_analysis(user_id: int, data: dict) -> None:
    conn = get_connection()
    cur  = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO analyses
                (user_id, question_name, question_text, database_name, schema_name, provider_name, rows_returned)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                question_text  = VALUES(question_text),
                database_name  = VALUES(database_name),
                schema_name    = VALUES(schema_name),
                provider_name  = VALUES(provider_name),
                rows_returned  = VALUES(rows_returned)
        """, (
            user_id,
            data.get("questionName", ""),
            data.get("questionText", ""),
            data.get("databaseName", ""),
            data.get("schemaName", ""),
            data.get("providerName", ""),
            data.get("rowsReturned", 0),
        ))
        conn.commit()
    finally:
        cur.close()
        conn.close()


def list_analyses(user_id: int) -> list[dict]:
    conn = get_connection()
    cur  = conn.cursor(dictionary=True)
    try:
        cur.execute("""
            SELECT question_name, question_text, database_name, schema_name,
                   provider_name, rows_returned, created_at
            FROM analyses
            WHERE user_id = %s
            ORDER BY created_at DESC
        """, (user_id,))
        rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()
    for r in rows:
        if r.get("created_at"):
            r["created_at"] = str(r["created_at"])
    return rows


def delete_analyses(user_id: int) -> None:
    conn = get_connection()
    cur  = conn.cursor()
    try:
        cur.execute("DELETE FROM analyses WHERE user_id = %s", (user_id,))
        conn.commit()
    finally:
        cur.close()
        conn.close()


def delete_analysis(user_id: int, question_name: str) -> None:
    conn = get_connection()
    cur  = conn.cursor()
    try:
        cur.execute(
            "DELETE FROM analyses WHERE user_id = %s AND question_name = %s",
            (user_id, question_name)
        )
        conn.commit()
    finally:
        cur.close()
        conn.close()
