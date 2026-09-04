"""Routes FastAPI pour la gestion des alertes."""

from __future__ import annotations
import threading
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.auth.middleware import get_current_user
from backend.repositories import alerts as alerts_repo
from backend.utils.email_service import send_alert_confirmation

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


class AlertCreate(BaseModel):
    name:                   str
    kpi_id:                 str
    kpi_name:               str
    operator:               str
    threshold:              float
    email:                  Optional[str] = None
    check_interval_minutes: int = 30


@router.get("")
def list_alerts(user=Depends(get_current_user)):
    return alerts_repo.list_alerts(user["sub"])


@router.post("", status_code=201)
def create_alert(body: AlertCreate, user=Depends(get_current_user)):
    if body.operator not in ("<", ">", "<=", ">=", "="):
        raise HTTPException(400, "Opérateur invalide")
    alert = alerts_repo.create_alert(
        user_id                 = user["sub"],
        name                    = body.name,
        kpi_id                  = body.kpi_id,
        kpi_name                = body.kpi_name,
        operator                = body.operator,
        threshold               = body.threshold,
        recipient_email         = body.email,
        check_interval_minutes  = body.check_interval_minutes,
    )
    if body.email:
        def _send():
            try:
                send_alert_confirmation(body.email, body.name, body.kpi_name, body.operator, body.threshold, body.check_interval_minutes)
                print(f"[alerts] Email de confirmation envoyé à {body.email}", flush=True)
            except Exception as exc:
                print(f"[alerts] ERREUR envoi email confirmation à {body.email}: {exc}", flush=True)
        threading.Thread(target=_send, daemon=True).start()
    return alert


@router.patch("/{alert_id}/toggle")
def toggle_alert(alert_id: int, user=Depends(get_current_user)):
    alert = alerts_repo.toggle_alert(alert_id, user["sub"])
    if not alert:
        raise HTTPException(404, "Alerte introuvable")
    return alert


@router.delete("/{alert_id}", status_code=204)
def delete_alert(alert_id: int, user=Depends(get_current_user)):
    if not alerts_repo.delete_alert(alert_id, user["sub"]):
        raise HTTPException(404, "Alerte introuvable")
