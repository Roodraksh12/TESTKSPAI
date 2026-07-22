"""SMTP email helper with HTML + plain-text templates for invites and resets."""

from __future__ import annotations

import html
import logging
import smtplib
from email.message import EmailMessage

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)


def send_email(
    to_address: str,
    subject: str,
    body: str,
    settings: Settings | None = None,
    *,
    html_body: str | None = None,
) -> bool:
    settings = settings or get_settings()
    if not to_address:
        logger.warning("send_email skipped: empty recipient (%s)", subject)
        return False

    if not settings.smtp_host:
        logger.info(
            "[mailer:dev] To=%s Subject=%s\n%s",
            to_address,
            subject,
            body,
        )
        return True

    msg = EmailMessage()
    msg["From"] = settings.smtp_from or settings.smtp_user or "noreply@ksp.local"
    msg["To"] = to_address
    msg["Subject"] = subject
    msg.set_content(body)
    if html_body:
        msg.add_alternative(html_body, subtype="html")

    try:
        if settings.smtp_use_tls:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as server:
                server.starttls()
                if settings.smtp_user:
                    server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as server:
                if settings.smtp_user:
                    server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(msg)
        logger.info("SMTP sent to %s subject=%s", to_address, subject)
        return True
    except Exception:
        logger.exception("SMTP send failed to %s", to_address)
        return False


def _login_url(app_url: str) -> str:
    base = (app_url or "http://localhost:5173").rstrip("/")
    return f"{base}/login"


def _shell_html(title: str, inner: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{html.escape(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background:#0f172a;padding:20px 28px;">
              <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#5eead4;">Karnataka Police</p>
              <p style="margin:6px 0 0;font-size:20px;font-weight:700;color:#ffffff;">SCRB Sahayak</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              {inner}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;line-height:1.5;">
              Unauthorised access to police records is punishable under law. Do not forward this email.
              <br />— Police IT / SCRB Sahayak
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _credentials_block_html(badge_id: str, temp_password: str, login_url: str) -> str:
    return f"""
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin:20px 0;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;">Service ID / Badge ID</p>
                    <p style="margin:0 0 16px;font-family:Consolas,Monaco,monospace;font-size:18px;font-weight:700;color:#0f172a;">{html.escape(badge_id)}</p>
                    <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;">Temporary password</p>
                    <p style="margin:0;font-family:Consolas,Monaco,monospace;font-size:18px;font-weight:700;color:#0f172a;">{html.escape(temp_password)}</p>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 20px;">
                <a href="{html.escape(login_url)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:600;">
                  Sign in to SCRB Sahayak
                </a>
              </p>
              <p style="margin:0;font-size:13px;color:#64748b;line-height:1.5;">
                Or open: <a href="{html.escape(login_url)}" style="color:#0d9488;">{html.escape(login_url)}</a>
              </p>"""


def invite_email_body(
    name: str,
    badge_id: str,
    temp_password: str,
    app_url: str,
    *,
    role: str | None = None,
    ttl_hours: int = 48,
) -> str:
    login = _login_url(app_url)
    role_line = f"Rank assigned: {role}\n" if role else ""
    return (
        f"Namaskara {name},\n\n"
        f"You have been invited to SCRB Sahayak (Karnataka Police).\n"
        f"{role_line}\n"
        f"Service ID / Badge ID: {badge_id}\n"
        f"Temporary password: {temp_password}\n\n"
        f"Sign in at: {login}\n"
        f"You must set a new password on first login.\n"
        f"This temporary password expires in {ttl_hours} hours and is single-use.\n\n"
        f"— Police IT / SCRB Sahayak\n"
    )


def invite_email_html(
    name: str,
    badge_id: str,
    temp_password: str,
    app_url: str,
    *,
    role: str | None = None,
    ttl_hours: int = 48,
) -> str:
    login = _login_url(app_url)
    role_html = (
        f'<p style="margin:0 0 12px;font-size:14px;color:#334155;">Rank assigned: '
        f"<strong>{html.escape(role)}</strong></p>"
        if role
        else ""
    )
    inner = f"""
              <p style="margin:0 0 8px;font-size:22px;font-weight:700;">Namaskara {html.escape(name)},</p>
              <p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#334155;">
                You have been invited to <strong>SCRB Sahayak</strong>, the Karnataka Police investigation workspace.
              </p>
              {role_html}
              {_credentials_block_html(badge_id, temp_password, login)}
              <p style="margin:20px 0 0;font-size:13px;line-height:1.55;color:#64748b;">
                Change this temporary password on first sign-in. It expires in <strong>{ttl_hours} hours</strong> and is single-use.
              </p>"""
    return _shell_html("SCRB Sahayak invitation", inner)


def reset_email_body(
    name: str,
    badge_id: str,
    temp_password: str,
    app_url: str,
    *,
    ttl_hours: int = 48,
) -> str:
    login = _login_url(app_url)
    return (
        f"Namaskara {name},\n\n"
        f"Your password reset for SCRB Sahayak has been approved.\n\n"
        f"Service ID / Badge ID: {badge_id}\n"
        f"Temporary password: {temp_password}\n\n"
        f"Sign in at: {login}\n"
        f"You must change this password immediately.\n"
        f"This temporary password expires in {ttl_hours} hours.\n\n"
        f"— Police IT / SCRB Sahayak\n"
    )


def reset_email_html(
    name: str,
    badge_id: str,
    temp_password: str,
    app_url: str,
    *,
    ttl_hours: int = 48,
) -> str:
    login = _login_url(app_url)
    inner = f"""
              <p style="margin:0 0 8px;font-size:22px;font-weight:700;">Namaskara {html.escape(name)},</p>
              <p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#334155;">
                Your password reset for <strong>SCRB Sahayak</strong> has been approved.
              </p>
              {_credentials_block_html(badge_id, temp_password, login)}
              <p style="margin:20px 0 0;font-size:13px;line-height:1.55;color:#64748b;">
                Change this password immediately after sign-in. It expires in <strong>{ttl_hours} hours</strong>.
              </p>"""
    return _shell_html("SCRB Sahayak password reset", inner)


def send_invite_email(
    to_address: str,
    name: str,
    badge_id: str,
    temp_password: str,
    settings: Settings,
    *,
    role: str | None = None,
) -> bool:
    ttl = settings.temp_password_ttl_hours
    return send_email(
        to_address,
        "SCRB Sahayak invitation — your Service ID & temporary password",
        invite_email_body(
            name, badge_id, temp_password, settings.app_public_url, role=role, ttl_hours=ttl
        ),
        settings,
        html_body=invite_email_html(
            name, badge_id, temp_password, settings.app_public_url, role=role, ttl_hours=ttl
        ),
    )


def send_reset_email(
    to_address: str,
    name: str,
    badge_id: str,
    temp_password: str,
    settings: Settings,
) -> bool:
    ttl = settings.temp_password_ttl_hours
    return send_email(
        to_address,
        "SCRB Sahayak password reset — temporary password",
        reset_email_body(
            name, badge_id, temp_password, settings.app_public_url, ttl_hours=ttl
        ),
        settings,
        html_body=reset_email_html(
            name, badge_id, temp_password, settings.app_public_url, ttl_hours=ttl
        ),
    )
