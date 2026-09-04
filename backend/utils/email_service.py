"""Service d'envoi d'emails pour les alertes HakiData.

Utilise le compte Gmail dédié alertes.hakidata@gmail.com via SMTP+TLS.
"""

from __future__ import annotations

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

SMTP_HOST  = "smtp.gmail.com"
SMTP_PORT  = 587
SMTP_EMAIL = "alertes.hakidata@gmail.com"
SMTP_TOKEN = "tjvebrtflkeltlte"


def _send(to_email: str, subject: str, html: str) -> None:
    msg = MIMEMultipart("alternative")
    msg["Subject"]  = subject
    msg["From"]     = f"HakiData <{SMTP_EMAIL}>"
    msg["To"]       = to_email
    msg["Reply-To"] = SMTP_EMAIL
    msg["X-Mailer"] = "HakiData-1.0"
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.ehlo()
        server.starttls()
        server.login(SMTP_EMAIL, SMTP_TOKEN)
        server.sendmail(SMTP_EMAIL, to_email, msg.as_string())


def send_alert_confirmation(to_email: str, alert_name: str, kpi_name: str,
                            operator: str, threshold: float,
                            check_interval_minutes: int = 30) -> None:
    """Envoie un email de confirmation après création d'une alerte."""

    op_labels = {
        "<":  "est inférieur à",
        ">":  "est supérieur à",
        "<=": "est inférieur ou égal à",
        ">=": "est supérieur ou égal à",
        "=":  "est égal à",
    }
    op_text = op_labels.get(operator, operator)

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;">
      <div style="background:#111111;padding:24px;border-radius:8px 8px 0 0;text-align:center;">
        <span style="font-size:28px;font-weight:900;color:#ffffff;">HAKI</span>
        <span style="font-size:28px;font-weight:900;color:#C8940A;">DATA</span>
      </div>
      <div style="background:#ffffff;padding:32px;border:1px solid #e5e7eb;border-radius:0 0 8px 8px;">
        <h2 style="color:#111111;margin-top:0;">✅ Votre alerte a bien été configurée</h2>
        <p style="color:#444;font-size:15px;">
          L'alerte <strong>{alert_name}</strong> est maintenant active.
          Vous serez notifié sur cette adresse dès que la condition ci-dessous sera déclenchée.
        </p>
        <div style="background:#fef9ec;border-left:4px solid #C8940A;padding:16px;border-radius:4px;margin:20px 0;">
          <p style="margin:0;color:#555;font-size:13px;text-transform:uppercase;letter-spacing:.05em;">Condition surveillée</p>
          <p style="margin:8px 0 0;color:#111;font-size:16px;font-weight:bold;">
            {kpi_name} <span style="color:#C8940A;">{op_text}</span> {threshold:,.2f}
          </p>
        </div>
        <p style="color:#555;font-size:14px;">
          La vérification est effectuée automatiquement toutes les <strong>{check_interval_minutes} minutes</strong>.
        </p>
        <p style="color:#888;font-size:12px;margin-top:24px;">
          Cet email a été envoyé automatiquement par HakiData — ne pas répondre.<br>
          💡 Pour ne plus recevoir ces emails en spam, ajoutez <strong>alertes.hakidata@gmail.com</strong> à vos contacts.
        </p>
      </div>
    </div>
    """
    _send(to_email, f"✅ Alerte configurée — {alert_name}", html)


def send_db_connection_error_email(to_email: str, kpi_name: str, alert_name: str) -> None:
    """Envoie un email technique quand la base de données est inaccessible lors d'un check d'alerte."""
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;">
      <div style="background:#111111;padding:24px;border-radius:8px 8px 0 0;text-align:center;">
        <span style="font-size:28px;font-weight:900;color:#ffffff;">HAKI</span>
        <span style="font-size:28px;font-weight:900;color:#C8940A;">DATA</span>
      </div>
      <div style="background:#ffffff;padding:32px;border:1px solid #e5e7eb;border-radius:0 0 8px 8px;">
        <h2 style="color:#b91c1c;margin-top:0;">🔌 Problème de connexion à la base de données</h2>
        <p style="color:#444;font-size:15px;">
          HakiData n'a pas pu vérifier l'alerte <strong>{alert_name}</strong>
          car la connexion à votre base de données a échoué.
        </p>
        <div style="background:#fef2f2;border-left:4px solid #b91c1c;padding:16px;border-radius:4px;margin:20px 0;">
          <p style="margin:0;color:#555;font-size:13px;text-transform:uppercase;letter-spacing:.05em;">KPI concerné</p>
          <p style="margin:8px 0 0;color:#111;font-size:16px;font-weight:bold;">{kpi_name}</p>
          <p style="margin:8px 0 0;color:#b91c1c;font-size:14px;">
            Impossible de mettre à jour ce KPI — la base est inaccessible depuis au moins 30 minutes.
          </p>
        </div>
        <p style="color:#444;font-size:14px;">
          ✅ <strong>Aucune fausse alerte n'a été envoyée.</strong><br>
          La vérification reprendra automatiquement au prochain cycle une fois la connexion rétablie.
        </p>
        <p style="color:#555;font-size:14px;">Que faire :</p>
        <ol style="color:#444;font-size:14px;padding-left:20px;">
          <li>Vérifiez que votre base de données est bien démarrée et accessible.</li>
          <li>Dans HakiData, rendez-vous dans le panneau de gauche et testez à nouveau la connexion.</li>
          <li>Si le problème persiste, contactez le support technique.</li>
        </ol>
        <p style="color:#888;font-size:12px;margin-top:24px;">
          Cet email a été envoyé automatiquement par HakiData — ne pas répondre.<br>
          💡 Pour ne plus recevoir ces emails en spam, ajoutez <strong>alertes.hakidata@gmail.com</strong> à vos contacts.
        </p>
      </div>
    </div>
    """
    _send(to_email, f"🔌 Connexion DB échouée — alerte {alert_name} non vérifiée", html)


