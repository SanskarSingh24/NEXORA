"""
NEXORA Email Service — SMTP Integration
File: backend/auth/email_service.py
Description: Sends verification and password-reset email alerts via Gmail SMTP or
             custom TLS SMTP server using smtplib. Falls back to audit-log output
             when SMTP credentials are not configured (local development mode).
"""

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from config.settings import settings

logger = logging.getLogger("NEXORA_EMAIL_SERVICE")


import os
from pathlib import Path
from dotenv import load_dotenv


def _get_smtp_config() -> tuple:
    """
    Reads SMTP credentials fresh from .env every time it is called.
    This means you can update .env without restarting the server —
    the next email send will pick up the new values automatically.
    """
    # Re-load .env so runtime changes are picked up without a server restart
    _env_path = Path(__file__).resolve().parents[2] / ".env"
    load_dotenv(dotenv_path=_env_path, override=True)

    smtp_host     = os.getenv("NEXORA_SMTP_HOST", "smtp.gmail.com")
    smtp_port     = int(os.getenv("NEXORA_SMTP_PORT", "587"))
    smtp_user     = os.getenv("NEXORA_SMTP_USER", "").strip()
    smtp_password = os.getenv("NEXORA_SMTP_PASSWORD", "").strip()
    smtp_from_raw = os.getenv("NEXORA_SMTP_FROM_EMAIL", "").strip()

    # For Gmail SMTP (smtp.gmail.com), sending from an unverified custom domain
    # (like noreply@nexora.com) causes DMARC/SPF failure, causing destination mailboxes
    # to filter the email to SPAM or reject it. Use smtp_user if from_email is dummy/empty.
    if smtp_host == "smtp.gmail.com" and (not smtp_from_raw or "nexora.com" in smtp_from_raw):
        smtp_from = smtp_user
    else:
        smtp_from = smtp_from_raw or smtp_user or "noreply@nexora.com"

    logger.debug(
        f"[EMAIL] SMTP config loaded — host={smtp_host}:{smtp_port} "
        f"user={'(set)' if smtp_user else '(empty)'} from={smtp_from}"
    )
    return smtp_host, smtp_port, smtp_user, smtp_password, smtp_from


def _send_email(to_email: str, subject: str, text_content: str, html_content: str) -> dict:
    """
    Internal helper: builds and dispatches a MIME email via configured SMTP.
    Returns a result dict with 'sent' bool and diagnostic info.
    """
    smtp_host, smtp_port, smtp_user, smtp_password, smtp_from = _get_smtp_config()

    if not smtp_user or not smtp_password:
        logger.warning(
            f"[EMAIL] SMTP credentials (NEXORA_SMTP_USER / NEXORA_SMTP_PASSWORD) not configured. "
            f"Bypassing live email dispatch for '{subject}' to {to_email}."
        )
        return {
            "sent": False,
            "message": "SMTP credentials not configured. Link logged to audit trail.",
        }

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject

        # Use a clean display name with the verified sender email
        formatted_from = f"NEXORA Command Center <{smtp_user}>" if "gmail.com" in smtp_host else f"NEXORA Security <{smtp_from}>"
        msg["From"] = formatted_from
        msg["To"] = to_email
        msg["Reply-To"] = smtp_user

        msg.attach(MIMEText(text_content, "plain", "utf-8"))
        msg.attach(MIMEText(html_content, "html", "utf-8"))

        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            # Sendmail envelope sender MUST be smtp_user for Gmail SMTP to prevent quarantine/silent drop
            server.sendmail(smtp_user, [to_email], msg.as_string())

        logger.info(f"[EMAIL] Email '{subject}' successfully delivered via SMTP to {to_email}")
        return {"sent": True, "message": f"Email sent to {to_email}."}

    except Exception as exc:
        logger.error(f"[EMAIL] SMTP Delivery Error for {to_email}: {exc}")
        return {"sent": False, "message": f"SMTP delivery failed: {exc}"}

