import assert from 'node:assert/strict';
import {test} from 'node:test';
import {analyzeChartPatterns} from '../dist/core/chart/analysis/chart-patterns-tools.js';
import {analyzeTrendStructure} from '../dist/core/chart/analysis/analyze-tools.js';
import {AGENT_OHLCV_DATA_POLICY} from '../dist/core/chart/analysis/analysis-meta.js';
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

test('analyzeChartPatterns accepts label and stringified rows', async () => {
	const rows = buildFlatTrendBars(45);
	const result = await analyzeChartPatterns({
		label: 'ETH-PERP',
		title: 'ETH-PERP 1H — last 7d',
		rows: JSON.stringify(rows),
		allowRowsOnly: true,
		mergeLive: false,
	});
	assert.equal(result.ok, true);
});

test('analyzeChartPatterns prefers toolResult over stale hand-copied rows', async () => {
	const fetchBars = buildFlatTrendBars(45).map((b, i) => {
		const close = 1700 + i;
		return {
			...b,
			open: String(close - 0.2),
			high: String(close + 0.5),
			low: String(close - 0.5),
			close: String(close),
		};
	});
	const staleRows = fetchBars.slice(0, 30).map(b => ({...b, close: '1500'}));
	const result = await analyzeChartPatterns({
		title: 'ETH-PERP 1H — last 7d',
		toolResult: {ohlcv: {coin: 'ETH', interval: '1h', candles: fetchBars}},
		rows: staleRows,
		mergeLive: false,
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	assert.equal(result.data.meta.barCount, 45);
});

test('analyzeChartPatterns accepts hyperliquid toolResult object', async () => {
	const rows = buildFlatTrendBars(45);
	const result = await analyzeChartPatterns({
		title: 'ETH-PERP 1H — last 7d',
		toolResult: {
			ohlcv: {
				coin: 'ETH',
				interval: '1h',
				candles: rows,
			},
		},
		mergeLive: false,
	});
	assert.equal(result.ok, true);
});

test('analyzeChartPatterns meta includes ohlcvSummary and dataPolicy', async () => {
	const rows = buildFlatTrendBars(45);
	const result = await analyzeChartPatterns({
		title: 'ETH-PERP 1H — last 7d',
		toolResult: {ohlcv: {coin: 'ETH', interval: '1h', candles: rows}},
		mergeLive: false,
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	assert.equal(result.data.meta.dataPolicy, AGENT_OHLCV_DATA_POLICY);
	assert.ok(result.data.meta.ohlcvSummary);
	assert.equal(result.data.meta.ohlcvSummary!.barCount, 45);
});

test('analyzeTrendStructure prefers toolResult over stale hand-copied rows', async () => {
	const fetchBars = buildFlatTrendBars(20).map((b, i) => {
		const close = 1700 + i;
		return {
			...b,
			open: String(close - 0.2),
			high: String(close + 0.5),
			low: String(close - 0.5),
			close: String(close),
		};
	});
	const staleRows = fetchBars.slice(0, 10).map(b => ({...b, close: '1500'}));
	const result = await analyzeTrendStructure({
		title: 'ETH-PERP 1H — last 7d',
		toolResult: {ohlcv: {coin: 'ETH', interval: '1h', candles: fetchBars}},
		rows: staleRows,
		mergeLive: false,
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	assert.equal(result.data.meta.barCount, 20);
	assert.equal(result.data.meta.ohlcvSummary?.lastClose, 1700 + 19);
});