def send_alert_email(to_email: str, alert_name: str, kpi_name: str,
                     current_value: float, operator: str, threshold: float,
                     level_label: str = "⚠️ Seuil dépassé") -> None:
    """Envoie un email d'alerte avec le niveau de sévérité."""

    op_labels = {
        "<":  "est passé sous",
        ">":  "a dépassé",
        "<=": "est inférieur ou égal à",
        ">=": "est supérieur ou égal à",
        "=":  "est égal à",
    }
    op_text = op_labels.get(operator, operator)

    is_resolved = "Retour à la normale" in level_label

    if is_resolved:
        header_color   = "#16a34a"
        border_color   = "#16a34a"
        bg_color       = "#f0fdf4"
        value_color    = "#16a34a"
        subject_prefix = "✅ Résolu"
        message_text   = (
            f"Bonne nouvelle — le KPI <strong>{kpi_name}</strong> est revenu à la normale. "
            f"La valeur ({current_value:,.2f}) ne dépasse plus le seuil fixé à {threshold:,.2f}. "
            f"Aucune action requise pour le moment."
        )
    elif "critique" in level_label.lower():
        header_color   = "#dc2626"
        border_color   = "#dc2626"
        bg_color       = "#fef2f2"
        value_color    = "#dc2626"
        subject_prefix = "🚨 Critique"
        message_text   = (
            f"Situation critique — le KPI <strong>{kpi_name}</strong> a atteint un niveau alarmant. "
            f"La valeur actuelle ({current_value:,.2f}) dépasse le seuil de plus de 100 %. "
            f"Une intervention immédiate est recommandée."
        )
    elif "aggrav" in level_label.lower():
        header_color   = "#ea580c"
        border_color   = "#ea580c"
        bg_color       = "#fff7ed"
        value_color    = "#ea580c"
        subject_prefix = "🔶 Aggravé"
        message_text   = (
            f"La situation s'aggrave — le KPI <strong>{kpi_name}</strong> continue de se dégrader. "
            f"La valeur ({current_value:,.2f}) dépasse désormais le seuil de plus de 50 %. "
            f"Une vérification est conseillée."
        )
    else:
        header_color   = "#C8940A"
        border_color   = "#C8940A"
        bg_color       = "#fef9ec"
        value_color    = "#C8940A"
        subject_prefix = "⚠️ Alerte"
        message_text   = (
            f"Le KPI <strong>{kpi_name}</strong> vient de franchir le seuil défini. "
            f"Surveillez l'évolution — un nouvel email vous sera envoyé si la situation s'aggrave "
            f"ou revient à la normale."
        )

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;">
      <div style="background:#111111;padding:24px;border-radius:8px 8px 0 0;text-align:center;">
        <span style="font-size:28px;font-weight:900;color:#ffffff;">HAKI</span>
        <span style="font-size:28px;font-weight:900;color:#C8940A;">DATA</span>
      </div>
      <div style="background:#ffffff;padding:32px;border:1px solid #e5e7eb;border-radius:0 0 8px 8px;">
        <h2 style="color:{header_color};margin-top:0;">{level_label}</h2>
        <p style="color:#444;font-size:15px;line-height:1.6;">
          {message_text}
        </p>
        <div style="background:{bg_color};border-left:4px solid {border_color};padding:16px;border-radius:4px;margin:20px 0;">
          <p style="margin:0;color:#555;font-size:13px;text-transform:uppercase;letter-spacing:.05em;">Alerte : {alert_name}</p>
          <p style="margin:6px 0 0;color:#333;font-size:15px;">
            <strong>{kpi_name}</strong> {op_text} <strong>{threshold:,.2f}</strong>
          </p>
          <p style="margin:8px 0 0;color:{value_color};font-size:24px;font-weight:bold;">
            {current_value:,.2f}
          </p>
        </div>
        <p style="color:#888;font-size:12px;margin-top:24px;">
          Connectez-vous à HakiData pour consulter l'historique complet.<br>
          Cet email a été envoyé automatiquement — ne pas répondre.
        </p>
      </div>
    </div>
    """
    _send(to_email, f"{subject_prefix} HakiData — {alert_name}", html)
