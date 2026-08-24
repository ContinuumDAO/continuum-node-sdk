#!/usr/bin/env python3
"""Search public Telegram channels by text query (Telethon MTProto)."""

from __future__ import annotations

import asyncio
import json
import re
import sys
from datetime import datetime, timezone

from telethon.errors import FloodWaitError
from telethon.tl.custom.message import Message

from telethon_client import get_client, normalize_channel


def parse_since(raw: str | None) -> datetime | None:
    if not raw:
        return None
    text = raw.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    dt = datetime.fromisoformat(text)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def message_record(channel: str, message: Message) -> dict:
    posted = message.date.astimezone(timezone.utc).isoformat() if message.date else None
    text = message.message or ""
    username = normalize_channel(channel)
    return {
        "channel": username,
        "message_id": message.id,
        "text": text,
        "posted_at": posted,
        "url": f"https://t.me/{username}/{message.id}",
    }


def matches_query(text: str, query: str, regex: bool) -> bool:
    if not text:
        return False
    if regex:
        return re.search(query, text, re.IGNORECASE) is not None
    return query.lower() in text.lower()


async def search_channels(payload: dict) -> list[dict]:
    query = str(payload.get("query", "")).strip()
    if not query:
        raise RuntimeError("query is required")
    channels = payload.get("channels") or []
    if not channels:
        raise RuntimeError("channels must be a non-empty list")
    max_results = int(payload.get("max_results", 50))
    max_per_channel = int(payload.get("max_messages_per_channel", 500))
    regex = bool(payload.get("regex", False))
    since = parse_since(payload.get("since"))

    results: list[dict] = []
    client = get_client()
    async with client:
        for channel in channels:
            username = normalize_channel(str(channel))
            try:
                if regex:
                    async for message in client.iter_messages(username, limit=max_per_channel):
                        if since and message.date and message.date.astimezone(timezone.utc) < since:
                            continue
                        text = message.message or ""
                        if matches_query(text, query, True):
                            results.append(message_record(username, message))
                else:
                    async for message in client.iter_messages(
                        username, search=query, limit=max_per_channel
                    ):
                        if since and message.date and message.date.astimezone(timezone.utc) < since:
                            continue
                        results.append(message_record(username, message))
            except FloodWaitError as exc:
                await asyncio.sleep(exc.seconds + 1)
                continue

    results.sort(key=lambda row: row.get("posted_at") or "", reverse=True)
    return results[:max_results]


def main() -> None:
    payload = json.load(sys.stdin)
    rows = asyncio.run(search_channels(payload))
    json.dump(rows, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
