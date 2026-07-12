import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {listChartAnalysisOptions} from '../dist/core/chart/analysis/analysis-catalog.js';
import {analyzeCandlestickPatterns} from '../dist/core/chart/analysis/candlestick-patterns-tools.js';
import {buildCandlestickTradeSetup} from '../dist/core/chart/analysis/trade-setups/candlestick-trade-setup.js';
import {
	tradeIdeaFromAnalyzeOutput,
} from '../dist/core/chart/analysis/trade-setups/trade-idea.js';

const sampleBars = [
	{time: 1000, open: 100, high: 102, low: 99, close: 101},
	{time: 2000, open: 101, high: 103, low: 100, close: 102},
	{time: 3000, open: 102, high: 104, low: 101, close: 103},
	{time: 4000, open: 103, high: 105, low: 102, close: 104},
	{time: 5000, open: 104, high: 106, low: 103, close: 105},
	{time: 6000, open: 105, high: 107, low: 104, close: 106},
	{time: 7000, open: 106, high: 108, low: 105, close: 107},
	{time: 8000, open: 107, high: 109, low: 106, close: 108},
	{time: 9000, open: 108, high: 110, low: 107, close: 109},
	{time: 10000, open: 109, high: 111, low: 108, close: 110},
	{time: 11000, open: 110, high: 112, low: 109, close: 111},
	{time: 12000, open: 111, high: 113, low: 110, close: 112},
	{time: 13000, open: 112, high: 114, low: 111, close: 113},
	{time: 14000, open: 113, high: 114, low: 111, close: 113.2},
];

test('listChartAnalysisOptions includes candlestick_patterns', () => {
	const catalog = listChartAnalysisOptions();
	assert.equal(catalog.analyses.length, 9);
	assert.ok(catalog.analyses.some(a => a.analyzeTool === 'analyze_candlestick_patterns'));
});

