"""Opérations CRUD sur la table alerts."""

from __future__ import annotations

from backend.auth.database import get_connection


def create_alert(user_id: int, name: str, kpi_id: str, kpi_name: str,
                 operator: str, threshold: float, recipient_email: str = None,
                 check_interval_minutes: int = 30) -> dict:
    conn = get_connection()
    cur  = conn.cursor(dictionary=True)
    try:
        # last_triggered_at laissé NULL → vérification immédiate au prochain cycle
        cur.execute("""
            INSERT INTO alerts (user_id, name, kpi_id, kpi_name, operator, threshold,
                                recipient_email, check_interval_minutes)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (user_id, name, kpi_id, kpi_name, operator, threshold, recipient_email, check_interval_minutes))
        conn.commit()
        alert_id = cur.lastrowid
    finally:
        cur.close()
        conn.close()
    return get_alert(alert_id)


def get_alert(alert_id: int) -> dict | None:
    conn = get_connection()
    cur  = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT * FROM alerts WHERE id = %s", (alert_id,))
        return cur.fetchone()
    finally:
        cur.close()
        conn.close()


def list_alerts(user_id: int) -> list[dict]:
    conn = get_connection()
    cur  = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT * FROM alerts WHERE user_id = %s ORDER BY created_at DESC", (user_id,))
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


def list_all_active_alerts() -> list[dict]:
    """Retourne toutes les alertes actives avec l'email destinataire."""
    conn = get_connection()
    cur  = conn.cursor(dictionary=True)
    try:
        cur.execute("""
            SELECT a.*,
                   COALESCE(a.recipient_email, u.email) AS user_email
            FROM alerts a
            JOIN users u ON u.id = a.user_id
            WHERE a.is_active = 1 AND u.is_active = 1
        """)
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


def toggle_alert(alert_id: int, user_id: int) -> dict | None:
    conn = get_connection()
    cur  = conn.cursor()
    try:
        cur.execute("""
            UPDATE alerts SET is_active = NOT is_active
            WHERE id = %s AND user_id = %s
        """, (alert_id, user_id))
        conn.commit()
    finally:
        cur.close()
        conn.close()
    return get_alert(alert_id)


def delete_alert(alert_id: int, user_id: int) -> bool:
    conn = get_connection()
    cur  = conn.cursor()
    try:
        cur.execute("DELETE FROM alerts WHERE id = %s AND user_id = %s", (alert_id, user_id))
        conn.commit()
        return cur.rowcount > 0
    finally:
        cur.close()
        conn.close()


def mark_triggered(alert_id: int, level: int = 1) -> None:
    """Met à jour le niveau de sévérité et la date du dernier déclenchement."""
    conn = get_connection()
    cur  = conn.cursor()
    try:
        cur.execute(
            "UPDATE alerts SET last_triggered_at = NOW(), alert_level = %s WHERE id = %s",
            (level, alert_id),
        )
        conn.commit()
    finally:
        cur.close()
        conn.close()


def mark_resolved(alert_id: int) -> None:
    """Remet alert_level à 0 quand la condition n'est plus vraie."""
    conn = get_connection()
    cur  = conn.cursor()
    try:
        cur.execute("UPDATE alerts SET alert_level = 0 WHERE id = %s", (alert_id,))
        conn.commit()
    finally:
        cur.close()
        conn.close()


def mark_db_error(alert_id: int, silence_hours: int = 6) -> None:
    """Silence l'alerte pendant X heures après une erreur de connexion DB.

    Empêche le spam d'emails d'erreur quand la base reste inaccessible.
    """
    conn = get_connection()
    cur  = conn.cursor()
    try:
        cur.execute(
            "UPDATE alerts SET last_triggered_at = DATE_ADD(NOW(), INTERVAL %s HOUR) WHERE id = %s",
            (silence_hours, alert_id),
        )
        conn.commit()
    finally:
        cur.close()
        conn.close()
