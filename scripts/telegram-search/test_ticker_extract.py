#!/usr/bin/env python3
"""Unit tests for ticker_extract (stdlib only)."""

from __future__ import annotations

import unittest

from ticker_extract import (
    TickerDetectionConfig,
    extract_tickers,
    find_tickers_in_message,
    normalize_ticker,
)

CONFIG = TickerDetectionConfig()


class TickerExtractTest(unittest.TestCase):
    def test_normalize(self) -> None:
        self.assertEqual(normalize_ticker("$eth"), "ETH")

    def test_cashtag(self) -> None:
        found = extract_tickers("Long $ETH position", CONFIG)
        self.assertIn("ETH", found)

    def test_blocklist(self) -> None:
        found = extract_tickers("THE market TVL", CONFIG)
        self.assertNotIn("THE", found)
        self.assertNotIn("TVL", found)

    def test_allowlist(self) -> None:
        matched = find_tickers_in_message("Buy $ETH", ["ETH"], CONFIG)
        self.assertEqual(matched, ["ETH"])

    def test_open_scan(self) -> None:
        matched = find_tickers_in_message("$SOL", [], CONFIG)
        self.assertEqual(matched, ["SOL"])


if __name__ == "__main__":
    unittest.main()
