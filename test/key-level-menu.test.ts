import assert from 'node:assert/strict';
import test from 'node:test';
import {analyzeKeyLevels, analyzeKeyLevelFibonacci} from '../dist/core/chart/analysis/analyze-tools.js';
import {applyKeyFibDrawings} from '../dist/core/chart/analysis/key-fib-drawings-tools.js';
import {applyKeyLevelDrawings} from '../dist/core/chart/analysis/key-level-drawings-tools.js';
import {
	buildKeyLevelFibPairs,
	buildKeyLevelMenu,
	fibPairOverlayId,
	keyLevelConfidenceFromStrength,
	keyLevelMenuDisplayLabel,
	pickKeyLevelByNumber,
	pickStrongestBracketFibPair,
} from '../dist/core/chart/analysis/key-level-menu-summary.js';
import {detectKeyLevelBreaks} from '../dist/core/chart/analysis/key-level-break-detect.js';
import {buildKeyLevelFibRetraceTradeSetup, applyKeyLevelFibSideVariant, invertedFib618} from '../dist/core/chart/analysis/trade-setups/key-level-fib-retrace-trade-setup.js';
import {buildKeyLevelsTradeSetup} from '../dist/core/chart/analysis/trade-setups/key-levels-trade-setup.js';
import {prepareChart} from '../dist/core/chart/prepare.js';

function syntheticBars(count: number): Record<string, unknown>[] {
	const bars: Record<string, unknown>[] = [];
	let price = 100;
	for (let i = 0; i < count; i++) {
		const wave = Math.sin(i / 4) * 3;
		const open = price;
		const close = price + wave + 0.15;
		const high = Math.max(open, close) + 1.2;
		const low = Math.min(open, close) - 1.2;
		bars.push({
			time: 1_700_000_000 + i * 3600,
			open,
			high,
			low,
			close,
			volume: 1000 + i,
		});
		price = close + 0.08;
	}
	return bars;
}