test('analyzeCandlestickPatterns returns analysis envelope not chart', async () => {
	const result = await analyzeCandlestickPatterns({
		title: 'Test',
		rows: sampleBars,
		allowRowsOnly: true,
		mergeLive: false,
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	assert.ok(result.data.analysis);
	assert.ok(result.data.meta);
	assert.equal((result.data as {kind?: string}).kind, undefined);
	assert.equal(typeof result.data.analysis.rationale, 'string');
});

test('analyzeCandlestickPatterns detects spinning top with name and description', async () => {
	const result = await analyzeCandlestickPatterns({
		title: 'Spinning top',
		rows: sampleBars,
		patterns: ['spinning_top'],
		allowRowsOnly: true,
		mergeLive: false,
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	const hit = result.data.analysis.patterns.find(p => p.id === 'spinning_top');
	assert.ok(hit);
	assert.equal(hit!.name, 'Spinning Top');
	assert.ok(hit!.description.length > 10);
	assert.ok(result.data.analysis.primaryPattern);
	assert.match(result.data.analysis.rationale, /Spinning Top detected/);
});

test('analyzeCandlestickPatterns rejects too few bars', async () => {
	const result = await analyzeCandlestickPatterns({
		rows: sampleBars.slice(0, 5),
		allowRowsOnly: true,
		mergeLive: false,
	});
	assert.equal(result.ok, false);
	if (result.ok) {
		return;
	}
	assert.match(result.reason, /at least/i);
});

test('analyzeCandlestickPatterns accepts toolResult JSON string', async () => {
	const result = await analyzeCandlestickPatterns({
		toolResult: JSON.stringify({result: sampleBars}),
		patterns: ['spinning_top'],
		mergeLive: false,
	});
	assert.equal(result.ok, true);
});

test('forward-outcome fixture: engulfing detected before rebound', async () => {
	const dir = dirname(fileURLToPath(import.meta.url));
	const fixture = JSON.parse(
		readFileSync(
			join(dir, 'fixtures/candlestick-patterns/btc-daily-engulfing-case.json'),
			'utf8',
		),
	) as {
		name: string;
		focusBarIndex: number;
		expectedPatternIds: string[];
		forwardHorizonBars: number;
		observedForwardReturnPct: number;
		bars: Array<{time: number; open: number; high: number; low: number; close: number}>;
	};

	const result = await analyzeCandlestickPatterns({
		title: fixture.name,
		rows: fixture.bars,
		focusBar: fixture.focusBarIndex,
		allowRowsOnly: true,
		mergeLive: false,
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}

	const detectedIds = result.data.analysis.patterns.map(p => p.id);
	for (const expected of fixture.expectedPatternIds) {
		assert.ok(
			detectedIds.includes(expected),
			`expected ${expected} at bar ${fixture.focusBarIndex}, got ${detectedIds.join(',')}`,
		);
	}

	const focusClose = fixture.bars[fixture.focusBarIndex]!.close;
	const forwardClose =
		fixture.bars[fixture.focusBarIndex + fixture.forwardHorizonBars]!.close;
	const forwardReturnPct = ((forwardClose - focusClose) / focusClose) * 100;
	assert.ok(Math.abs(forwardReturnPct - fixture.observedForwardReturnPct) < 0.5);

	if (result.data.analysis.recommendationConfidence > 0.8) {
		assert.equal(result.data.analysis.recommendation, 'buy');
	}
});

test('buildCandlestickTradeSetup clears long at current price for buy signal', () => {
	const setup = buildCandlestickTradeSetup({
		primaryPattern: {id: 'hammer', name: 'Hammer'},
		patterns: [
			{
				id: 'hammer',
				name: 'Hammer',
				confidence: 0.62,
				barIndex: 13,
				direction: 'bullish',
			},
		],
		recommendation: 'buy',
		recommendationConfidence: 0.7,
		focusBarIndex: 13,
		focusBarClose: 100,
		lastClose: 105,
	});
	assert.equal(setup.status, 'clear');
	assert.equal(setup.side, 'long');
	assert.equal(setup.entryPrice, 105);
	assert.equal(setup.entryLabel, 'current price');
});

test('buildCandlestickTradeSetup clears short at current price for sell signal', () => {
	const setup = buildCandlestickTradeSetup({
		primaryPattern: {id: 'shooting_star', name: 'Shooting Star'},
		patterns: [
			{
				id: 'shooting_star',
				name: 'Shooting Star',
				confidence: 0.58,
				barIndex: 13,
				direction: 'bearish',
			},
		],
		recommendation: 'sell',
		recommendationConfidence: 0.65,
		focusBarIndex: 13,
		focusBarClose: 100,
		lastClose: 98,
	});
	assert.equal(setup.status, 'clear');
	assert.equal(setup.side, 'short');
	assert.equal(setup.entryPrice, 98);
});

test('buildCandlestickTradeSetup marks neutral hold unclear without entry in trade idea', () => {
	const setup = buildCandlestickTradeSetup({
		primaryPattern: {id: 'doji', name: 'Doji'},
		patterns: [
			{
				id: 'doji',
				name: 'Doji',
				confidence: 0.4,
				barIndex: 13,
				direction: 'neutral',
			},
		],
		recommendation: 'hold',
		recommendationConfidence: 0.2,
		focusBarIndex: 13,
		focusBarClose: 100,
		lastClose: 101,
	});
	assert.equal(setup.status, 'unclear');
	assert.equal(setup.side, 'neutral');
	const idea = tradeIdeaFromAnalyzeOutput('analyze_candlestick_patterns', {
		candlestickTradeSetup: setup,
	});
	assert.ok(idea);
	assert.equal(idea!.completeness, 'none');
	assert.equal(idea!.entry, undefined);
});

test('analyzeCandlestickPatterns always returns candlestickTradeSetup', async () => {
	const result = await analyzeCandlestickPatterns({
		title: 'Test',
		rows: sampleBars,
		allowRowsOnly: true,
		mergeLive: false,
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	assert.ok(result.data.analysis.candlestickTradeSetup);
	assert.equal(typeof result.data.analysis.candlestickTradeSetup!.status, 'string');
});

test('analyzeCandlestickPatterns returns candlestickHighlight with preview bars', async () => {
	const result = await analyzeCandlestickPatterns({
		title: 'Spinning top',
		rows: sampleBars,
		patterns: ['spinning_top'],
		allowRowsOnly: true,
		mergeLive: false,
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	const highlight = result.data.analysis.candlestickHighlight;
	assert.ok(highlight);
	assert.ok(highlight.summary.length > 0);
	assert.ok(highlight.previewBars.length >= 1);
	assert.equal(highlight.previewBars[highlight.previewBars.length - 1]!.isFocus, true);
});
