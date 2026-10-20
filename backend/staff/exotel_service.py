"""
NEXORA Exotel Voice Notification Service
File: backend/staff/exotel_service.py
Description: Automated emergency phone call notifications via Exotel Voice API
             for critical/high incident dispatch to nearest available personnel.
"""

from __future__ import annotations

import logging
import re
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from uuid import uuid4

import httpx

from config.settings import settings

logger = logging.getLogger("NEXORA_EXOTEL")

# In-memory deduplication cache: maps f"{alert_id}:{clean_number}" -> epoch_seconds
# Prevents repeated outbound calling spam for the same incident within cooldown window.
_CALL_DISPATCH_CACHE: Dict[str, float] = {}
COOLDOWN_SECONDS = 180


def sanitize_phone_number(raw_number: str) -> str:
    """Normalizes phone number removing formatting spaces, hyphens, and brackets."""
    if not raw_number:
        return ""
    cleaned = re.sub(r"[^\d+]", "", raw_number.strip())
    return cleaned


def generate_exoml(zone: str) -> str:
    """
    Generates standard ExoML (Exotel Voice Markup) XML payload.
    Exotel fetches this URL when placing the automated text-to-speech call.
    """
    safe_zone = zone.replace("<", "").replace(">", "").strip() or "designated sector"
    message = f"NEXORA Emergency. Critical incident detected at {safe_zone}. Immediate on-ground response required."
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        "<Response>\n"
        f'    <Say voice="woman" language="en-IN">{message}</Say>\n'
        "    <Pause length=\"2\"/>\n"
        f'    <Say voice="woman" language="en-IN">{message}</Say>\n'
        "    <Hangup/>\n"
        "</Response>"
    )


async def trigger_emergency_call(
    to_number: str,
    zone: str,
    staff_name: str,
    alert_id: Optional[str] = None,
    alert_level: Optional[str] = "CRITICAL",
    force: bool = False,
) -> Dict[str, Any]:
    """
    Places an automated voice call via Exotel to the specified staff member.

    When Exotel credentials are not configured in `.env`, runs in SIMULATED mode
    with full logging and synthetic response so NEXORA operation remains seamless.
    """
    clean_number = sanitize_phone_number(to_number)
    now_epoch = time.time()
    now_iso = datetime.now(timezone.utc).isoformat()
    emergency_message = f"NEXORA Emergency. Critical incident detected at {zone}."

    # 1. Deduplication check
    cache_key = f"{alert_id or 'incident'}:{clean_number}"
    if not force and cache_key in _CALL_DISPATCH_CACHE:
        elapsed = now_epoch - _CALL_DISPATCH_CACHE[cache_key]
        if elapsed < COOLDOWN_SECONDS:
            logger.info(
                "[EXOTEL] Suppressed duplicate call to %s for alert %s (last called %.0fs ago)",
                clean_number,
                alert_id,
                elapsed,
            )
            return {
                "success": True,
                "status": "already_called",
                "message": f"Call already triggered {int(elapsed)}s ago for this incident.",
                "to": clean_number,
                "staff_name": staff_name,
                "zone": zone,
                "alert_id": alert_id,
                "dispatched_at": now_iso,
            }

    # 2. Check if Exotel credentials are configured
    sid = (settings.exotel_account_sid or "").strip()
    key = (settings.exotel_api_key or "").strip()
    token = (settings.exotel_api_token or "").strip()
    caller_id = (settings.exotel_caller_id or "").strip()
    subdomain = (settings.exotel_subdomain or "api.exotel.com").strip()

    is_configured = bool(sid and key and token and caller_id)

    if not is_configured:
        # Fallback to simulated / mock mode
        simulated_sid = f"sim_{uuid4().hex[:12]}"
        _CALL_DISPATCH_CACHE[cache_key] = now_epoch
        logger.warning(
            "[EXOTEL] [SIMULATED] Credentials not set in .env. Placed simulated call to %s (%s) for zone %s: '%s'",
            staff_name,
            clean_number,
            zone,
            emergency_message,
        )
        return {
            "success": True,
            "status": "simulated",
            "message": emergency_message,
            "details": f"Simulated call dispatched to {staff_name} ({clean_number}). (Configure EXOTEL_* in .env to place live carrier calls)",
            "to": clean_number,
            "staff_name": staff_name,
            "zone": zone,
            "alert_id": alert_id,
            "alert_level": alert_level,
            "call_sid": simulated_sid,
            "dispatched_at": now_iso,
        }

    # 3. Live call via Exotel Outbound Connect API
    api_url = f"https://{subdomain}/v1/Accounts/{sid}/Calls/connect.json"

    # Build form parameters
    call_data: Dict[str, str] = {
        "From": clean_number,
        "CallerId": caller_id,
        "CallType": "trans",
        "CustomField": emergency_message,
    }

    if settings.exotel_applet_id:
        call_data["Url"] = f"http://my.exotel.com/{sid}/exoml/start_voice/{settings.exotel_applet_id}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                api_url,
                data=call_data,
                auth=(key, token),
            )

        resp_data: Dict[str, Any] = {}
        try:
            resp_data = resp.json()
        except Exception:
            resp_data = {"raw_text": resp.text}

        if 200 <= resp.status_code < 300:
            call_info = resp_data.get("Call", {})
            real_sid = call_info.get("Sid") or str(uuid4())
            _CALL_DISPATCH_CACHE[cache_key] = now_epoch

            logger.info(
                "[EXOTEL] Emergency call successfully queued via Exotel! SID=%s, To=%s, Zone=%s",
                real_sid,
                clean_number,
                zone,
            )
            return {
                "success": True,
                "status": "dispatched",
                "message": emergency_message,
                "details": f"Live carrier call queued via Exotel to {staff_name} ({clean_number})",
                "to": clean_number,
                "staff_name": staff_name,
                "zone": zone,
                "alert_id": alert_id,
                "call_sid": real_sid,
                "dispatched_at": now_iso,
                "exotel_response": resp_data,
            }
        else:
            logger.error(
                "[EXOTEL] Exotel API returned HTTP %d: %s",
                resp.status_code,
                resp_data,
            )
            return {
                "success": False,
                "status": "failed",
                "message": emergency_message,
                "details": f"Exotel API error (HTTP {resp.status_code}): {resp_data}",
                "to": clean_number,
                "staff_name": staff_name,
                "zone": zone,
                "alert_id": alert_id,
                "dispatched_at": now_iso,
                "error": resp_data,
            }

    except Exception as exc:
        logger.exception("[EXOTEL] Failed to execute outbound call to %s: %s", clean_number, exc)
        return {
            "success": False,
            "status": "failed",
            "message": emergency_message,
            "details": f"Network or transport error connecting to Exotel: {str(exc)}",
            "to": clean_number,
            "staff_name": staff_name,
            "zone": zone,
            "alert_id": alert_id,
            "dispatched_at": now_iso,
            "error": str(exc),
        }