def send_verification_email(to_email: str, token: str) -> dict:
    """
    Sends an email verification link to the target user email address via SMTP.

    Returns:
        dict: Summary containing status, message, and generated link.
    """
    frontend_url = settings.frontend_url.rstrip("/")
    verification_link = f"{frontend_url}/verify-email?token={token}"

    logger.info(f"[EMAIL] Generating verification email for {to_email}. Link: {verification_link}")

    text_content = (
        f"Welcome to NEXORA Command Center!\n\n"
        f"Please verify your email address to complete your registration by visiting:\n"
        f"{verification_link}\n\n"
        f"If you did not register for NEXORA, please ignore this email."
    )

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; background-color: #0b0f19; color: #e2e8f0; margin: 0; padding: 24px;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 520px; margin: 0 auto; background-color: #12182c; border: 1px solid #1e294b; border-radius: 12px; padding: 32px;">
        <tr><td>
          <h1 style="color: #00e5ff; font-size: 22px; margin-top: 0; font-weight: 800;">NEXORA SECURITY</h1>
          <p style="color: #94a3b8; font-size: 14px; line-height: 1.5;">Welcome to NEXORA Command Center. Please verify your email address to activate your operator account.</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="{verification_link}" style="background-color: #00e5ff; color: #0b0f19; font-weight: bold; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; display: inline-block;">Verify Email Address</a>
          </div>
          <p style="color: #64748b; font-size: 12px; line-height: 1.4; word-break: break-all;">
            If the button above does not work, copy and paste this link into your browser:<br>
            <a href="{verification_link}" style="color: #00e5ff;">{verification_link}</a>
          </p>
          <hr style="border: 0; border-top: 1px solid #1e294b; margin: 24px 0 16px 0;">
          <p style="color: #475569; font-size: 11px; margin: 0;">NEXORA Enterprise Crowd Intelligence &amp; Platform Security</p>
        </td></tr>
      </table>
    </body>
    </html>
    """

    result = _send_email(
        to_email,
        "NEXORA — Verify Your Email Address",
        text_content,
        html_content,
    )
    result["verification_link"] = verification_link
    return result


def send_password_reset_email(to_email: str, token: str) -> dict:
    """
    Sends a password-reset link to the target user email address via SMTP.
    Token is valid for 15 minutes; the link leads to /reset-password?token=...

    Returns:
        dict: Summary containing status, message, and generated reset link.
    """
    frontend_url = settings.frontend_url.rstrip("/")
    reset_link = f"{frontend_url}/reset-password?token={token}"

    logger.info(f"[EMAIL] Generating password-reset email for {to_email}. Link: {reset_link}")

    text_content = (
        f"NEXORA — Password Reset Request\n\n"
        f"We received a request to reset the password for your NEXORA operator account.\n"
        f"Click the link below to set a new password (valid for 15 minutes):\n\n"
        f"{reset_link}\n\n"
        f"If you did not request a password reset, please ignore this email. "
        f"Your password will remain unchanged."
    )

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; background-color: #0b0f19; color: #e2e8f0; margin: 0; padding: 24px;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 520px; margin: 0 auto; background-color: #12182c; border: 1px solid #1e294b; border-radius: 12px; padding: 32px;">
        <tr><td>
          <h1 style="color: #00e5ff; font-size: 22px; margin-top: 0; font-weight: 800;">NEXORA SECURITY</h1>
          <p style="color: #94a3b8; font-size: 14px; line-height: 1.5;">
            We received a request to reset the password for your NEXORA operator account.<br>
            Click the button below to choose a new password. This link expires in <strong style="color: #e2e8f0;">15 minutes</strong>.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="{reset_link}" style="background-color: #f59e0b; color: #0b0f19; font-weight: bold; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; display: inline-block;">Reset My Password</a>
          </div>
          <p style="color: #64748b; font-size: 12px; line-height: 1.4; word-break: break-all;">
            If the button above does not work, copy and paste this link into your browser:<br>
            <a href="{reset_link}" style="color: #f59e0b;">{reset_link}</a>
          </p>
          <p style="color: #64748b; font-size: 12px; margin-top: 16px;">
            If you did not request a password reset, you can safely ignore this email.
          </p>
          <hr style="border: 0; border-top: 1px solid #1e294b; margin: 24px 0 16px 0;">
          <p style="color: #475569; font-size: 11px; margin: 0;">NEXORA Enterprise Crowd Intelligence &amp; Platform Security</p>
        </td></tr>
      </table>
    </body>
    </html>
    """

    result = _send_email(
        to_email,
        "NEXORA — Password Reset Request",
        text_content,
        html_content,
    )
    result["reset_link"] = reset_link
    return result
