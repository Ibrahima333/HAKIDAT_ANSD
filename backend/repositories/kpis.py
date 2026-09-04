"""Repository KPIs épinglés par user."""

from __future__ import annotations

from backend.auth.database import get_connection


def get_kpis(user_id: int) -> list[dict]:
    conn = get_connection()
    cur  = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT * FROM kpis WHERE user_id = %s ORDER BY pinned_at DESC", (user_id,))
        rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()
    return [
        {
            "id":            r["id"],
            "questionName":  r["question_name"],
            "questionText":  r["question_text"],
            "columnName":    r["column_name"],
            "value":         r["value"],
            "rawValue":      r["raw_value"],
            "previousValue": r["previous_value"],
            "database":      r["database_name"],
            "schema":        r["schema_name"],
            "provider":      r["provider_name"],
            "pinnedAt":      r["pinned_at"],
            "lastUpdated":   r["last_updated"],
            "sqlQuery":      r.get("sql_query"),
        }
        for r in rows
    ]


def upsert_kpi(user_id: int, kpi: dict) -> None:
    conn = get_connection()
    cur  = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO kpis
                (id, user_id, question_name, question_text, column_name, value,
                 raw_value, previous_value, database_name, schema_name, provider_name,
                 pinned_at, last_updated, sql_query)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON DUPLICATE KEY UPDATE
                value          = VALUES(value),
                raw_value      = VALUES(raw_value),
                previous_value = VALUES(previous_value),
                last_updated   = VALUES(last_updated),
                sql_query      = VALUES(sql_query)
        """, (
            kpi.get("id"),
            user_id,
            kpi.get("questionName", ""),
            kpi.get("questionText", ""),
            kpi.get("columnName", ""),
            kpi.get("value", ""),
            kpi.get("rawValue"),
            kpi.get("previousValue"),
            kpi.get("database", ""),
            kpi.get("schema", ""),
            kpi.get("provider", ""),
            kpi.get("pinnedAt"),
            kpi.get("lastUpdated"),
            kpi.get("sqlQuery"),
        ))
        conn.commit()
    finally:
        cur.close()
        conn.close()


def delete_kpi(user_id: int, kpi_id: str) -> None:
    conn = get_connection()
    cur  = conn.cursor()
    try:
        cur.execute("DELETE FROM kpis WHERE id = %s AND user_id = %s", (kpi_id, user_id))
        conn.commit()
    finally:
        cur.close()
        conn.close()


def get_kpi_by_id(kpi_id: str) -> dict | None:
    """Retourne un KPI par son id (toutes valeurs brutes) — utilisé par le scheduler d'alertes."""
    conn = get_connection()
    cur  = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT * FROM kpis WHERE id = %s", (kpi_id,))
        return cur.fetchone()
    finally:
        cur.close()
        conn.close()


def clear_kpis(user_id: int) -> None:
    conn = get_connection()
    cur  = conn.cursor()
    try:
        cur.execute("DELETE FROM kpis WHERE user_id = %s", (user_id,))
        conn.commit()
    finally:
        cur.close()
        conn.close()
