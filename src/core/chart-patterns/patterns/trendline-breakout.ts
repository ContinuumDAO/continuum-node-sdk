import {calculateTrendLinesFromBars, linePriceAt, type TrendLine} from '../../chart/levels/trend-lines.js';
import {
	atrAtBreakout,
	DEFAULT_RETEST_ATR_MULTIPLIER,
	DEFAULT_RETEST_ATR_PERIOD,
	retestBandKind,
	retestToleranceBands,
	type RetestBandKind,
} from '../atr.js';
import {blendConfidence} from '../confidence.js';
import type {ChartPatternHit, ChartPatternId} from '../types.js';
import type {DetectorContext} from './utils.js';
import {barSpanFromIndices, finalizeHit, makePoint} from './utils.js';

export const DEFAULT_RETEST_TOLERANCE_PCT = 0.1;
const MAX_BREAKOUT_LOOKBACK = 30;
const MAX_RETEST_BARS = 25;
const MIN_MOVE_PCT = 0.005;

export type TrendlineBreakoutOptions = {
	retestTolerancePct?: number;
	retestAtrPeriod?: number;
	retestAtrMultiplier?: number;
};

type BreakoutEvent = {
	direction: 'bullish' | 'bearish';
	line: TrendLine;
	breakIndex: number;
	breakPrice: number;
	lineAtBreak: number;
	extremePrice: number;
	move: number;
	retestIndex: number | null;
	retestBand?: RetestBandKind;
};

type RetestConfig = {
	retestTolerancePct: number;
	retestAtrPeriod: number;
	retestAtrMultiplier: number;
};

function linePriceAtBar(line: TrendLine, timeSec: number): number | null {
	return linePriceAt(timeSec, line.pointA, line.pointB);
}

function findBullishBreakout(
	ctx: DetectorContext,
	line: TrendLine,
	config: RetestConfig,
): BreakoutEvent | null {
	const start = Math.max(1, ctx.bars.length - MAX_BREAKOUT_LOOKBACK);
	let breakIndex = -1;
	for (let i = start; i < ctx.bars.length; i++) {
		const prev = ctx.bars[i - 1]!;
		const cur = ctx.bars[i]!;
		const linePrev = linePriceAtBar(line, prev.timeSec);
		const lineCur = linePriceAtBar(line, cur.timeSec);
		if (linePrev == null || lineCur == null) {
			continue;
		}
		if (prev.close <= linePrev && cur.close > lineCur) {
			breakIndex = i;
		}
	}
	if (breakIndex < 0) {
		return null;
	}

	const breakBar = ctx.bars[breakIndex]!;
	const lineAtBreak = linePriceAtBar(line, breakBar.timeSec)!;
	let extremePrice = breakBar.high;
	for (let j = breakIndex; j < ctx.bars.length; j++) {
		extremePrice = Math.max(extremePrice, ctx.bars[j]!.high);
	}
	const move = extremePrice - breakBar.close;
	if (move / Math.max(breakBar.close, 1e-8) < MIN_MOVE_PCT) {
		return null;
	}

	const breakAtr = atrAtBreakout(ctx.bars, breakIndex, config.retestAtrPeriod);

	let retestIndex: number | null = null;
	let retestBand: RetestBandKind | undefined;
	for (let j = breakIndex + 1; j < ctx.bars.length && j <= breakIndex + MAX_RETEST_BARS; j++) {
		const bar = ctx.bars[j]!;
		const lineAt = linePriceAtBar(line, bar.timeSec);
		if (lineAt == null) {
			continue;
		}
		const barAtr = atrAtBreakout(ctx.bars, j, config.retestAtrPeriod) ?? breakAtr;
		const bands = retestToleranceBands(
			move,
			config.retestTolerancePct,
			barAtr,
			config.retestAtrMultiplier,
		);
		const touchDistance = Math.abs(bar.low - lineAt);
		if (touchDistance <= bands.combined && bar.close > lineAt) {
			retestIndex = j;
			retestBand = retestBandKind(touchDistance, bands);
			break;
		}
	}

	return {
		direction: 'bullish',
		line,
		breakIndex,
		breakPrice: breakBar.close,
		lineAtBreak,
		extremePrice,
		move,
		retestIndex,
		retestBand,
	};
}

