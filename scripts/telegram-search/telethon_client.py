"""Shared Telethon session from environment variables."""

from __future__ import annotations

import os

from telethon import TelegramClient


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing environment variable: {name}")
    return value


def get_client() -> TelegramClient:
    api_id = int(require_env("TELEGRAM_API_ID"))
    api_hash = require_env("TELEGRAM_API_HASH")
    session_path = require_env("TELEGRAM_SESSION_PATH")
    return TelegramClient(session_path, api_id, api_hash)


def normalize_channel(username: str) -> str:
    u = username.strip()
    if u.startswith("https://t.me/"):
        u = u.rsplit("/", 1)[-1]
    return u.lstrip("@")
