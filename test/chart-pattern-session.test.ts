import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildChartPatternAnalysis} from '../dist/core/chart-patterns/recommendation.js';
import {enrichChartPatternHit} from '../dist/core/chart-patterns/pattern-enrich.js';
import {normalizeBarsFromRows} from '../dist/core/chart-patterns/swings.js';
import {scanChartPatterns} from '../dist/core/chart-patterns/scan.js';
import {
	bindChartPatternAnalysis,
	clearChartPatternAnalysisSession,
	getBoundChartPatternAnalysis,
	normalizePatternSelectionFields,
	resolveChartPatternApplyInput,
	stripChartPatternAnalysisForMcpApply,
} from '../dist/core/chart/chart-pattern-session-store.js';
import {
	applyChartPatternDrawings,
	calculateChartPatternDrawings,
} from '../dist/core/chart/analysis/chart-patterns-drawings-tools.js';
import {prepareChartFromRows} from '../dist/core/chart/prepare-from-rows.js';

function bar(time: number, o: number, h: number, l: number, c: number) {
	return {time, open: o, high: h, low: l, close: c};
}

function buildDoubleTopBars(): ReturnType<typeof bar>[] {
	const bars: ReturnType<typeof bar>[] = [];
	let t = 1_700_000_000;
	const push = (o: number, h: number, l: number, c: number) => {
		bars.push(bar(t, o, h, l, c));
		t += 3600;
	};
	for (let i = 0; i < 10; i++) {
		push(90 + i * 2, 92 + i * 2, 89 + i * 2, 91 + i * 2);
	}
	push(114, 120, 113, 118);
	push(112, 115, 100, 102);
	push(103, 108, 101, 106);
	push(108, 120, 107, 117);
	push(116, 118, 110, 112);
	for (let i = 0; i < 12; i++) {
		push(111 - i * 0.5, 113 - i * 0.5, 108 - i * 0.5, 110 - i * 0.5);
	}
	return bars;
}

function ethToolResult(rows: ReturnType<typeof bar>[]) {
	const startTimeMs = rows[0]!.time * 1000;
	const endTimeMs = rows[rows.length - 1]!.time * 1000 + 3_600_000;
	return {
		ohlcv: {
			coin: 'ETH',
			interval: '1h',
			startTimeMs,
			endTimeMs,
			candles: rows.map(b => ({
				timestampMs: b.time * 1000,
				open: String(b.open),
				high: String(b.high),
				low: String(b.low),
				close: String(b.close),
			})),
		},
	};
}

test('normalizePatternSelectionFields maps patternNumber to patternIndex', () => {
	const out = normalizePatternSelectionFields({patternNumber: 3});
	assert.equal(out.patternIndex, 2);
});

test('stripChartPatternAnalysisForMcpApply removes agent-view metadata keys', () => {
	const slim = stripChartPatternAnalysisForMcpApply({
		patterns: [{id: 'double_top'}],
		patternMenu: [{index: 0}],
		summary: 'forming',
		chartPatternTradeSetup: {side: 'long'},
		primaryPattern: {id: 'double_top'},
	});
	assert.ok(slim?.patterns);
	assert.equal(slim?.patternMenu, undefined);
	assert.equal(slim?.summary, undefined);
	assert.equal(slim?.chartPatternTradeSetup, undefined);
	assert.equal(slim?.primaryPattern?.id, 'double_top');
});

test('resolveChartPatternApplyInput injects bound patterns for menu selection', () => {
	const sessionKey = 'pattern-session';
	clearChartPatternAnalysisSession(sessionKey);
	const rows = buildDoubleTopBars();
	const rawBars = rows as Record<string, unknown>[];
	const hits = scanChartPatterns(rows, {minConfidence: 0.2}).map(hit =>
		enrichChartPatternHit(hit, normalizeBarsFromRows(rawBars), rawBars),
	);
	assert.ok(hits.length >= 1);
	const analysis = buildChartPatternAnalysis(hits, rows.length, 5, rows.at(-1)!.close);
	const bound = bindChartPatternAnalysis(sessionKey, analysis, {
		title: 'ETH-PERP 1H — last 7d',
		ohlcvDigest: 'digest-abc',
	});
	assert.ok(bound?.patterns.length);

	const resolved = resolveChartPatternApplyInput(sessionKey, {
		title: 'ETH-PERP 1H — last 7d',
		ohlcvDigest: 'digest-abc',
		patternNumber: 1,
	});
	assert.equal(resolved.ok, true);
	if (!resolved.ok) {
		return;
	}
	assert.ok(Array.isArray(resolved.data.analysis?.patterns));
	assert.equal(resolved.data.patternIndex, 0);
	assert.equal(resolved.data.analysis?.patterns?.[0]?.id, bound!.patterns[0]?.id);
	clearChartPatternAnalysisSession(sessionKey);
});

test('resolveChartPatternApplyInput fails without prior analyze bind', () => {
	const sessionKey = 'empty-pattern-session';
	clearChartPatternAnalysisSession(sessionKey);
	const resolved = resolveChartPatternApplyInput(sessionKey, {patternNumber: 1});
	assert.equal(resolved.ok, false);
	if (resolved.ok) {
		return;
	}
	assert.match(resolved.reason, /analyze_chart_patterns/i);
});

test('session-bound patternNumber applies overlay without pasted analysis geometry', async () => {
	const sessionKey = 'apply-pattern-session';
	clearChartPatternAnalysisSession(sessionKey);
	const rows = buildDoubleTopBars();
	const toolResult = ethToolResult(rows);
	const prepared = prepareChartFromRows({title: 'ETH-PERP 1H', toolResult});
	assert.equal(prepared.ok, true);
	if (!prepared.ok) {
		return;
	}
	const rawBars = rows as Record<string, unknown>[];
	const hits = scanChartPatterns(rows, {patterns: ['double_top'], minConfidence: 0.35}).map(hit =>
		enrichChartPatternHit(hit, normalizeBarsFromRows(rawBars), rawBars),
	);
	assert.ok(hits[0]);
	const analysis = buildChartPatternAnalysis(hits, rows.length, 1, rows.at(-1)!.close);
	bindChartPatternAnalysis(sessionKey, analysis, {title: 'ETH-PERP 1H'});

	const resolved = resolveChartPatternApplyInput(sessionKey, {
		title: 'ETH-PERP 1H',
		patternNumber: 1,
	});
	assert.equal(resolved.ok, true);
	if (!resolved.ok) {
		return;
	}

	const applied = await applyChartPatternDrawings({
		toolResult,
		rows,
		prepareReplay: prepared.data.prepareReplay,
		live: prepared.data.live,
		patternNumber: resolved.data.patternNumber,
		patternIndex: resolved.data.patternIndex,
		analysis: resolved.data.analysis,
	});
	assert.equal(applied.ok, true);
	if (!applied.ok) {
		return;
	}
	assert.ok(applied.data.chart.series.some(s => s.id.startsWith('pattern_')));
	clearChartPatternAnalysisSession(sessionKey);
});

test('getBoundChartPatternAnalysis clears when patterns empty', () => {
	const sessionKey = 'clear-pattern-session';
	clearChartPatternAnalysisSession(sessionKey);
	bindChartPatternAnalysis(sessionKey, {
		summary: 'none',
		classification: null,
		interpretation: '',
		primaryPattern: null,
		highestConfidencePattern: null,
		patternMenu: [],
		pattern: null,
		patterns: [],
		rationale: '',
	});
	assert.equal(getBoundChartPatternAnalysis(sessionKey), undefined);
	clearChartPatternAnalysisSession(sessionKey);
});
