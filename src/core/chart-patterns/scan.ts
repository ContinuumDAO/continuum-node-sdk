import {
	CHART_PATTERN_CATALOG,
	filterChartPatternIds,
	getChartPatternCatalogEntry,
} from './catalog.js';
import {DEFAULT_MIN_CONFIDENCE} from './confidence.js';
import {lastCloseFromBars} from './interpretation.js';
import {detectChannels} from './patterns/channel.js';
import {detectCupAndHandle} from './patterns/cup-and-handle.js';
import {detectDoubles} from './patterns/doubles.js';
import {detectFlags} from './patterns/flag.js';
import {detectHeadAndShoulders} from './patterns/head-and-shoulders.js';
import {detectInverseHeadAndShoulders} from './patterns/inverse-head-and-shoulders.js';
import {detectPennants} from './patterns/pennant.js';
import {detectTrendlineBreakouts} from './patterns/trendline-breakout.js';
import {detectTriangles} from './patterns/triangles.js';
import {detectWedges} from './patterns/wedge.js';
import type {DetectorContext} from './patterns/utils.js';
import {buildChartPatternAnalysis} from './recommendation.js';
import {enrichChartPatternHits} from './pattern-enrich.js';
import {
	barsToRawRows,
	DEFAULT_SMOOTH_HEAD_SHOULDERS,
	DEFAULT_SMOOTH_WINDOW,
	smoothBarsForHeadShoulders,
} from './smoothing.js';
import {
	detectOrderedSwings,
	normalizeBarsFromRows,
	swingHighs,
	swingLows,
} from './swings.js';
import type {ChartPatternAnalysis, ChartPatternHit, ChartPatternId, OrderedSwing, ScanChartPatternsOptions} from './types.js';

type HsSwings = {highs: OrderedSwing[]; lows: OrderedSwing[]};

function focusFromIndex(barCount: number, focusWindow: 'last' | number | undefined): number {
	if (focusWindow === undefined || focusWindow === 'last') {
		return Math.max(0, barCount - 15);
	}
	return Math.max(0, Math.min(barCount - 1, focusWindow));
}

function buildDetectors(
	ctx: DetectorContext,
	rawBars: Record<string, unknown>[],
	options: ScanChartPatternsOptions,
	hsSwings: HsSwings,
): Partial<Record<ChartPatternId, () => ChartPatternHit[]>> {
	return {
		head_and_shoulders: () => {
			const hit = detectHeadAndShoulders(ctx, hsSwings.highs);
			return hit ? [hit] : [];
		},
		inverse_head_and_shoulders: () => {
			const hit = detectInverseHeadAndShoulders(ctx, hsSwings.lows);
			return hit ? [hit] : [];
		},
		double_top: () => detectDoubles(ctx).filter(h => h.id === 'double_top'),
		double_bottom: () => detectDoubles(ctx).filter(h => h.id === 'double_bottom'),
		double_bottom_adam_eve: () => detectDoubles(ctx).filter(h => h.id === 'double_bottom_adam_eve'),
		ascending_triangle: () => detectTriangles(ctx).filter(h => h.id === 'ascending_triangle'),
		descending_triangle: () => detectTriangles(ctx).filter(h => h.id === 'descending_triangle'),
		symmetrical_triangle: () => detectTriangles(ctx).filter(h => h.id === 'symmetrical_triangle'),
		pennant_bullish: () => detectPennants(ctx).filter(h => h.id === 'pennant_bullish'),
		pennant_bearish: () => detectPennants(ctx).filter(h => h.id === 'pennant_bearish'),
		flag_bullish: () => detectFlags(ctx).filter(h => h.id === 'flag_bullish'),
		flag_bearish: () => detectFlags(ctx).filter(h => h.id === 'flag_bearish'),
		rising_wedge: () => detectWedges(ctx).filter(h => h.id === 'rising_wedge'),
		falling_wedge: () => detectWedges(ctx).filter(h => h.id === 'falling_wedge'),
		channel_up: () => detectChannels(ctx, rawBars).filter(h => h.id === 'channel_up'),
		channel_down: () => detectChannels(ctx, rawBars).filter(h => h.id === 'channel_down'),
		cup_and_handle: () => {
			const hit = detectCupAndHandle(ctx);
			return hit ? [hit] : [];
		},
		trendline_breakout_bullish: () =>
			detectTrendlineBreakouts(ctx, rawBars, options).filter(h => h.id === 'trendline_breakout_bullish'),
		trendline_breakout_bearish: () =>
			detectTrendlineBreakouts(ctx, rawBars, options).filter(h => h.id === 'trendline_breakout_bearish'),
		trendline_breakout_retest_bullish: () =>
			detectTrendlineBreakouts(ctx, rawBars, options).filter(
				h => h.id === 'trendline_breakout_retest_bullish',
			),
		trendline_breakout_retest_bearish: () =>
			detectTrendlineBreakouts(ctx, rawBars, options).filter(
				h => h.id === 'trendline_breakout_retest_bearish',
			),
	};
}

