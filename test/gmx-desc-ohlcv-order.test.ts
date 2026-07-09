import assert from 'node:assert/strict';
import {test} from 'node:test';
import {rejectTitleLookbackVsBarTimes} from '../dist/core/chart/chart-data-validation.js';
import {sanitizeOhlcvBarRows, validateOhlcvBarsFromToolResult} from '../dist/core/chart/ohlcv-window.js';

const NOW_MS = 1_783_627_200_000;
const FOUR_H_SEC = 4 * 3600;

function gmxFetchPayloadDesc(candleCount: number) {
	const newestSec = Math.floor(NOW_MS / 1000);
	const candles = [];
	for (let i = 0; i < candleCount; i++) {
		const tsMs = (newestSec - i * FOUR_H_SEC) * 1000;
		candles.push({
			timestampMs: tsMs,
			timeLabel: `bar-${i}`,
			open: '1700',
			high: '1710',
			low: '1690',
			close: '1705',
		});
	}
	return {
		symbol: 'ETH/USD [WETH-USDC]',
		timeframe: '4h',
		chainId: 42161,
		startTimeMs: candles[candles.length - 1]!.timestampMs,
		endTimeMs: candles[0]!.timestampMs,
		candleCount: candles.length,
		candles,
	};
}

test('rejectTitleLookbackVsBarTimes accepts GMX desc candles (min/max times)', () => {
	const fetch = gmxFetchPayloadDesc(42);
	const bars = sanitizeOhlcvBarRows(fetch.candles as Record<string, unknown>[]);
	const result = rejectTitleLookbackVsBarTimes('ETH/USD 4H — last 7d', bars);
	assert.equal(result.ok, true);
});

test('validateOhlcvBarsFromToolResult accepts desc GMX fetch after sanitize sort', () => {
	const fetch = gmxFetchPayloadDesc(42);
	const bars = sanitizeOhlcvBarRows(fetch.candles as Record<string, unknown>[]);
	const result = validateOhlcvBarsFromToolResult(bars, fetch, 'ETH/USD 4H — last 7d');
	assert.equal(result.ok, true);
});
