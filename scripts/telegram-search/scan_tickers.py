#!/usr/bin/env python3
"""Scan public Telegram channels for token/ticker mentions."""

from __future__ import annotations

import asyncio
import json
import sys
from datetime import datetime, timezone

from telethon.errors import FloodWaitError

from telethon_client import get_client, normalize_channel
from ticker_extract import config_from_dict, find_tickers_in_message


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


async def scan_channels(payload: dict) -> list[dict]:
    channels = payload.get("channels") or []
    if not channels:
        raise RuntimeError("channels must be a non-empty list")

    tickers_raw = payload.get("tickers")
    allowlist: list[str] | None
    if tickers_raw is None:
        allowlist = None
    else:
        allowlist = [str(t).strip() for t in tickers_raw if str(t).strip()]
        if not allowlist:
            allowlist = None

    detection = config_from_dict(payload.get("ticker_detection"))
    max_results = int(payload.get("max_results", 50))
    max_per_channel = int(payload.get("max_messages_per_channel", 500))
    since = parse_since(payload.get("since"))

    results: list[dict] = []
    client = get_client()
    async with client:
        for channel in channels:
            username = normalize_channel(str(channel))
            try:
                async for message in client.iter_messages(username, limit=max_per_channel):
                    if since and message.date and message.date.astimezone(timezone.utc) < since:
                        continue
                    text = message.message or ""
                    if not text.strip():
                        continue
                    matched = find_tickers_in_message(text, allowlist, detection)
                    if not matched:
                        continue
                    posted = (
                        message.date.astimezone(timezone.utc).isoformat()
                        if message.date
                        else None
                    )
                    results.append(
                        {
                            "channel": username,
                            "message_id": message.id,
                            "text": text,
                            "posted_at": posted,
                            "url": f"https://t.me/{username}/{message.id}",
                            "matched_tickers": matched,
                        }
                    )
            except FloodWaitError as exc:
                await asyncio.sleep(exc.seconds + 1)
                continue

    results.sort(key=lambda row: row.get("posted_at") or "", reverse=True)
    return results[:max_results]


def main() -> None:
    payload = json.load(sys.stdin)
    rows = asyncio.run(scan_channels(payload))
    json.dump(rows, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
