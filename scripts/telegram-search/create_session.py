#!/usr/bin/env python3
"""One-time Telethon login — creates TELEGRAM_SESSION_PATH session file."""

from __future__ import annotations

import asyncio
import os

from telethon import TelegramClient


async def main() -> None:
    api_id = int(os.environ["TELEGRAM_API_ID"])
    api_hash = os.environ["TELEGRAM_API_HASH"]
    session_path = os.environ["TELEGRAM_SESSION_PATH"]
    client = TelegramClient(session_path, api_id, api_hash)
    async with client:
        me = await client.get_me()
        name = me.username or me.first_name or me.id
        print(f"Session saved for {name} at {session_path}")


if __name__ == "__main__":
    asyncio.run(main())
