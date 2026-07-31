import assert from 'node:assert/strict';
import test from 'node:test';
import {
	detectDivergences,
	selectPrimaryDivergence,
	confidenceForHit,
} from '../dist/core/chart/analysis/divergence/detect.js';
import {findPeaks, findTroughs} from '../dist/core/chart/analysis/divergence/peaks.js';
import {
	buildDivergenceTradeSetup,
	pivotStructureLevels,
} from '../dist/core/chart/analysis/trade-setups/divergence-trade-setup.js';
import {tradeIdeaFromAnalyzeOutput} from '../dist/core/chart/analysis/trade-setups/trade-idea.js';
import {
	ensureDivergenceIndicatorOverlays,
	hitsToDivergenceOverlay,
} from '../dist/core/chart/analysis/divergence-drawings-tools.js';
import {
	alignIndicatorObjectFieldToBars,
	alignIndicatorValuesToBars,
} from '../dist/core/chart/analysis/divergence-analyze-tools.js';
import {resolveOscillatorPaneIds} from '../dist/core/chart/overlays.js';

test('findPeaks respects distance and prominence', () => {
	const values = [1, 3, 1, 1, 5, 1, 1, 4, 1];
	const peaks = findPeaks(values, {distance: 2, prominence: 1});
	assert.ok(peaks.includes(4));
	assert.ok(!peaks.includes(1) || peaks.includes(4));
});

test('findTroughs finds local minima', () => {
	const values = [5, 1, 5, 0, 5];
	const troughs = findTroughs(values, {distance: 1, prominence: 0.5});
	assert.ok(troughs.includes(1));
	assert.ok(troughs.includes(3));
});

test('detectDivergences finds regular bullish LL + HL', () => {
	// Crafted closes with two troughs: lower low; oscillator higher low.
	const prices: number[] = [];
	const osc: number[] = [];
	const times: number[] = [];
	for (let i = 0; i < 80; i++) {
		times.push(1_700_000_000 + i * 3600);
		// Base downtrend with troughs around i=20 (price 100) and i=50 (price 90)
		let p = 120 - i * 0.3;
		let o = 40;
		if (i === 20) {
			p = 100;
			o = 25;
		}
		if (i === 50) {
			p = 90;
			o = 32;
		}
		// Neighbors slightly higher so 20/50 are clear troughs
		if (i === 19 || i === 21) {
			p = 105;
			o = 30;
		}
		if (i === 49 || i === 51) {
			p = 95;
			o = 28;
		}
		prices.push(p);
		osc.push(o);
	}

	const hits = detectDivergences({
		prices,
		oscillator: osc,
		timesSec: times,
		oscillatorId: 'rsi',
		period: 14,
		maxLag: 2,
		includeHidden: true,
		priceProminence: 0.5,
		oscillatorProminence: 1,
		distance: 5,
	});

	const regularBull = hits.filter(h => h.kind === 'regular_bullish');
	assert.ok(
		regularBull.length >= 1,
		`expected regular_bullish, got ${hits.map(h => h.kind).join(',')}`,
	);
	const primary = selectPrimaryDivergence(hits);
	assert.ok(primary);
	assert.equal(primary!.side, 'long');
	assert.ok(primary!.confidence >= 0.45);
	assert.ok(confidenceForHit(primary!) <= 0.85);
});

test('pivotStructureLevels measured move and invalidation', () => {
	const longLevels = pivotStructureLevels({
		side: 'long',
		p1Price: 100,
		p2Price: 90,
		lastClose: 92,
	});
	assert.ok(longLevels);
	assert.equal(longLevels!.entryPrice, 92);
	assert.equal(longLevels!.invalidationPrice, 90);
	assert.equal(longLevels!.targetPrice, 102); // 92 + 10

	const shortLevels = pivotStructureLevels({
		side: 'short',
		p1Price: 100,
		p2Price: 110,
		lastClose: 108,
	});
	assert.ok(shortLevels);
	assert.equal(shortLevels!.invalidationPrice, 110);
	assert.equal(shortLevels!.targetPrice, 98); // 108 - 10
});

test('buildDivergenceTradeSetup clear has full levels', () => {
	const setup = buildDivergenceTradeSetup({
		lastClose: 92,
		primary: {
			kind: 'regular_bullish',
			oscillator: 'rsi',
			p1: {index: 10, timeSec: 100, value: 100},
			p2: {index: 20, timeSec: 200, value: 90},
			o1: {index: 10, timeSec: 100, value: 28},
			o2: {index: 20, timeSec: 200, value: 35},
			barsSinceConfirm: 1,
			side: 'long',
			confidence: 0.62,
		},
	});
	assert.ok(setup);
	assert.equal(setup!.status, 'clear');
	assert.equal(setup!.side, 'long');
	assert.equal(setup!.setupPurposeCode, 'div');
	assert.ok(setup!.entryPrice != null);
	assert.ok(setup!.targetPrice != null);
	assert.ok(setup!.invalidationPrice != null);
	assert.ok(setup!.targetPrice! > setup!.entryPrice!);

	const idea = tradeIdeaFromAnalyzeOutput('analyze_divergence', {
		divergenceTradeSetup: setup,
	});
	assert.ok(idea);
	assert.equal(idea!.completeness, 'full');
	assert.equal(idea!.source.analysisType, 'divergence');
});

