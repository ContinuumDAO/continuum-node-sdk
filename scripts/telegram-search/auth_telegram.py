#!/usr/bin/env python3
"""Non-interactive Telethon login — JSON stdin/stdout for node-app wizard."""

from __future__ import annotations

import asyncio
import json
import os
import sys

from telethon import TelegramClient
from telethon.errors import (
    PasswordHashInvalidError,
    PhoneCodeExpiredError,
    PhoneCodeInvalidError,
    SessionPasswordNeededError,
)


def _respond(obj: dict) -> None:
    print(json.dumps(obj))


def _client(session_path: str) -> TelegramClient:
    api_id = int(os.environ["TELEGRAM_API_ID"])
    api_hash = os.environ["TELEGRAM_API_HASH"]
    return TelegramClient(session_path, api_id, api_hash)


async def send_code(session_path: str, phone: str) -> dict:
    client = _client(session_path)
    await client.connect()
    try:
        if await client.is_user_authorized():
            me = await client.get_me()
            return {
                "ok": True,
                "already_authorized": True,
                "username": me.username or "",
                "user_id": me.id,
            }
        sent = await client.send_code_request(phone)
        return {"ok": True, "phone_code_hash": sent.phone_code_hash}
    finally:
        await client.disconnect()


async def sign_in(
    session_path: str,
    phone: str,
    code: str,
    phone_code_hash: str,
    password: str | None = None,
) -> dict:
    client = _client(session_path)
    await client.connect()
    try:
        try:
            await client.sign_in(phone=phone, code=code, phone_code_hash=phone_code_hash)
        except SessionPasswordNeededError:
            if not password:
                return {"ok": False, "needs_password": True}
            try:
                await client.sign_in(password=password)
            except PasswordHashInvalidError:
                return {
                    "ok": False,
                    "error": "PASSWORD_INVALID",
                    "message": "Invalid 2FA password.",
                }
        except PhoneCodeInvalidError:
            return {
                "ok": False,
                "error": "PHONE_CODE_INVALID",
                "message": "Invalid login code.",
            }
        except PhoneCodeExpiredError:
            return {
                "ok": False,
                "error": "PHONE_CODE_EXPIRED",
                "message": "Login code expired. Send a new code.",
            }
        me = await client.get_me()
        return {
            "ok": True,
            "username": me.username or "",
            "user_id": me.id,
            "first_name": me.first_name or "",
        }
    finally:
        await client.disconnect()


async def check_session(session_path: str) -> dict:
    client = _client(session_path)
    await client.connect()
    try:
        if not await client.is_user_authorized():
            return {"ok": True, "authorized": False}
        me = await client.get_me()
        return {
            "ok": True,
            "authorized": True,
            "username": me.username or "",
            "user_id": me.id,
        }
    finally:
        await client.disconnect()


async def main() -> None:
    payload = json.load(sys.stdin)
    action = str(payload.get("action", "")).strip()
    session_path = str(payload.get("session_path", "")).strip() or os.environ.get(
        "TELEGRAM_SESSION_PATH", ""
    ).strip()
    if not session_path:
        _respond({"ok": False, "error": "MISSING_SESSION_PATH", "message": "session_path required"})
        return

    try:
        if action == "send_code":
            phone = str(payload.get("phone", "")).strip()
            if not phone:
                _respond({"ok": False, "error": "MISSING_PHONE", "message": "phone required"})
                return
            _respond(await send_code(session_path, phone))
        elif action == "sign_in":
            phone = str(payload.get("phone", "")).strip()
            code = str(payload.get("code", "")).strip()
            phone_code_hash = str(payload.get("phone_code_hash", "")).strip()
            password = str(payload.get("password", "")).strip() or None
            if not phone or not code or not phone_code_hash:
                _respond(
                    {
                        "ok": False,
                        "error": "MISSING_FIELDS",
                        "message": "phone, code, and phone_code_hash required",
                    }
                )
                return
            _respond(await sign_in(session_path, phone, code, phone_code_hash, password))
        elif action == "check_session":
            _respond(await check_session(session_path))
        else:
            _respond({"ok": False, "error": "UNKNOWN_ACTION", "message": f"unknown action: {action}"})
    except Exception as exc:  # noqa: BLE001 — return structured JSON to caller
        _respond({"ok": False, "error": "TELETHON_ERROR", "message": str(exc)})


if __name__ == "__main__":
    asyncio.run(main())
