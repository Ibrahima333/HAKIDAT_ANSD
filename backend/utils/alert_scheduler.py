"""Planificateur d'alertes HakiData.

Tourne toutes les 5 minutes et vérifie, alerte par alerte, si son intervalle
propre (check_interval_minutes) est écoulé depuis last_triggered_at.
Re-exécute la requête SQL originale pour obtenir la valeur fraîche.
Si la base est inaccessible, un email technique est envoyé à la place.
"""

from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Intervalle du scheduler lui-même — suffisamment fin pour honorer les alertes à 30 min
_CHECK_INTERVAL_SECONDS = 5 * 60   # toutes les 5 minutes
_timer: threading.Timer | None = None


def _is_due(alert: dict) -> bool:
    """Retourne True si l'alerte doit être vérifiée maintenant."""
    interval_minutes = int(alert.get("check_interval_minutes") or 30)
    last = alert.get("last_triggered_at")
    if last is None:
        return True  # jamais déclenchée → vérifier immédiatement
    if isinstance(last, str):
        last = datetime.fromisoformat(last)
    # Rendre last timezone-aware si besoin
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    elapsed_minutes = (datetime.now(timezone.utc) - last).total_seconds() / 60
    return elapsed_minutes >= interval_minutes


def _fetch_fresh_value(kpi: dict) -> float | None:
    """Re-exécute le SQL stocké sur la base cible et retourne la valeur numérique.

    Retourne None si :
    - Aucune requête SQL n'est stockée (ancien KPI épinglé avant cette version)
    - La base de données n'est pas configurée ou inaccessible
    - La requête ne retourne aucune ligne ou aucune colonne numérique
    """
    sql = kpi.get("sql_query")
    if not sql:
        # Ancien KPI sans SQL stocké : fallback sur raw_value en base
        raw = kpi.get("raw_value")
        return float(raw) if raw is not None else None

    # Chaque KPI porte sa propre base — le scheduler n'a pas de session
    kpi_database = kpi.get("database_name")
    if not kpi_database:
        logger.info("[alertes] KPI sans base de données associée — alerte ignorée")
        return None

    try:
        from backend.utils.db_utils import run_query
        # Retry une fois : la première tentative peut échouer sur une connexion périmée
        # (le pool discarde la connexion morte, la seconde tentative obtient une connexion fraîche)
        try:
            columns, rows = run_query(sql, kpi_database)
        except Exception:
            columns, rows = run_query(sql, kpi_database)
    except Exception as exc:
        logger.warning("[alertes] Connexion DB échouée — alerte ignorée (%s)", exc)
        return None

    if not rows or not columns:
        logger.info("[alertes] Requête KPI sans résultat — alerte ignorée")
        return None

    # Prend la première valeur numérique de la première ligne
    for val in rows[0]:
        try:
            return float(val)
        except (TypeError, ValueError):
            continue

    logger.info("[alertes] Aucune valeur numérique dans les résultats — alerte ignorée")
    return None


def _severity_level(value: float, op: str, threshold: float) -> int:
    """Retourne le niveau de sévérité (0=normal, 1=déclenché, 2=aggravé, 3=critique).

    Les niveaux 2 et 3 sont calculés selon l'écart au seuil :
      - niveau 2 : écart ≥ 50 % du seuil
      - niveau 3 : écart ≥ 100 % du seuil
    """
    condition_met = (
        (op == "<"  and value <  threshold) or
        (op == ">"  and value >  threshold) or
        (op == "<=" and value <= threshold) or
        (op == ">=" and value >= threshold) or
        (op == "="  and value == threshold)
    )
    if not condition_met:
        return 0

    if threshold == 0:
        return 1

    gap = abs(value - threshold)
    ratio = gap / abs(threshold)

    if ratio >= 1.0:
        return 3
    if ratio >= 0.5:
        return 2
    return 1


def _level_label(level: int) -> str:
    return {1: "⚠️ Seuil dépassé", 2: "🔶 Situation aggravée", 3: "🚨 Niveau critique"}.get(level, "")


def _check_alerts() -> None:
    """Parcourt toutes les alertes actives et envoie un email si la condition est vraie."""
    try:
        from backend.repositories.alerts import list_all_active_alerts, mark_triggered, mark_resolved
        from backend.repositories.kpis   import get_kpi_by_id
        from backend.utils.email_service  import send_alert_email, send_db_connection_error_email

        alerts = list_all_active_alerts()
        for alert in alerts:
            try:
                if not _is_due(alert):
                    continue  # Intervalle non écoulé — on passe

                kpi = get_kpi_by_id(alert["kpi_id"])
                if kpi is None:
                    continue

                # Valeur fraîche depuis la base cible (re-exécution SQL)
                value = _fetch_fresh_value(kpi)
                if value is None:
                    # La DB est inaccessible : notifier l'utilisateur une seule fois
                    # On marque quand même l'alerte pour éviter le spam d'emails
                    try:
                        send_db_connection_error_email(
                            to_email   = alert["user_email"],
                            kpi_name   = alert["kpi_name"],
                            alert_name = alert["name"],
                        )
                        logger.warning("[alertes] DB inaccessible — email technique envoyé → %s", alert["user_email"])
                    except Exception as mail_exc:
                        logger.error("[alertes] Échec envoi email technique : %s", mail_exc)
                    mark_triggered(alert["id"])  # évite le spam lors des cycles suivants
                    continue

                threshold = float(alert["threshold"])
                op        = alert["operator"]

                new_level  = _severity_level(value, op, threshold)
                prev_level = int(alert.get("alert_level") or 0)

                if new_level > 0 and new_level > prev_level:
                    # Montée de niveau (OFF→ON ou aggravation) : envoyer l'email
                    send_alert_email(
                        to_email      = alert["user_email"],
                        alert_name    = alert["name"],
                        kpi_name      = alert["kpi_name"],
                        current_value = value,
                        operator      = op,
                        threshold     = threshold,
                        level_label   = _level_label(new_level),
                    )
                    mark_triggered(alert["id"], level=new_level)
                    logger.info("[alertes] Email niveau %d → %s (alerte: %s, valeur: %s)",
                                new_level, alert["user_email"], alert["name"], value)

                elif new_level == 0 and prev_level > 0:
                    # Retour à la normale : notifier la résolution
                    send_alert_email(
                        to_email      = alert["user_email"],
                        alert_name    = alert["name"],
                        kpi_name      = alert["kpi_name"],
                        current_value = value,
                        operator      = op,
                        threshold     = threshold,
                        level_label   = "✅ Retour à la normale",
                    )
                    mark_resolved(alert["id"])
                    logger.info("[alertes] Résolution notifiée → %s (alerte: %s, valeur: %s)",
                                alert["user_email"], alert["name"], value)

            except Exception as exc:
                logger.warning("[alertes] Erreur alerte #%s : %s", alert.get("id"), exc)

    except Exception as exc:
        logger.error("[alertes] Erreur scheduler : %s", exc)
    finally:
        _schedule_next()


def _schedule_next() -> None:
    global _timer
    _timer = threading.Timer(_CHECK_INTERVAL_SECONDS, _check_alerts)
    _timer.daemon = True
    _timer.start()


def start() -> None:
    """Démarre le planificateur en arrière-plan.

    Le scheduler tourne toutes les 5 min. Chaque alerte a son propre intervalle
    (check_interval_minutes) et n'est vérifiée que si cet intervalle est écoulé.
    """
    logger.info("[alertes] Planificateur démarré (cycle : %d min)", _CHECK_INTERVAL_SECONDS // 60)
    _schedule_next()