function findBearishBreakout(
	ctx: DetectorContext,
	line: TrendLine,
	config: RetestConfig,
): BreakoutEvent | null {
	const start = Math.max(1, ctx.bars.length - MAX_BREAKOUT_LOOKBACK);
	let breakIndex = -1;
	for (let i = start; i < ctx.bars.length; i++) {
		const prev = ctx.bars[i - 1]!;
		const cur = ctx.bars[i]!;
		const linePrev = linePriceAtBar(line, prev.timeSec);
		const lineCur = linePriceAtBar(line, cur.timeSec);
		if (linePrev == null || lineCur == null) {
			continue;
		}
		if (prev.close >= linePrev && cur.close < lineCur) {
			breakIndex = i;
		}
	}
	if (breakIndex < 0) {
		return null;
	}

	const breakBar = ctx.bars[breakIndex]!;
	const lineAtBreak = linePriceAtBar(line, breakBar.timeSec)!;
	let extremePrice = breakBar.low;
	for (let j = breakIndex; j < ctx.bars.length; j++) {
		extremePrice = Math.min(extremePrice, ctx.bars[j]!.low);
	}
	const move = breakBar.close - extremePrice;
	if (move / Math.max(breakBar.close, 1e-8) < MIN_MOVE_PCT) {
		return null;
	}

	const breakAtr = atrAtBreakout(ctx.bars, breakIndex, config.retestAtrPeriod);

	let retestIndex: number | null = null;
	let retestBand: RetestBandKind | undefined;
	for (let j = breakIndex + 1; j < ctx.bars.length && j <= breakIndex + MAX_RETEST_BARS; j++) {
		const bar = ctx.bars[j]!;
		const lineAt = linePriceAtBar(line, bar.timeSec);
		if (lineAt == null) {
			continue;
		}
		const barAtr = atrAtBreakout(ctx.bars, j, config.retestAtrPeriod) ?? breakAtr;
		const bands = retestToleranceBands(
			move,
			config.retestTolerancePct,
			barAtr,
			config.retestAtrMultiplier,
		);
		const touchDistance = Math.abs(bar.high - lineAt);
		if (touchDistance <= bands.combined && bar.close < lineAt) {
			retestIndex = j;
			retestBand = retestBandKind(touchDistance, bands);
			break;
		}
	}

	return {
		direction: 'bearish',
		line,
		breakIndex,
		breakPrice: breakBar.close,
		lineAtBreak,
		extremePrice,
		move,
		retestIndex,
		retestBand,
	};
}

function retestBandLabel(kind: RetestBandKind | undefined): string {
	switch (kind) {
		case 'atr':
			return 'ATR band';
		case 'combined':
			return 'excursion and ATR bands';
		case 'excursion_pct':
		default:
			return 'excursion band';
	}
}

