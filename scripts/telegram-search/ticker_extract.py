"""Extract token/ticker symbols from Telegram message text."""

from __future__ import annotations

import re
from dataclasses import dataclass, field


DEFAULT_EXCLUDE = frozenset(
    {
        "THE",
        "AND",
        "FOR",
        "NOT",
        "YOU",
        "ALL",
        "NEW",
        "USD",
        "API",
        "CEO",
        "DAO",
        "TVL",
        "APR",
        "APY",
        "EVM",
        "NFT",
        "UTC",
        "GMT",
        "AI",
        "USDT",
        "USDC",
        "FAQ",
        "DM",
        "PM",
        "AM",
        "UK",
        "US",
        "EU",
    }
)


@dataclass(frozen=True)
class TickerDetectionConfig:
    min_length: int = 2
    max_length: int = 10
    include_bare_caps: bool = True
    exclude: frozenset[str] = DEFAULT_EXCLUDE


def normalize_ticker(raw: str) -> str:
    return raw.strip().lstrip("$#").upper()


def _symbol_pattern(min_length: int, max_length: int) -> str:
    inner_min = max(0, min_length - 1)
    inner_max = max(0, max_length - 1)
    return rf"[A-Za-z][A-Za-z0-9]{{{inner_min},{inner_max}}}"


def extract_tickers(text: str, config: TickerDetectionConfig) -> list[str]:
    if not text:
        return []
    sym = _symbol_pattern(config.min_length, config.max_length)
    found: set[str] = set()

    for match in re.finditer(rf"\$({sym})", text):
        token = match.group(1).upper()
        if config.min_length <= len(token) <= config.max_length:
            found.add(token)

    for match in re.finditer(rf"#({sym})", text):
        token = match.group(1).upper()
        if config.min_length <= len(token) <= config.max_length:
            found.add(token)

    if config.include_bare_caps:
        for match in re.finditer(rf"\b({sym})\b", text):
            token = match.group(1).upper()
            if token in config.exclude:
                continue
            if config.min_length <= len(token) <= config.max_length:
                found.add(token)

    return sorted(found)


def find_tickers_in_message(
    text: str,
    allowlist: list[str] | None,
    config: TickerDetectionConfig,
) -> list[str]:
    """Return matched tickers for one message. Empty allowlist = open detection."""
    if allowlist:
        matched: set[str] = set()
        for raw in allowlist:
            sym = normalize_ticker(raw)
            if not sym or sym in config.exclude:
                continue
            patterns = [
                rf"\${re.escape(sym)}\b",
                rf"#{re.escape(sym)}\b",
            ]
            if config.include_bare_caps:
                patterns.append(rf"\b{re.escape(sym)}\b")
            for pattern in patterns:
                if re.search(pattern, text, re.IGNORECASE):
                    matched.add(sym)
                    break
        return sorted(matched)

    return extract_tickers(text, config)


def config_from_dict(raw: dict | None) -> TickerDetectionConfig:
    if not raw:
        return TickerDetectionConfig()
    exclude_raw = raw.get("exclude") or []
    exclude = frozenset(
        {str(x).strip().upper() for x in exclude_raw if str(x).strip()}
    )
    if not exclude:
        exclude = DEFAULT_EXCLUDE
    else:
        exclude = DEFAULT_EXCLUDE | exclude
    return TickerDetectionConfig(
        min_length=int(raw.get("min_length", 2)),
        max_length=int(raw.get("max_length", 10)),
        include_bare_caps=bool(raw.get("include_bare_caps", True)),
        exclude=exclude,
    )