test('analyzeKeyLevels returns levelMenu, summary, and interpretation (no fibPairs)', async () => {
	const bars = syntheticBars(64);
	const result = await analyzeKeyLevels({
		rows: bars,
		title: 'TEST 1H',
		allowRowsOnly: true,
		mergeLive: false,
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	const analysis = result.data.analysis;
	assert.ok(Array.isArray(analysis.levelMenu));
	assert.equal('fibPairs' in analysis, false);
	assert.ok(typeof analysis.summary === 'string');
	assert.ok(typeof analysis.interpretation === 'string');
	if (analysis.levelMenu.length > 0) {
		const row = analysis.levelMenu[0]!;
		assert.equal(row.levelNumber, 1);
		assert.ok(row.isPrimary);
	}
	if (analysis.keyLevelsTradeSetup?.levelNumber != null) {
		assert.match(analysis.interpretation, /Level #/);
	}
});

test('analyzeKeyLevelFibonacci returns fibPairs and keyLevelFibTradeSetup', async () => {
	const bars = syntheticBars(64);
	const result = await analyzeKeyLevelFibonacci({
		rows: bars,
		title: 'TEST 1H fib',
		allowRowsOnly: true,
		mergeLive: false,
		fibKeyLevelMinConfidence: 0.01,
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	const analysis = result.data.analysis;
	assert.ok(Array.isArray(analysis.levelMenu));
	assert.ok(Array.isArray(analysis.fibPairs));
	assert.ok(typeof analysis.summary === 'string');
	if (analysis.fibPairs.length > 0) {
		assert.equal(analysis.fibPairs.length, 1);
		assert.equal(analysis.fibPairs[0]!.pairKind, 'strongest_bracket');
		assert.match(analysis.interpretation, /Strongest-bracket|Level #/i);
		assert.ok(analysis.primaryFibPair);
	} else {
		assert.match(analysis.interpretation, /No valid strongest-bracket|fibKeyLevelMinConfidence/i);
	}
});

test('buildKeyLevelMenu and strongest-bracket fib pair', () => {
	const menu = buildKeyLevelMenu(
		[
			{kind: 'support', price: 95, strength: 40, touchCount: 3},
			{kind: 'resistance', price: 110, strength: 35, touchCount: 2},
			{kind: 'support', price: 88, strength: 50, touchCount: 4},
		],
		100,
	);
	assert.equal(menu.length, 3);
	assert.equal(menu[0]!.levelNumber, 1);
	assert.equal(menu[0]!.isPrimary, true);
	assert.equal(menu.filter(row => row.isNearestSupport).length, 1);
	assert.equal(keyLevelMenuDisplayLabel('support', 1, 95), 'Level #1 Support @ 95.00');
	assert.equal(pickKeyLevelByNumber(menu, 2)?.price, 110);

	const pairs = buildKeyLevelFibPairs(menu, 100);
	assert.equal(pairs.length, 1);
	const primary = pairs[0]!;
	assert.equal(primary.pairKind, 'strongest_bracket');
	// Strongest below close is Level #3 @ 88 (strength 50), strongest above is Level #2 @ 110.
	assert.equal(primary.lowLevelNumber, 3);
	assert.equal(primary.highLevelNumber, 2);
	assert.equal(primary.isPrimaryTradePair, true);
	assert.ok(primary.retracement618 > primary.low);
	assert.equal(fibPairOverlayId(3, 2), 'KeyFib #3-#2');
});

test('buildKeyLevelFibPairs rejects bracket when a leg is below fibKeyLevelMinConfidence', () => {
	const menu = buildKeyLevelMenu(
		[
			{kind: 'support', price: 95, strength: 20, touchCount: 2},
			{kind: 'resistance', price: 110, strength: 50, touchCount: 4},
		],
		100,
	);
	assert.equal(keyLevelConfidenceFromStrength(20), 0.2);
	assert.equal(buildKeyLevelFibPairs(menu, 100).length, 0);
	assert.equal(buildKeyLevelFibPairs(menu, 100, {minConfidence: 0.2}).length, 1);
});

test('buildKeyLevelMenu assigns positional role and broken labels', () => {
	const menu = buildKeyLevelMenu(
		[{kind: 'resistance', price: 1693, strength: 5, touchCount: 4}],
		1791,
	);
	assert.equal(menu.length, 1);
	const row = menu[0]!;
	assert.equal(row.swingKind, 'resistance');
	assert.equal(row.kind, 'support');
	assert.equal(row.isRoleFlipped, true);
	assert.equal(
		keyLevelMenuDisplayLabel(row.kind, row.levelNumber, row.price, row.swingKind),
		'Level #1 Broken resistance (support) @ 1693.00',
	);
});

test('buildKeyLevelFibRetraceTradeSetup defaults short above 0.618 inside range', () => {
	const menu = buildKeyLevelMenu(
		[
			{kind: 'support', price: 90, strength: 40, touchCount: 3},
			{kind: 'support', price: 100, strength: 50, touchCount: 4},
			{kind: 'resistance', price: 200, strength: 50, touchCount: 4},
			{kind: 'resistance', price: 210, strength: 40, touchCount: 3},
		],
		175,
	);
	const fibPairs = buildKeyLevelFibPairs(menu, 175);
	const setup = buildKeyLevelFibRetraceTradeSetup({
		lastClose: 175,
		levelMenu: menu,
		fibPairs,
	});
	assert.ok(setup);
	assert.equal(setup!.priceRegime, 'inside_range');
	assert.equal(setup!.insideSubRegime, 'upper_half');
	assert.equal(setup!.defaultSide, 'short');
	assert.equal(setup!.side, 'short');
	assert.equal(setup!.targetSource, 'retrace_618');
	assert.equal(setup!.fibRangeInverted, false);
	assert.equal(setup!.displayTrend, 'down');
	assert.ok(setup!.sideVariants?.long);
	assert.ok(setup!.sideVariants?.short);
	assert.equal(setup!.entryPrice, setup!.high);
	assert.equal(setup!.sideVariants!.short!.entryPrice, setup!.high);
	assert.equal(setup!.sideVariants!.long!.entryPrice, setup!.low);
	assert.equal(setup!.targetPrice, setup!.retracement618);
	assert.equal(setup!.framing, 'retrace');
	assert.equal(setup!.setupPurposeCode, 'kl-fib');
	assert.equal('breakRetestAlternative' in setup!, false);
	assert.equal('extension1618Up' in (fibPairs[0] ?? {}), false);
});

test('buildKeyLevelFibRetraceTradeSetup defaults long below 0.618 with inverted range', () => {
	const menu = buildKeyLevelMenu(
		[
			{kind: 'support', price: 90, strength: 40, touchCount: 3},
			{kind: 'support', price: 100, strength: 50, touchCount: 4},
			{kind: 'resistance', price: 200, strength: 50, touchCount: 4},
			{kind: 'resistance', price: 210, strength: 40, touchCount: 3},
		],
		120,
	);
	const fibPairs = buildKeyLevelFibPairs(menu, 120);
	const pair = pickStrongestBracketFibPair(fibPairs);
	assert.ok(pair);
	const setup = buildKeyLevelFibRetraceTradeSetup({
		lastClose: 120,
		levelMenu: menu,
		fibPairs,
	});
	assert.ok(setup);
	assert.equal(setup!.insideSubRegime, 'lower_half');
	assert.equal(setup!.fibRangeInverted, true);
	assert.equal(setup!.displayTrend, 'up');
	assert.equal(setup!.defaultSide, 'long');
	assert.equal(setup!.side, 'long');
	assert.equal(setup!.entryPrice, setup!.low);
	assert.equal(setup!.sideVariants!.long!.entryPrice, setup!.low);
	assert.equal(setup!.sideVariants!.short!.entryPrice, setup!.high);
	assert.equal(setup!.targetPrice, invertedFib618(pair!.low, pair!.high));
});

test('buildKeyLevelFibRetraceTradeSetup skill defaultSidePreference overrides upper-half short default', () => {
	const menu = buildKeyLevelMenu(
		[
			{kind: 'support', price: 90, strength: 40, touchCount: 3},
			{kind: 'support', price: 100, strength: 50, touchCount: 4},
			{kind: 'resistance', price: 200, strength: 50, touchCount: 4},
			{kind: 'resistance', price: 210, strength: 40, touchCount: 3},
		],
		175,
	);
	const fibPairs = buildKeyLevelFibPairs(menu, 175);
	const setup = buildKeyLevelFibRetraceTradeSetup({
		lastClose: 175,
		levelMenu: menu,
		fibPairs,
		defaultSidePreference: 'long',
	});
	assert.ok(setup);
	assert.equal(setup!.side, 'long');
	assert.equal(setup!.targetSource, 'range_leg');
	assert.equal(setup!.displayTrend, 'down');
});

test('applyKeyLevelFibSideVariant swaps short default to long inside upper half', () => {
	const menu = buildKeyLevelMenu(
		[
			{kind: 'support', price: 90, strength: 40, touchCount: 3},
			{kind: 'support', price: 100, strength: 50, touchCount: 4},
			{kind: 'resistance', price: 200, strength: 50, touchCount: 4},
			{kind: 'resistance', price: 210, strength: 40, touchCount: 3},
		],
		175,
	);
	const fibPairs = buildKeyLevelFibPairs(menu, 175);
	const setup = buildKeyLevelFibRetraceTradeSetup({
		lastClose: 175,
		levelMenu: menu,
		fibPairs,
	});
	assert.ok(setup);
	const longVariant = applyKeyLevelFibSideVariant(setup, 'long');
	assert.equal(longVariant.side, 'long');
	assert.equal(longVariant.entryPrice, setup!.low);
	assert.equal(longVariant.targetPrice, setup!.high);
});

test('strongest-bracket Fib is invalid when price is above all key levels (no level above)', () => {
	const menu = buildKeyLevelMenu(
		[
			{kind: 'support', price: 100, strength: 50, touchCount: 4},
			{kind: 'resistance', price: 110, strength: 40, touchCount: 3},
		],
		115,
	);
	const fibPairs = buildKeyLevelFibPairs(menu, 115);
	assert.equal(fibPairs.length, 0);
	assert.equal(
		buildKeyLevelFibRetraceTradeSetup({
			lastClose: 115,
			levelMenu: menu,
			fibPairs,
			bars: syntheticBars(48),
		}),
		null,
	);
});

test('strongest-bracket Fib is invalid when price is below all key levels (no level below)', () => {
	const menu = buildKeyLevelMenu(
		[
			{kind: 'support', price: 100, strength: 50, touchCount: 4},
			{kind: 'resistance', price: 110, strength: 40, touchCount: 3},
		],
		95,
	);
	const fibPairs = buildKeyLevelFibPairs(menu, 95);
	assert.equal(fibPairs.length, 0);
	assert.equal(
		buildKeyLevelFibRetraceTradeSetup({
			lastClose: 95,
			levelMenu: menu,
			fibPairs,
			bars: syntheticBars(48),
		}),
		null,
	);
});

test('strongest-bracket Fib stays inside_range between strong legs', () => {
	const menu = buildKeyLevelMenu(
		[
			{kind: 'support', price: 100, strength: 50, touchCount: 4},
			{kind: 'resistance', price: 110, strength: 50, touchCount: 4},
		],
		105,
	);
	const fibPairs = buildKeyLevelFibPairs(menu, 105);
	assert.equal(fibPairs.length, 1);
	const setup = buildKeyLevelFibRetraceTradeSetup({
		lastClose: 105,
		levelMenu: menu,
		fibPairs,
		bars: syntheticBars(48),
	});
	assert.ok(setup);
	assert.equal(setup!.source, 'strongest_bracket');
	assert.equal(setup!.priceRegime, 'inside_range');
	assert.equal(setup!.low, 100);
	assert.equal(setup!.high, 110);
	assert.equal(setup!.entryProximityPct, 1);
	assert.equal(setup!.entryOffsetPct, 1);
	assert.equal(setup!.invalidationOffsetPct, 1);
});

test('buildKeyLevelsTradeSetup keeps bounce as primary default', () => {
	const menu = buildKeyLevelMenu(
		[
			{kind: 'support', price: 99, strength: 5, touchCount: 4},
			{kind: 'resistance', price: 105, strength: 4, touchCount: 3},
		],
		100,
	);
	const fibPairs = buildKeyLevelFibPairs(menu, 100, {minConfidence: 0.01});
	const setup = buildKeyLevelsTradeSetup({
		lastClose: 100,
		nearestSupport: {price: 99, strength: 5},
		nearestResistance: {price: 105, strength: 4},
		levels: menu.map(row => ({
			price: row.price,
			kind: row.kind,
			strength: row.strength,
			touchCount: row.touchCount,
		})),
		levelMenu: menu,
		fibPairs,
		bars: syntheticBars(48),
	});
	if (!setup) {
		return;
	}
	assert.equal(setup.framing, 'bounce');
	assert.equal(setup.entryOffsetMode, 'bounce');
	assert.ok(setup.setupPurposeCode === 'kl-bnc' || setup.setupPurposeCode === 'kl-brk');
	assert.ok(setup.levelNumber != null);
});

test('detectKeyLevelBreaks finds bullish break through resistance', () => {
	const menu = buildKeyLevelMenu(
		[{kind: 'resistance', price: 100, strength: 5, touchCount: 3}],
		101,
	);
	const bars: Record<string, unknown>[] = [];
	for (let i = 0; i < 40; i++) {
		const close = i < 35 ? 99 : 102;
		bars.push({
			time: 1_700_000_000 + i * 3600,
			open: close,
			high: close + 1,
			low: close - 0.5,
			close,
			volume: 1000,
		});
	}
	const breaks = detectKeyLevelBreaks(menu, bars);
	assert.ok(breaks.length >= 1);
	assert.equal(breaks[0]!.direction, 'bullish');
});

test('applyKeyFibDrawings shows axis labels on 0, 0.618, and 1 only', async () => {
	const bars = syntheticBars(64);
	const fibResult = await analyzeKeyLevelFibonacci({
		rows: bars,
		title: 'Key fib labels',
		allowRowsOnly: true,
		mergeLive: false,
		fibKeyLevelMinConfidence: 0.01,
	});
	assert.equal(fibResult.ok, true);
	if (!fibResult.ok || fibResult.data.analysis.fibPairs.length < 1) {
		return;
	}
	const pair = fibResult.data.analysis.fibPairs[0]!;
	const prepared = prepareChart({
		title: 'Key fib labels',
		bars,
		options: {skipDefaultOverlays: true},
	});
	assert.equal(prepared.ok, true);
	if (!prepared.ok) {
		return;
	}
	const applied = await applyKeyFibDrawings({
		rows: bars,
		prepareReplay: prepared.data.prepareReplay,
		fibPairNumber: pair.pairNumber,
		analysis: {...fibResult.data.analysis, keyLevelFibTradeSetup: undefined},
	});
	assert.equal(applied.ok, true);
	if (!applied.ok) {
		return;
	}
	const fibSeries = applied.data.chart.series.filter(s => s.label?.startsWith('Fib '));
	assert.ok(fibSeries.length > 3);
	const fibAxisLabels = fibSeries.filter(s => s.lastValueVisible !== false);
	assert.deepEqual(
		fibAxisLabels.map(s => s.label).sort(),
		['Fib 0.0%', 'Fib 100.0%', 'Fib 61.8%'],
	);
	const mutedFib = fibSeries.filter(s => s.lastValueVisible === false);
	assert.ok(mutedFib.length >= 3);
	for (const s of mutedFib) {
		assert.equal(s.style?.color, '#E040FB');
		assert.equal(s.style?.lineWidth, 2);
	}
	const fibOverlay = (applied.data.prepareReplay.overlays ?? []).find(
		o => o.type === 'fibonacci' && String(o.id ?? '').startsWith('KeyFib #'),
	);
	assert.equal(fibOverlay?.levels, undefined);
	const fib0 = applied.data.chart.series.find(s => s.label === 'Fib 0.0%');
	const fib1 = applied.data.chart.series.find(s => s.label === 'Fib 100.0%');
	const fib618 = applied.data.chart.series.find(s => s.label === 'Fib 61.8%');
	assert.ok(fib0 && fib1 && fib618);
	const lastPrice = (s: {data: Array<{value: number}>}) => s.data[s.data.length - 1]!.value;
	assert.equal(lastPrice(fib0), pair.low);
	assert.equal(lastPrice(fib1), pair.high);
	assert.equal(lastPrice(fib618), pair.retracement618);
});

test('fib pair closeAboveMid is not chartFibTrend in upper half (root inversion bug)', () => {
	const low = 1580;
	const high = 1850;
	const close = 1780;
	const menu = buildKeyLevelMenu(
		[
			{kind: 'support', price: low - 20, strength: 40, touchCount: 3},
			{kind: 'support', price: low, strength: 50, touchCount: 4},
			{kind: 'resistance', price: high, strength: 50, touchCount: 4},
			{kind: 'resistance', price: high + 20, strength: 40, touchCount: 3},
		],
		close,
	);
	const fibPairs = buildKeyLevelFibPairs(menu, close);
	const pair = pickStrongestBracketFibPair(fibPairs);
	assert.ok(pair);
	assert.equal(pair!.closeAboveMid, true);
	assert.equal(pair!.chartFibTrend, 'down');
	const retrace = pair!.retracement618;
	assert.ok(Math.abs(retrace - (pair!.low + (pair!.high - pair!.low) * 0.618)) < 0.02);
	const setup = buildKeyLevelFibRetraceTradeSetup({lastClose: close, levelMenu: menu, fibPairs});
	assert.ok(setup);
	assert.equal(setup!.targetPrice, retrace);
	assert.equal(setup!.displayTrend, 'down');
	assert.equal(setup!.source, 'strongest_bracket');
});

test('applyKeyFibDrawings orients upper-half fib with 0% at low and 100% at high', async () => {
	const bars = syntheticBars(64);
	const menu = buildKeyLevelMenu(
		[
			{kind: 'support', price: 90, strength: 40, touchCount: 3},
			{kind: 'support', price: 100, strength: 50, touchCount: 4},
			{kind: 'resistance', price: 200, strength: 50, touchCount: 4},
			{kind: 'resistance', price: 210, strength: 40, touchCount: 3},
		],
		175,
	);
	const fibPairs = buildKeyLevelFibPairs(menu, 175);
	const pair = pickStrongestBracketFibPair(fibPairs);
	assert.ok(pair);
	const setup = buildKeyLevelFibRetraceTradeSetup({lastClose: 175, levelMenu: menu, fibPairs});
	assert.ok(setup);
	assert.equal(setup.insideSubRegime, 'upper_half');
	const prepared = prepareChart({
		title: 'Upper fib orient',
		bars,
		options: {skipDefaultOverlays: true},
	});
	assert.equal(prepared.ok, true);
	if (!prepared.ok) {
		return;
	}
	const applied = await applyKeyFibDrawings({
		rows: bars,
		prepareReplay: prepared.data.prepareReplay,
		fibPairNumber: pair.pairNumber,
		analysis: {fibPairs, keyLevelFibTradeSetup: setup},
	});
	assert.equal(applied.ok, true);
	if (!applied.ok) {
		return;
	}
	const fibOverlay = (applied.data.prepareReplay.overlays ?? []).find(
		o => o.type === 'fibonacci' && String(o.id ?? '').startsWith('KeyFib #'),
	);
	assert.equal(fibOverlay?.range?.trend, 'down');
	const lastPrice = (s: {data: Array<{value: number}>}) => s.data[s.data.length - 1]!.value;
	const fib0 = applied.data.chart.series.find(s => s.label === 'Fib 0.0%');
	const fib1 = applied.data.chart.series.find(s => s.label === 'Fib 100.0%');
	assert.ok(fib0 && fib1);
	assert.equal(lastPrice(fib0), pair.low);
	assert.equal(lastPrice(fib1), pair.high);
});

test('applyKeyFibDrawings draws 0/0.618/1 overlay and leg levels without 1.618 extension', async () => {
	const bars = syntheticBars(64);
	const analysisResult = await analyzeKeyLevelFibonacci({
		rows: bars,
		title: 'Key fib overlay',
		allowRowsOnly: true,
		mergeLive: false,
		fibKeyLevelMinConfidence: 0.01,
	});
	assert.equal(analysisResult.ok, true);
	if (!analysisResult.ok || analysisResult.data.analysis.levelMenu.length < 1) {
		return;
	}
	const analysis = analysisResult.data.analysis;
	const pair = analysis.primaryFibPair ?? analysis.fibPairs?.[0];
	if (!pair) {
		return;
	}
	assert.equal(analysis.keyLevelFibTradeSetup?.priceRegime, 'inside_range');
	assert.equal(analysis.keyLevelFibTradeSetup?.setupPurposeCode, 'kl-fib');
	assert.notEqual(analysis.keyLevelFibTradeSetup?.targetSource, 'fib_extension');
	const prepared = prepareChart({
		title: 'Key fib overlay',
		bars,
		options: {skipDefaultOverlays: true},
	});
	assert.equal(prepared.ok, true);
	if (!prepared.ok) {
		return;
	}
	const applied = await applyKeyFibDrawings({
		rows: bars,
		prepareReplay: prepared.data.prepareReplay,
		fibPairNumber: pair.pairNumber,
		analysis,
	});
	assert.equal(applied.ok, true);
	if (!applied.ok) {
		return;
	}
	assert.equal(
		applied.data.chart.series.filter(s => s.label?.startsWith('Fib 1.618')).length,
		0,
	);
	const levelSeries = applied.data.chart.series.filter(s => s.label?.startsWith('Level #'));
	assert.equal(levelSeries.length, 2);
	const fibAxisLabels = applied.data.chart.series.filter(
		s => s.label.startsWith('Fib ') && s.lastValueVisible !== false,
	);
	assert.deepEqual(
		fibAxisLabels.map(s => s.label).sort(),
		['Fib 0.0%', 'Fib 100.0%', 'Fib 61.8%'],
	);
});

test('applyKeyLevelDrawings draws next-level target when nearest trade setup matches', async () => {
	const bars = syntheticBars(64);
	const nearest = await analyzeKeyLevels({
		rows: bars,
		title: 'Key target',
		allowRowsOnly: true,
		mergeLive: false,
	});
	assert.equal(nearest.ok, true);
	if (!nearest.ok || nearest.data.analysis.levelMenu.length < 2) {
		return;
	}
	const setup = nearest.data.analysis.keyLevelsTradeSetup;
	if (
		setup?.levelNumber == null ||
		setup.targetSource !== 'next_level' ||
		setup.targetPrice == null
	) {
		return;
	}
	const prepared = prepareChart({
		title: 'Key target',
		bars,
		options: {skipDefaultOverlays: true},
	});
	assert.equal(prepared.ok, true);
	if (!prepared.ok) {
		return;
	}
	const applied = await applyKeyLevelDrawings({
		rows: bars,
		prepareReplay: prepared.data.prepareReplay,
		levelNumber: setup.levelNumber,
		analysis: nearest.data.analysis,
	});
	assert.equal(applied.ok, true);
	if (!applied.ok) {
		return;
	}
	const targetRow = nearest.data.analysis.levelMenu.find(
		m => Math.abs(m.price - setup.targetPrice!) < 1e-6,
	);
	const targetLabel =
		targetRow != null
			? keyLevelMenuDisplayLabel(targetRow.kind, targetRow.levelNumber, targetRow.price, targetRow.swingKind)
			: `Target — ${setup.targetLabel ?? 'target'} @ ${setup.targetPrice!.toFixed(2)}`;
	assert.ok(applied.data.chart.series.some(s => s.label === targetLabel));
});

test('applyKeyFibDrawings draws swing leg Level # horizontals for the pair', async () => {
	const bars = syntheticBars(64);
	const fibResult = await analyzeKeyLevelFibonacci({
		rows: bars,
		title: 'Fib only',
		allowRowsOnly: true,
		mergeLive: false,
		fibKeyLevelMinConfidence: 0.01,
	});
	assert.equal(fibResult.ok, true);
	if (!fibResult.ok || fibResult.data.analysis.fibPairs.length < 1) {
		return;
	}
	const pair = fibResult.data.analysis.fibPairs[0]!;
	const prepared = prepareChart({
		title: 'Fib only',
		bars,
		options: {skipDefaultOverlays: true},
	});
	assert.equal(prepared.ok, true);
	if (!prepared.ok) {
		return;
	}
	const applied = await applyKeyFibDrawings({
		rows: bars,
		prepareReplay: prepared.data.prepareReplay,
		fibPairNumber: pair.pairNumber,
		analysis: {...fibResult.data.analysis, keyLevelFibTradeSetup: undefined},
	});
	assert.equal(applied.ok, true);
	if (!applied.ok) {
		return;
	}
	const levelSeries = applied.data.chart.series.filter(s => s.label?.startsWith('Level #'));
	assert.equal(levelSeries.length, 2);
	assert.ok(applied.data.chart.series.some(s => s.label?.startsWith('Fib ')));

	const removed = await applyKeyFibDrawings({
		rows: bars,
		prepareReplay: applied.data.prepareReplay,
		fibPairNumber: pair.pairNumber,
		analysis: fibResult.data.analysis,
		removeFibPair: true,
	});
	assert.equal(removed.ok, true);
	if (!removed.ok) {
		return;
	}
	assert.equal(removed.data.chart.series.some(s => s.label?.startsWith('Level #')), false);
	assert.equal(removed.data.chart.series.some(s => s.label?.startsWith('Fib ')), false);
});

test('applyKeyLevelDrawings level-only apply does not draw fib overlay', async () => {
	const bars = syntheticBars(64);
	const nearest = await analyzeKeyLevels({
		rows: bars,
		title: 'Key nearest only',
		allowRowsOnly: true,
		mergeLive: false,
	});
	assert.equal(nearest.ok, true);
	if (!nearest.ok || nearest.data.analysis.levelMenu.length < 1) {
		return;
	}
	const fib = await analyzeKeyLevelFibonacci({
		rows: bars,
		allowRowsOnly: true,
		mergeLive: false,
		fibKeyLevelMinConfidence: 0.01,
	});
	assert.equal(fib.ok, true);
	if (!fib.ok) {
		return;
	}
	const prepared = prepareChart({
		title: 'Key nearest only',
		bars,
		options: {skipDefaultOverlays: true},
	});
	assert.equal(prepared.ok, true);
	if (!prepared.ok) {
		return;
	}
	const levelNumber = nearest.data.analysis.levelMenu[0]!.levelNumber;
	const applied = await applyKeyLevelDrawings({
		rows: bars,
		prepareReplay: prepared.data.prepareReplay,
		levelNumber,
		analysis: nearest.data.analysis,
	});
	assert.equal(applied.ok, true);
	if (!applied.ok) {
		return;
	}
	const fibOverlays = (applied.data.prepareReplay.overlays ?? []).filter(o => {
		const id = typeof o === 'object' && o != null && 'id' in o ? String((o as {id?: string}).id ?? '') : '';
		return id.startsWith('KeyFib #');
	});
	assert.equal(fibOverlays.length, 0);
	assert.equal(applied.data.chart.series.some(s => s.label.startsWith('Fib ')), false);
});

test('applyKeyLevelDrawings and applyKeyFibDrawings compose independently', async () => {
	const bars = syntheticBars(64);
	const nearest = await analyzeKeyLevels({
		rows: bars,
		title: 'Key apply',
		allowRowsOnly: true,
		mergeLive: false,
	});
	const fibResult = await analyzeKeyLevelFibonacci({
		rows: bars,
		title: 'Key apply',
		allowRowsOnly: true,
		mergeLive: false,
		fibKeyLevelMinConfidence: 0.01,
	});
	assert.equal(nearest.ok, true);
	assert.equal(fibResult.ok, true);
	if (!nearest.ok || !fibResult.ok || nearest.data.analysis.levelMenu.length < 1) {
		return;
	}
	const analysis = nearest.data.analysis;
	const fibAnalysis = fibResult.data.analysis;
	const prepared = prepareChart({
		title: 'Key apply',
		bars,
		options: {skipDefaultOverlays: true},
	});
	assert.equal(prepared.ok, true);
	if (!prepared.ok) {
		return;
	}
	const levelNumber = nearest.data.analysis.levelMenu[0]!.levelNumber;
	const pair =
		fibResult.data.analysis.fibPairs?.find(
			p => p.lowLevelNumber === levelNumber || p.highLevelNumber === levelNumber,
		) ?? fibResult.data.analysis.fibPairs?.[0];
	const first = await applyKeyLevelDrawings({
		rows: bars,
		prepareReplay: prepared.data.prepareReplay,
		levelNumber,
		analysis,
	});
	assert.equal(first.ok, true);
	if (!first.ok) {
		return;
	}
	const row0 = nearest.data.analysis.levelMenu[0]!;
	const label = keyLevelMenuDisplayLabel(row0.kind, levelNumber, row0.price, row0.swingKind);
	const levelSeries = first.data.chart.series.filter(s => s.label === label);
	assert.equal(levelSeries.length, 1);

	const fibOverlays = (first.data.prepareReplay.overlays ?? []).filter(o => {
		const id = typeof o === 'object' && o != null && 'id' in o ? String((o as {id?: string}).id ?? '') : '';
		return id.startsWith('KeyFib #');
	});
	assert.equal(fibOverlays.length, 0);

	if (pair) {
		const withFib = await applyKeyFibDrawings({
			rows: bars,
			prepareReplay: first.data.prepareReplay,
			fibPairNumber: pair.pairNumber,
			analysis: fibAnalysis,
		});
		assert.equal(withFib.ok, true);
		if (!withFib.ok) {
			return;
		}
		const fibAfterApply = (withFib.data.prepareReplay.overlays ?? []).filter(o => {
			const id = typeof o === 'object' && o != null && 'id' in o ? String((o as {id?: string}).id ?? '') : '';
			return id.startsWith('KeyFib #');
		});
		assert.ok(fibAfterApply.length >= 1);
		const levelAfterFib = withFib.data.chart.series.filter(s => s.label === label);
		assert.equal(levelAfterFib.length, 1);
	}

	const removed = await applyKeyLevelDrawings({
		rows: bars,
		prepareReplay: first.data.prepareReplay,
		levelNumber,
		analysis,
		removeLevel: true,
	});
	assert.equal(removed.ok, true);
	if (!removed.ok) {
		return;
	}
	const afterRemove = removed.data.chart.series.filter(s => s.label === label);
	assert.equal(afterRemove.length, 0);
});

test('applyKeyFibDrawings remove clears fib pair overlay', async () => {
	const close = 1791;
	const menu = buildKeyLevelMenu(
		[
			{kind: 'resistance', price: 1693, strength: 50, touchCount: 4},
			{kind: 'resistance', price: 1850, strength: 40, touchCount: 3},
		],
		close,
	);
	const fibPairs = buildKeyLevelFibPairs(menu, close);
	const primary = pickStrongestBracketFibPair(fibPairs);
	assert.ok(primary);
	const bars = syntheticBars(64);
	const analysis = {fibPairs, keyLevelFibTradeSetup: null};
	const prepared = prepareChart({title: 'primary rm', bars, options: {skipDefaultOverlays: true}});
	const applied = await applyKeyFibDrawings({
		rows: bars,
		prepareReplay: prepared.data.prepareReplay,
		fibPairNumber: primary!.pairNumber,
		analysis,
	});
	assert.equal(applied.ok, true);
	if (!applied.ok) return;
	const fibId = fibPairOverlayId(primary!.lowLevelNumber, primary!.highLevelNumber);
	assert.ok((applied.data.prepareReplay.overlays ?? []).some(o => o.type === 'fibonacci' && o.id === fibId));

	const removed = await applyKeyFibDrawings({
		rows: bars,
		prepareReplay: applied.data.prepareReplay,
		fibPairNumber: primary!.pairNumber,
		analysis,
		removeFibPair: true,
	});
	assert.equal(removed.ok, true);
	if (!removed.ok) return;
	assert.equal(
		(removed.data.prepareReplay.overlays ?? []).some(o => o.type === 'fibonacci' && o.id === fibId),
		false,
	);
	assert.equal(removed.data.chart.series.some(s => String(s.id).startsWith(fibId)), false);
});

test('applyKeyFibDrawings remove clears KeyFib overlay without Level # residue', async () => {
	const bars = syntheticBars(64);
	const fibResult = await analyzeKeyLevelFibonacci({
		rows: bars,
		title: 'Key remove high leg',
		allowRowsOnly: true,
		mergeLive: false,
		fibKeyLevelMinConfidence: 0.01,
	});
	assert.equal(fibResult.ok, true);
	if (!fibResult.ok || fibResult.data.analysis.levelMenu.length < 2) {
		return;
	}
	const prepared = prepareChart({
		title: 'Key remove high leg',
		bars,
		options: {skipDefaultOverlays: true},
	});
	assert.equal(prepared.ok, true);
	if (!prepared.ok) {
		return;
	}
	const low = fibResult.data.analysis.levelMenu[0]!;
	const high = fibResult.data.analysis.levelMenu[1]!;
	const pair =
		fibResult.data.analysis.fibPairs?.find(
			p => p.lowLevelNumber === low.levelNumber && p.highLevelNumber === high.levelNumber,
		) ?? fibResult.data.analysis.primaryFibPair;
	if (!pair) {
		return;
	}
	const applied = await applyKeyFibDrawings({
		rows: bars,
		prepareReplay: prepared.data.prepareReplay,
		fibPairNumber: pair.pairNumber,
		analysis: fibResult.data.analysis,
	});
	assert.equal(applied.ok, true);
	if (!applied.ok) {
		return;
	}
	const fibId = fibPairOverlayId(pair.lowLevelNumber, pair.highLevelNumber);
	assert.ok((applied.data.prepareReplay.overlays ?? []).some(o => o.type === 'fibonacci' && o.id === fibId));

	const removed = await applyKeyFibDrawings({
		rows: bars,
		prepareReplay: applied.data.prepareReplay,
		fibPairNumber: pair.pairNumber,
		analysis: fibResult.data.analysis,
		removeFibPair: true,
	});
	assert.equal(removed.ok, true);
	if (!removed.ok) {
		return;
	}
	assert.equal(
		(removed.data.prepareReplay.overlays ?? []).some(o => o.type === 'fibonacci' && o.id === fibId),
		false,
	);
	assert.equal(
		removed.data.chart.series.some(s => String(s.id).startsWith(fibId)),
		false,
	);
	assert.equal(removed.data.chart.series.some(s => s.label?.startsWith('Level #')), false);
});