test('buildDivergenceTradeSetup clear when price has moved past classic p2 measured move', () => {
	// Classic p2+range (= p1) is already spent, but projecting swing size from entry stays ahead.
	const setup = buildDivergenceTradeSetup({
		lastClose: 64091.5,
		primary: {
			kind: 'regular_bullish',
			oscillator: 'rsi',
			p1: {index: 10, timeSec: 100, value: 60_000},
			p2: {index: 20, timeSec: 200, value: 58_000},
			o1: {index: 10, timeSec: 100, value: 28},
			o2: {index: 20, timeSec: 200, value: 35},
			barsSinceConfirm: 1,
			side: 'long',
			confidence: 0.62,
		},
	});
	assert.ok(setup);
	assert.equal(setup!.side, 'long');
	assert.equal(setup!.status, 'clear');
	assert.equal(setup!.entryPrice, 64091.5);
	assert.equal(setup!.targetPrice, 66091.5);
	assert.equal(setup!.invalidationPrice, 58_000);
});

test('buildDivergenceTradeSetup unclear when invalidation already spent', () => {
	const setup = buildDivergenceTradeSetup({
		lastClose: 57_500,
		primary: {
			kind: 'regular_bullish',
			oscillator: 'rsi',
			p1: {index: 10, timeSec: 100, value: 60_000},
			p2: {index: 20, timeSec: 200, value: 58_000},
			o1: {index: 10, timeSec: 100, value: 28},
			o2: {index: 20, timeSec: 200, value: 35},
			barsSinceConfirm: 1,
			side: 'long',
			confidence: 0.62,
		},
	});
	assert.ok(setup);
	assert.equal(setup!.side, 'long');
	assert.equal(setup!.status, 'unclear');
	assert.equal(setup!.entryPrice, undefined);
	assert.match(setup!.unclearReason ?? '', /already spent/i);
});

test('buildDivergenceTradeSetup unclear when swing is a micro-wiggle', () => {
	const setup = buildDivergenceTradeSetup({
		lastClose: 64091.5,
		primary: {
			kind: 'regular_bullish',
			oscillator: 'rsi',
			p1: {index: 10, timeSec: 100, value: 62_529},
			p2: {index: 20, timeSec: 200, value: 62_473},
			o1: {index: 10, timeSec: 100, value: 28},
			o2: {index: 20, timeSec: 200, value: 35},
			barsSinceConfirm: 1,
			side: 'long',
			confidence: 0.62,
		},
	});
	assert.ok(setup);
	assert.equal(setup!.status, 'unclear');
	assert.match(setup!.unclearReason ?? '', /too small/i);
});

test('ensureDivergenceIndicatorOverlays always adds Stoch RSI with candles series id', () => {
	const withOnlyEma = ensureDivergenceIndicatorOverlays(
		[{type: 'ema', sourceSeriesId: 'candles', period: 50}],
		false,
	);
	assert.ok(withOnlyEma.some(o => o.type === 'stochasticrsi'));
	const stoch = withOnlyEma.find(o => o.type === 'stochasticrsi');
	assert.equal((stoch as {sourceSeriesId: string}).sourceSeriesId, 'candles');
	assert.ok(!withOnlyEma.some(o => o.type === 'rsi'));

	const withRsiNeed = ensureDivergenceIndicatorOverlays([], true);
	assert.ok(withRsiNeed.some(o => o.type === 'rsi'));
	assert.ok(withRsiNeed.some(o => o.type === 'stochasticrsi'));
	assert.equal(
		(withRsiNeed.find(o => o.type === 'rsi') as {sourceSeriesId: string}).sourceSeriesId,
		'candles',
	);
});

test('alignIndicatorValuesToBars right-aligns short TI output like chart overlays', () => {
	const values = [10, 20, 30];
	const aligned = alignIndicatorValuesToBars(6, values, 3);
	assert.deepEqual(aligned, [null, null, null, 10, 20, 30]);
});

test('alignIndicatorObjectFieldToBars right-aligns short Stoch RSI rows', () => {
	const rows = [{k: 11}, {k: 22}, {k: 33}];
	const aligned = alignIndicatorObjectFieldToBars(5, rows, 2, rec =>
		typeof rec.k === 'number' ? rec.k : null,
	);
	assert.deepEqual(aligned, [null, null, 11, 22, 33]);
});

test('alignIndicatorValuesToBars skips warmup when TI returns full-length array', () => {
	const values = [1, 2, 3, 4, 5];
	const aligned = alignIndicatorValuesToBars(5, values, 2);
	assert.deepEqual(aligned, [null, null, 3, 4, 5]);
});

test('hitsToDivergenceOverlay + pane ids', () => {
	const overlays = ensureDivergenceIndicatorOverlays(
		[{type: 'rsi', sourceSeriesId: 'price', id: 'divergence_rsi', period: 14}],
		true,
	);
	const panes = resolveOscillatorPaneIds(overlays);
	assert.ok(panes.rsi);
	assert.ok(panes.stochasticrsi);

	const overlay = hitsToDivergenceOverlay(
		[
			{
				kind: 'regular_bearish',
				oscillator: 'rsi',
				p1: {index: 1, timeSec: 10, value: 100},
				p2: {index: 2, timeSec: 20, value: 110},
				o1: {index: 1, timeSec: 10, value: 75},
				o2: {index: 2, timeSec: 20, value: 68},
				barsSinceConfirm: 0,
			},
		],
		panes,
	);
	assert.ok(overlay);
	assert.equal(overlay!.type, 'divergence');
	assert.equal(overlay!.segments[0]!.oscillatorPaneId, panes.rsi);
});
