"""Repository dashboard (graphiques épinglés) par user."""

from __future__ import annotations

from backend.auth.database import get_connection


def get_dashboard(user_id: int) -> list[dict]:
    conn = get_connection()
    cur  = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT * FROM dashboard WHERE user_id = %s ORDER BY pinned_at DESC", (user_id,))
        rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()
    return [
        {
            "id":           r["id"],
            "questionName": r["question_name"],
            "questionText": r["question_text"],
            "chartUrl":     r["chart_url"],
            "pinnedAt":     r["pinned_at"],
            "watched":      bool(r.get("watched")),
        }
        for r in rows
    ]


def get_chart(user_id: int, chart_id: str) -> dict | None:
    conn = get_connection()
    cur  = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT * FROM dashboard WHERE id = %s AND user_id = %s", (chart_id, user_id))
        row = cur.fetchone()
    finally:
        cur.close()
        conn.close()
    if row is None:
        return None
    return {
        "id":           row["id"],
        "questionName": row["question_name"],
        "databaseName": row.get("database_name"),
        "sqlQuery":     row.get("sql_query"),
        "watched":      bool(row.get("watched")),
    }


def upsert_chart(user_id: int, item: dict) -> None:
    """Épingle/met à jour un graphique.

    `chart_url` est toujours forcé vers le point de terminaison snapshot
    (`/api/user/dashboard/{id}/chart`), quel que soit ce que le frontend
    envoie — le dashboard sert désormais une copie figée du HTML au moment
    de l'épinglage (`chart_html`), plutôt qu'un pointeur vers le fichier
    partagé de l'analyse. Sans ça, prévisualiser un autre type de graphique
    depuis "Voir aussi" écrasait silencieusement le graphique déjà épinglé,
    puisque les deux pointaient vers le même fichier sur disque.
    """
    chart_id = item.get("id")
    snapshot_url = f"/api/user/dashboard/{chart_id}/chart"
    conn = get_connection()
    cur  = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO dashboard (id, user_id, question_name, question_text, chart_url, chart_html, pinned_at, sql_query, database_name)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                chart_url     = VALUES(chart_url),
                chart_html    = VALUES(chart_html),
                pinned_at     = VALUES(pinned_at),
                sql_query     = VALUES(sql_query),
                database_name = VALUES(database_name)
        """, (
            chart_id,
            user_id,
            item.get("questionName", ""),
            item.get("questionText", ""),
            snapshot_url,
            item.get("chartHtml", ""),
            item.get("pinnedAt"),
            item.get("sqlQuery"),
            item.get("databaseName"),
        ))
        conn.commit()
    finally:
        cur.close()
        conn.close()


def get_chart_html(chart_id: str) -> str | None:
    """Récupère le HTML figé d'un graphique épinglé — non filtré par
    utilisateur : servi en public, comme les autres artefacts
    (`/api/artifacts/...`), pour permettre le chargement direct dans une
    balise <iframsrc> qui ne peut pas transmettre de jeton d'authentification.
    """
    conn = get_connection()
    cur  = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT chart_html FROM dashboard WHERE id = %s", (chart_id,))
        row = cur.fetchone()
    finally:
        cur.close()
        conn.close()
    return row["chart_html"] if row else None


def update_chart_html(user_id: int, chart_id: str, html: str) -> None:
    """Met à jour uniquement le snapshot HTML — utilisé par le
    rafraîchissement dynamique (graphique "surveillé")."""
    conn = get_connection()
    cur  = conn.cursor()
    try:
        cur.execute(
            "UPDATE dashboard SET chart_html = %s WHERE id = %s AND user_id = %s",
            (html, chart_id, user_id),
        )
        conn.commit()
    finally:
        cur.close()
        conn.close()


def set_watched(user_id: int, chart_id: str, watched: bool) -> None:
    conn = get_connection()
    cur  = conn.cursor()
    try:
        cur.execute(
            "UPDATE dashboard SET watched = %s WHERE id = %s AND user_id = %s",
            (1 if watched else 0, chart_id, user_id),
        )
        conn.commit()
    finally:
        cur.close()
        conn.close()


def touch_pinned_at(user_id: int, chart_id: str, pinned_at: int) -> None:
    """Met à jour uniquement `pinned_at` — sert de cache-buster côté
    frontend (iframe `?v=pinnedAt`) après un rafraîchissement de graphique."""
    conn = get_connection()
    cur  = conn.cursor()
    try:
        cur.execute(
            "UPDATE dashboard SET pinned_at = %s WHERE id = %s AND user_id = %s",
            (pinned_at, chart_id, user_id),
        )
        conn.commit()
    finally:
        cur.close()
        conn.close()


def delete_chart(user_id: int, chart_id: str) -> None:
    conn = get_connection()
    cur  = conn.cursor()
    try:
        cur.execute("DELETE FROM dashboard WHERE id = %s AND user_id = %s", (chart_id, user_id))
        conn.commit()
    finally:
        cur.close()
        conn.close()


def clear_dashboard(user_id: int) -> None:
    conn = get_connection()
    cur  = conn.cursor()
    try:
        cur.execute("DELETE FROM dashboard WHERE user_id = %s", (user_id,))
        conn.commit()
    finally:
        cur.close()
        conn.close()