export function scanChartPatterns(
	rawBars: Record<string, unknown>[],
	options: ScanChartPatternsOptions = {},
): ChartPatternHit[] {
	const bars = normalizeBarsFromRows(rawBars);
	if (!bars.length) {
		return [];
	}

	const patternIds = filterChartPatternIds(options.patternIds as string[] | undefined) ??
		CHART_PATTERN_CATALOG.map(e => e.id);
	const swingLookback = Math.max(2, Math.min(options.swingLookback ?? 3, Math.floor(bars.length / 10)));
	const swings = detectOrderedSwings(rawBars, swingLookback);
	const ctx: DetectorContext = {
		bars,
		swings,
		highs: swingHighs(swings),
		lows: swingLows(swings),
		lastClose: lastCloseFromBars(bars),
		focusFromIndex: focusFromIndex(bars.length, options.focusWindow),
	};

	const smoothHeadShoulders = options.smoothHeadShoulders ?? DEFAULT_SMOOTH_HEAD_SHOULDERS;
	let hsSwings = {highs: ctx.highs, lows: ctx.lows};
	if (smoothHeadShoulders) {
		const window = options.smoothWindow ?? DEFAULT_SMOOTH_WINDOW;
		const smoothedBars = smoothBarsForHeadShoulders(bars, window);
		const smoothedSwings = detectOrderedSwings(barsToRawRows(smoothedBars), swingLookback);
		hsSwings = {
			highs: swingHighs(smoothedSwings),
			lows: swingLows(smoothedSwings),
		};
	}

	const detectors = buildDetectors(ctx, rawBars, options, hsSwings);
	const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
	const hits: ChartPatternHit[] = [];
	const seen = new Set<string>();

	for (const id of patternIds) {
		const entry = getChartPatternCatalogEntry(id);
		if (entry && bars.length < entry.minBars) {
			continue;
		}
		const detect = detectors[id];
		if (!detect) {
			continue;
		}
		for (const hit of detect()) {
			if (hit.confidence < minConfidence) {
				continue;
			}
			const key = `${hit.id}:${hit.barSpan.fromIndex}:${hit.barSpan.toIndex}`;
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			hits.push(hit);
		}
	}

	return hits.sort((a, b) => b.barSpan.toIndex - a.barSpan.toIndex || b.confidence - a.confidence);
}

export function analyzeChartPatternsFromBars(
	rawBars: Record<string, unknown>[],
	options: ScanChartPatternsOptions = {},
): ChartPatternAnalysis {
	const bars = normalizeBarsFromRows(rawBars);
	const patternIds = filterChartPatternIds(options.patternIds as string[] | undefined);
	const hits = scanChartPatterns(rawBars, options);
	const enriched = enrichChartPatternHits(hits, bars, rawBars);
	return buildChartPatternAnalysis(
		enriched,
		bars.length,
		patternIds?.length ?? CHART_PATTERN_CATALOG.length,
		lastCloseFromBars(bars),
		{minConfidence: options.minConfidence},
	);
}

export {maxChartPatternMinBars, chartPatternsScannedCount, filterChartPatternIds} from './catalog.js';