function eventToHit(
	event: BreakoutEvent,
	ctx: DetectorContext,
	withRetest: boolean,
	config: RetestConfig,
): ChartPatternHit {
	const isBull = event.direction === 'bullish';
	const id: ChartPatternId = isBull
		? withRetest
			? 'trendline_breakout_retest_bullish'
			: 'trendline_breakout_bullish'
		: withRetest
			? 'trendline_breakout_retest_bearish'
			: 'trendline_breakout_bearish';

	const breakBar = ctx.bars[event.breakIndex]!;
	const toIndex = withRetest && event.retestIndex != null ? event.retestIndex : ctx.bars.length - 1;
	const retestBar = event.retestIndex != null ? ctx.bars[event.retestIndex]! : null;

	const lineStart = ctx.bars.find(b => b.timeSec === event.line.pointA.time) ?? breakBar;
	const lineEnd = ctx.bars.find(b => b.timeSec === event.line.pointB.time) ?? ctx.bars.at(-1)!;

	const confidence = blendConfidence(
		Math.min(1, event.line.touchCount / 4),
		Math.min(1, event.move / Math.max(event.breakPrice * 0.02, 1e-8)),
		withRetest ? 0.85 : 0.65,
	);

	const retestPctLabel = (config.retestTolerancePct * 100).toFixed(0);
	const breakAtr = atrAtBreakout(ctx.bars, event.breakIndex, config.retestAtrPeriod);
	const bands = retestToleranceBands(
		event.move,
		config.retestTolerancePct,
		breakAtr,
		config.retestAtrMultiplier,
	);

	return finalizeHit(
		{
			id,
			name: isBull
				? withRetest
					? 'Trendline Breakout Retest (Bullish)'
					: 'Trendline Breakout (Bullish)'
				: withRetest
					? 'Trendline Breakout Retest (Bearish)'
					: 'Trendline Breakout (Bearish)',
			variant: withRetest
				? `retest_${retestPctLabel}pct_atr${config.retestAtrMultiplier}x`
				: undefined,
			category: 'continuation',
			direction: isBull ? 'bullish' : 'bearish',
			confidence,
			completionState: withRetest ? 'completed' : 'forming',
			barSpan: barSpanFromIndices(ctx.bars, event.breakIndex, toIndex),
			points: [
				makePoint(breakBar, event.breakPrice, 'BO', 'breakout'),
				makePoint(lineStart, event.line.pointA.price, 'L1', 'line_anchor'),
				makePoint(lineEnd, event.line.pointB.price, 'L2', 'line_anchor'),
				makePoint(
					ctx.bars[toIndex]!,
					event.extremePrice,
					isBull ? 'Hi' : 'Lo',
					'excursion',
				),
				...(retestBar
					? [makePoint(retestBar, isBull ? retestBar.low : retestBar.high, 'RT', 'retest')]
					: []),
			],
			lines: [
				{
					pointA: {timeSec: event.line.pointA.time, price: event.line.pointA.price, label: 'L1'},
					pointB: {timeSec: event.line.pointB.time, price: event.line.pointB.price, label: 'L2'},
					label: isBull ? 'Broken resistance' : 'Broken support',
					kind: isBull ? 'resistance' : 'support',
				},
			],
			levels: [{price: event.lineAtBreak, label: 'Break level', kind: 'level'}],
			description: isBull
				? withRetest
					? `Bullish trendline breakout at ${event.breakPrice.toFixed(2)} with retest via ${retestBandLabel(event.retestBand)} (max of ${retestPctLabel}% excursion=${bands.excursionBand.toFixed(2)} or ${config.retestAtrMultiplier}×ATR=${bands.atrBand.toFixed(2)}).`
					: `Bullish trendline breakout at ${event.breakPrice.toFixed(2)}; post-break high ${event.extremePrice.toFixed(2)} (move ${event.move.toFixed(2)}). Retest band uses max(${retestPctLabel}% excursion, ${config.retestAtrMultiplier}×ATR).`
				: withRetest
					? `Bearish trendline breakdown at ${event.breakPrice.toFixed(2)} with retest via ${retestBandLabel(event.retestBand)} (max of ${retestPctLabel}% excursion=${bands.excursionBand.toFixed(2)} or ${config.retestAtrMultiplier}×ATR=${bands.atrBand.toFixed(2)}).`
					: `Bearish trendline breakdown at ${event.breakPrice.toFixed(2)}; post-break low ${event.extremePrice.toFixed(2)} (move ${event.move.toFixed(2)}). Retest band uses max(${retestPctLabel}% excursion, ${config.retestAtrMultiplier}×ATR).`,
		},
		ctx.lastClose,
	);
}

export function detectTrendlineBreakouts(
	ctx: DetectorContext,
	rawBars: Record<string, unknown>[],
	options: TrendlineBreakoutOptions = {},
): ChartPatternHit[] {
	const config: RetestConfig = {
		retestTolerancePct: options.retestTolerancePct ?? DEFAULT_RETEST_TOLERANCE_PCT,
		retestAtrPeriod: options.retestAtrPeriod ?? DEFAULT_RETEST_ATR_PERIOD,
		retestAtrMultiplier: options.retestAtrMultiplier ?? DEFAULT_RETEST_ATR_MULTIPLIER,
	};

	const resistance = calculateTrendLinesFromBars(rawBars, {
		kindFilter: 'resistance',
		maxLines: 3,
		minTouches: 2,
	});
	const support = calculateTrendLinesFromBars(rawBars, {
		kindFilter: 'support',
		maxLines: 3,
		minTouches: 2,
	});
	if (!resistance.length && !support.length) {
		return [];
	}

	const hits: ChartPatternHit[] = [];
	const resistanceSorted = [...resistance].sort((a, b) => b.score - a.score);
	const supportSorted = [...support].sort((a, b) => b.score - a.score);

	const bullEvents = resistanceSorted
		.map(l => findBullishBreakout(ctx, l, config))
		.filter((e): e is BreakoutEvent => e != null)
		.sort((a, b) => b.breakIndex - a.breakIndex);
	const bearEvents = supportSorted
		.map(l => findBearishBreakout(ctx, l, config))
		.filter((e): e is BreakoutEvent => e != null)
		.sort((a, b) => b.breakIndex - a.breakIndex);

	const bullEvent = bullEvents[0] ?? null;
	const bearEvent = bearEvents[0] ?? null;

	if (bullEvent) {
		hits.push(eventToHit(bullEvent, ctx, bullEvent.retestIndex != null, config));
	}
	if (bearEvent) {
		hits.push(eventToHit(bearEvent, ctx, bearEvent.retestIndex != null, config));
	}

	return hits.filter(h => h.barSpan.toIndex >= ctx.focusFromIndex);
}
