import assert from 'node:assert/strict';
import test from 'node:test';
import {analyzeKeyLevels, analyzeKeyLevelFibonacci} from '../dist/core/chart/analysis/analyze-tools.js';
import {applyKeyLevelDrawings} from '../dist/core/chart/analysis/key-level-drawings-tools.js';
import {
	buildKeyLevelFibPairs,
	buildKeyLevelMenu,
	fibExtensionLineLabel,
	fibPairOverlayId,
	keyLevelMenuDisplayLabel,
	pickKeyLevelByNumber,
	resolveFibExtensionTargetLine,
} from '../dist/core/chart/analysis/key-level-menu-summary.js';
import {detectKeyLevelBreaks} from '../dist/core/chart/analysis/key-level-break-detect.js';
import {buildKeyLevelFibRetraceTradeSetup} from '../dist/core/chart/analysis/trade-setups/key-level-fib-retrace-trade-setup.js';
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
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	const analysis = result.data.analysis;
	assert.ok(Array.isArray(analysis.levelMenu));
	assert.ok(Array.isArray(analysis.fibPairs));
	assert.ok(typeof analysis.summary === 'string');
	assert.match(analysis.interpretation, /0\.618|Fib/i);
});

test('buildKeyLevelMenu and fib pairs', () => {
	const menu = buildKeyLevelMenu(
		[
			{kind: 'support', price: 95, strength: 4, touchCount: 3},
			{kind: 'resistance', price: 110, strength: 3, touchCount: 2},
			{kind: 'support', price: 88, strength: 2, touchCount: 1},
		],
		100,
	);
	assert.equal(menu.length, 3);
	assert.equal(menu[0]!.levelNumber, 1);
	assert.equal(menu[0]!.isPrimary, true);
	assert.equal(menu.filter(row => row.isNearestSupport).length, 1);
	assert.equal(keyLevelMenuDisplayLabel('support', 1, 95), 'Level #1 Support @ 95.00');
	assert.equal(pickKeyLevelByNumber(menu, 2)?.price, 110);

	const pairs = buildKeyLevelFibPairs(menu, 100, 1);
	assert.ok(pairs.length >= 1);
	const primary = pairs.find(p => p.pairKind === 'primary_range');
	assert.ok(primary);
	assert.equal(primary!.lowLevelNumber, 1);
	assert.equal(primary!.highLevelNumber, 2);
	assert.equal(primary!.isPrimaryTradePair, true);
	assert.ok(pairs.some(p => p.pairKind === 'concentric'));
	assert.ok(pairs[0]!.retracement618 > pairs[0]!.low);
	assert.equal(fibPairOverlayId(1, 2), 'KeyFib #1-#2');
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

test('buildKeyLevelFibRetraceTradeSetup uses 1.618 extension above range', () => {
	const menu = buildKeyLevelMenu(
		[
			{kind: 'support', price: 100, strength: 5, touchCount: 4},
			{kind: 'resistance', price: 110, strength: 4, touchCount: 3},
		],
		115,
	);
	const fibPairs = buildKeyLevelFibPairs(menu, 115, 1);
	const setup = buildKeyLevelFibRetraceTradeSetup({
		lastClose: 115,
		levelMenu: menu,
		fibPairs,
		bars: syntheticBars(48),
	});
	assert.ok(setup);
	assert.equal(setup!.priceRegime, 'above_range');
	assert.equal(setup!.side, 'long');
	assert.equal(setup!.targetSource, 'fib_extension');
	assert.equal(setup!.targetPrice, fibPairs[0]!.extension1618Up);
	assert.equal(setup!.setupPurposeCode, 'kl-fib-ext');
	assert.equal(setup!.displayTrend, 'up');
});

test('buildKeyLevelFibRetraceTradeSetup uses reversed 1.618 extension below range (short)', () => {
	const menu = buildKeyLevelMenu(
		[
			{kind: 'support', price: 100, strength: 5, touchCount: 4},
			{kind: 'resistance', price: 110, strength: 4, touchCount: 3},
		],
		95,
	);
	const fibPairs = buildKeyLevelFibPairs(menu, 95, 1);
	const setup = buildKeyLevelFibRetraceTradeSetup({
		lastClose: 95,
		levelMenu: menu,
		fibPairs,
		bars: syntheticBars(48),
	});
	assert.ok(setup);
	assert.equal(setup!.priceRegime, 'below_range');
	assert.equal(setup!.side, 'short');
	assert.equal(setup!.targetSource, 'fib_extension');
	assert.equal(setup!.targetPrice, fibPairs[0]!.extension1618Down);
	assert.equal(setup!.setupPurposeCode, 'kl-fib-ext');
	assert.equal(setup!.displayTrend, 'down');
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
	const fibPairs = buildKeyLevelFibPairs(menu, 100, menu[0]!.levelNumber);
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

test('resolveFibExtensionTargetLine when setup uses fib_extension target', () => {
	const pair = {
		pairNumber: 1,
		pairKind: 'primary_range' as const,
		lowLevelNumber: 1,
		highLevelNumber: 2,
		low: 95,
		high: 110,
		trend: 'up' as const,
		retracement618: 104.27,
		extension1618Up: 119.29,
		extension1618Down: 85.71,
		isPrimaryTradePair: true,
	};
	assert.equal(fibExtensionLineLabel(1, 2), 'Fib 1.618 ext #1-#2');
	assert.deepEqual(
		resolveFibExtensionTargetLine(
			{targetSource: 'fib_extension', targetPrice: 119.29, fibPairNumber: 1},
			pair,
		),
		{price: 119.29, label: 'Fib 1.618 ext #1-#2'},
	);
	assert.equal(resolveFibExtensionTargetLine({targetSource: 'next_level', targetPrice: 110}, pair), null);
	assert.deepEqual(
		resolveFibExtensionTargetLine(
			{
				targetSource: 'next_level',
				breakRetestAlternative: {
					targetSource: 'fib_extension',
					targetPrice: 85.71,
					fibPairNumber: 1,
				},
			},
			pair,
		),
		{price: 85.71, label: 'Fib 1.618 ext #1-#2'},
	);
});

test('applyKeyLevelDrawings draws fib 1.618 extension when trade setup targets it', async () => {
	const bars = syntheticBars(64);
	const analysisResult = await analyzeKeyLevelFibonacci({
		rows: bars,
		title: 'Key ext',
		allowRowsOnly: true,
		mergeLive: false,
	});
	assert.equal(analysisResult.ok, true);
	if (!analysisResult.ok || analysisResult.data.analysis.levelMenu.length < 1) {
		return;
	}
	const analysis = {...analysisResult.data.analysis};
	const pair = analysis.primaryFibPair ?? analysis.fibPairs?.[0];
	if (!pair) {
		return;
	}
	analysis.keyLevelFibTradeSetup = {
		...(analysis.keyLevelFibTradeSetup ?? {}),
		targetSource: 'fib_extension',
		targetPrice: pair.extension1618Up,
		fibPairNumber: pair.pairNumber,
	};
	const prepared = prepareChart({
		title: 'Key ext',
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
		fibPairNumber: pair.pairNumber,
		analysis,
	});
	assert.equal(applied.ok, true);
	if (!applied.ok) {
		return;
	}
	const extLabel = fibExtensionLineLabel(pair.lowLevelNumber, pair.highLevelNumber);
	const extSeries = applied.data.chart.series.filter(s => s.label === extLabel);
	assert.equal(extSeries.length, 1);
	assert.equal(extSeries[0]!.lastValueVisible, true);
	const lowEntry = analysis.levelMenu.find(e => e.levelNumber === pair.lowLevelNumber)!;
	const highEntry = analysis.levelMenu.find(e => e.levelNumber === pair.highLevelNumber)!;
	const lowLabel = keyLevelMenuDisplayLabel(lowEntry.kind, pair.lowLevelNumber, lowEntry.price, lowEntry.swingKind);
	const highLabel = keyLevelMenuDisplayLabel(highEntry.kind, pair.highLevelNumber, highEntry.price, highEntry.swingKind);
	const levelSeries = applied.data.chart.series.filter(s => s.label === lowLabel || s.label === highLabel);
	assert.ok(levelSeries.length >= 2);
	for (const s of levelSeries) {
		assert.equal(s.lastValueVisible, false);
	}
	const fibAxisLabels = applied.data.chart.series.filter(
		s => s.label.startsWith('Fib ') && s.lastValueVisible !== false,
	);
	assert.deepEqual(
		fibAxisLabels.map(s => s.label).sort(),
		['Fib 0.0%', 'Fib 100.0%', 'Fib 61.8%', extLabel].sort(),
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
		analysis: {...nearest.data.analysis, ...fib.data.analysis},
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

test('applyKeyLevelDrawings merges level and fib overlays incrementally', async () => {
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
	});
	assert.equal(nearest.ok, true);
	assert.equal(fibResult.ok, true);
	if (!nearest.ok || !fibResult.ok || nearest.data.analysis.levelMenu.length < 1) {
		return;
	}
	const analysis = {...nearest.data.analysis, ...fibResult.data.analysis};
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
		fibResult.data.analysis.fibPairs?.find(p => p.lowLevelNumber === levelNumber || p.highLevelNumber === levelNumber) ??
		fibResult.data.analysis.fibPairs?.[0];
	const tradeSetup = fibResult.data.analysis.keyLevelFibTradeSetup;
	const extensionLine =
		pair && tradeSetup?.targetSource === 'fib_extension'
			? resolveFibExtensionTargetLine(tradeSetup, pair)
			: null;
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
	if (extensionLine) {
		const extSeries = first.data.chart.series.filter(s => s.label === extensionLine.label);
		assert.equal(extSeries.length, 0);
	}

	const fibOverlays = (first.data.prepareReplay.overlays ?? []).filter(o => {
		const id = typeof o === 'object' && o != null && 'id' in o ? String((o as {id?: string}).id ?? '') : '';
		return id.startsWith('KeyFib #');
	});
	assert.equal(fibOverlays.length, 0);

	if (pair) {
		const withFib = await applyKeyLevelDrawings({
			rows: bars,
			prepareReplay: first.data.prepareReplay,
			fibPairNumber: pair.pairNumber,
			analysis,
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

test('applyKeyLevelDrawings remove clears fib pair when applied via fibPairNumber', async () => {
	const close = 1791;
	const menu = buildKeyLevelMenu(
		[
			{kind: 'resistance', price: 1693, strength: 5, touchCount: 4},
			{kind: 'resistance', price: 1850, strength: 4, touchCount: 3},
		],
		close,
	);
	const fibPairs = buildKeyLevelFibPairs(menu, close, 1);
	const primary = fibPairs.find(p => p.pairKind === 'primary_range');
	assert.ok(primary);
	const bars = syntheticBars(64);
	const analysis = {levelMenu: menu, fibPairs, primaryFibPair: primary, keyLevelFibTradeSetup: null};
	const prepared = prepareChart({title: 'primary rm', bars, options: {skipDefaultOverlays: true}});
	const applied = await applyKeyLevelDrawings({
		rows: bars,
		prepareReplay: prepared.data.prepareReplay,
		fibPairNumber: primary!.pairNumber,
		analysis,
	});
	assert.equal(applied.ok, true);
	if (!applied.ok) return;
	const fibId = fibPairOverlayId(primary!.lowLevelNumber, primary!.highLevelNumber);
	assert.ok((applied.data.prepareReplay.overlays ?? []).some(o => o.type === 'fibonacci' && o.id === fibId));

	const removed = await applyKeyLevelDrawings({
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

test('applyKeyLevelDrawings remove clears KeyFib when level is the high leg (#4-#1, remove #1)', async () => {
	const bars = syntheticBars(64);
	const fibResult = await analyzeKeyLevelFibonacci({
		rows: bars,
		title: 'Key remove high leg',
		allowRowsOnly: true,
		mergeLive: false,
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
	const applied = await applyKeyLevelDrawings({
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

	const removed = await applyKeyLevelDrawings({
		rows: bars,
		prepareReplay: applied.data.prepareReplay,
		levelNumber: pair.highLevelNumber,
		analysis: fibResult.data.analysis,
		removeLevel: true,
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
});
