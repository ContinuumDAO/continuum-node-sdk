import assert from 'node:assert/strict';
import {test} from 'node:test';
import {analyzeChartPatterns} from '../dist/core/chart/analysis/chart-patterns-tools.js';
import {preprocessOhlcvToolInput} from '../dist/core/chart/analysis/ohlcv-input.js';

function buildFlatTrendBars(count = 45) {
	const bars = [];
	let t = 1_782_658_800;
	let price = 100;
	for (let i = 0; i < count; i++) {
		price += 0.3;
		bars.push({
			timestampMs: t + i * 3_600_000,
			open: String(price - 0.2),
			high: String(price + 0.5),
			low: String(price - 0.5),
			close: String(price),
			volume: '1',
		});
	}
	return bars;
}

test('preprocessOhlcvToolInput parses stringified rows', () => {
	const rows = buildFlatTrendBars(30);
	const preprocessed = preprocessOhlcvToolInput({
		label: 'ETH-PERP',
		rows: JSON.stringify(rows),
	}) as {rows?: unknown[]; label?: string};
	assert.ok(Array.isArray(preprocessed.rows));
	assert.equal(preprocessed.rows?.length, 30);
	assert.equal(preprocessed.label, 'ETH-PERP');
});

test('analyzeChartPatterns accepts label and stringified rows', () => {
	const rows = buildFlatTrendBars(45);
	const result = analyzeChartPatterns({
		label: 'ETH-PERP',
		title: 'ETH-PERP 1H — last 7d',
		rows: JSON.stringify(rows),
	});
	assert.equal(result.ok, true);
});

test('analyzeChartPatterns accepts hyperliquid toolResult object', () => {
	const rows = buildFlatTrendBars(45);
	const result = analyzeChartPatterns({
		title: 'ETH-PERP 1H — last 7d',
		toolResult: {
			ohlcv: {
				coin: 'ETH',
				interval: '1h',
				candles: rows,
			},
		},
	});
	assert.equal(result.ok, true);
});
