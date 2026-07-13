import type {TrendLine, TrendLinePoint} from '../levels/trend-lines.js';
import {linePriceAt} from '../levels/trend-lines.js';
import {parseChartTimeFromRow} from '../point-normalize.js';

export type TrendLineBarSpanSummary = {
	fromTimeSec: number;
	toTimeSec: number;
	barCount: number;
	fromBarIndex: number;
	toBarIndex: number;
};

export type TrendLineAnchorSummary = {
	timeSec: number;
	price: number;
};

export type TrendLineMenuEntry = {
	index: number;
	trendLineNumber: number;
	kind: 'support' | 'resistance';
	score: number;
	touchCount: number;
	isPrimary: boolean;
	barSpan: TrendLineBarSpanSummary;
	anchors: {
		pointA: TrendLineAnchorSummary;
		pointB: TrendLineAnchorSummary;
	};
};

function barTimeSec(row: Record<string, unknown>): number | null {
	const time = parseChartTimeFromRow(row);
	if (time == null) {
		return null;
	}
	if (typeof time === 'number') {
		return time;
	}
	return Math.floor(Date.UTC(time.year, time.month - 1, time.day) / 1000);
}

function barIndexForTimeSec(bars: Record<string, unknown>[], timeSec: number): number | null {
	let bestIdx: number | null = null;
	let bestDelta = Number.POSITIVE_INFINITY;
	for (let i = 0; i < bars.length; i++) {
		const t = barTimeSec(bars[i]!);
		if (t == null) {
			continue;
		}
		const delta = Math.abs(t - timeSec);
		if (delta < bestDelta) {
			bestDelta = delta;
			bestIdx = i;
		}
	}
	return bestIdx;
}

export function barSpanFromTrendLinePoints(
	bars: Record<string, unknown>[],
	pointA: TrendLinePoint,
	pointB: TrendLinePoint,
): TrendLineBarSpanSummary {
	const fromTimeSec = Math.min(pointA.time, pointB.time);
	const toTimeSec = Math.max(pointA.time, pointB.time);
	const fromBarIndex = barIndexForTimeSec(bars, pointA.time) ?? 0;
	const toBarIndex = barIndexForTimeSec(bars, pointB.time) ?? fromBarIndex;
	return {
		fromTimeSec,
		toTimeSec,
		fromBarIndex: Math.min(fromBarIndex, toBarIndex),
		toBarIndex: Math.max(fromBarIndex, toBarIndex),
		barCount: Math.max(1, Math.abs(toBarIndex - fromBarIndex) + 1),
	};
}

export function trendLineMenuLabel(line: TrendLine, trendLineNumber: number): string {
	const kind = line.kind === 'support' ? 'Support' : 'Resistance';
	return `Trend #${trendLineNumber} ${kind}`;
}

export function buildTrendLineMenu(
	lines: TrendLine[],
	bars: Record<string, unknown>[],
): TrendLineMenuEntry[] {
	if (!lines.length) {
		return [];
	}
	const primaryScore = lines[0]?.score ?? 0;
	return lines.map((line, index) => ({
		index,
		trendLineNumber: index + 1,
		kind: line.kind,
		score: line.score,
		touchCount: line.touchCount,
		isPrimary: index === 0 || Math.abs(line.score - primaryScore) < 1e-9,
		barSpan: barSpanFromTrendLinePoints(bars, line.pointA, line.pointB),
		anchors: {
			pointA: {timeSec: line.pointA.time, price: line.pointA.price},
			pointB: {timeSec: line.pointB.time, price: line.pointB.price},
		},
	}));
}

export function pickTrendLineByNumber(
	lines: TrendLine[],
	trendLineNumber: number,
): TrendLine | undefined {
	if (trendLineNumber < 1 || trendLineNumber > lines.length) {
		return undefined;
	}
	return lines[trendLineNumber - 1];
}

export type TrendLineTradePick = {
	line: TrendLine | null;
	/** 1-based trendLineMenu number when a bias-aligned line exists. */
	trendLineNumber: number | null;
};

/** Trade setup uses an explicit trendLineMenu # (operator or apply_trend_line_drawings). */
export function trendLineForTradeSetupByNumber(
	lines: TrendLine[],
	trendLineNumber?: number | null,
): TrendLineTradePick {
	if (trendLineNumber == null || !Number.isFinite(trendLineNumber) || trendLineNumber < 1) {
		return {line: null, trendLineNumber: null};
	}
	const n = Math.trunc(trendLineNumber);
	const line = pickTrendLineByNumber(lines, n) ?? null;
	return {line, trendLineNumber: line ? n : null};
}

type TrendRetestCandidate = {
	line: TrendLine;
	index: number;
	priceAtLast: number;
	gap: number;
};

/** Whether projected line price is a valid limit-retest level for bias (OHLCV-only, no chart draw). */
export function trendLineValidForRetestTrade(
	bias: 'bullish' | 'bearish',
	line: TrendLine,
	priceAtLast: number,
	lastClose: number,
): boolean {
	if (!Number.isFinite(priceAtLast) || !Number.isFinite(lastClose) || lastClose <= 0) {
		return false;
	}
	const eps = Math.max(Math.abs(lastClose) * 0.001, 1e-8);
	if (bias === 'bearish') {
		// Short limit waits for a rally into the line — retest must sit above spot.
		if (priceAtLast <= lastClose + eps) {
			return false;
		}
		return line.kind === 'resistance' || line.kind === 'support';
	}
	// Long limit waits for a dip into support — line at or slightly above spot (touch tolerance).
	if (line.kind !== 'support') {
		return false;
	}
	return priceAtLast <= lastClose + eps;
}

function collectTrendRetestCandidates(
	bias: 'bullish' | 'bearish',
	lines: TrendLine[],
	bars: Record<string, unknown>[],
	lastClose: number,
): TrendRetestCandidate[] {
	const out: TrendRetestCandidate[] = [];
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index]!;
		const priceAtLast = trendLinePriceAtLastBar(line, bars);
		if (priceAtLast == null || !trendLineValidForRetestTrade(bias, line, priceAtLast, lastClose)) {
			continue;
		}
		const gap =
			bias === 'bearish'
				? priceAtLast - lastClose
				: lastClose >= priceAtLast
					? lastClose - priceAtLast
					: priceAtLast - lastClose;
		out.push({line, index, priceAtLast, gap});
	}
	return out;
}

/**
 * Auto-pick trend line for trade entry from OHLCV only: valid retest geometry at the last bar,
 * then highest score, then nearest to last close. Does not use menu rank (#1) as a shortcut.
 */
export function pickTrendLineForTradeSetup(
	bias: 'bullish' | 'bearish' | 'neutral',
	lines: TrendLine[],
	bars: Record<string, unknown>[] = [],
	lastClose?: number | null,
): TrendLineTradePick {
	if (bias === 'neutral' || !lines.length) {
		return {line: null, trendLineNumber: null};
	}
	const close =
		lastClose != null && Number.isFinite(lastClose)
			? lastClose
			: (() => {
					if (!bars.length) {
						return null;
					}
					const lastBar = bars[bars.length - 1]!;
					const raw = lastBar.close ?? lastBar.Close;
					return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
				})();
	if (close == null) {
		return {line: null, trendLineNumber: null};
	}
	const candidates = collectTrendRetestCandidates(bias, lines, bars, close);
	if (!candidates.length) {
		return {line: null, trendLineNumber: null};
	}
	candidates.sort((a, b) => {
		const scoreDelta = b.line.score - a.line.score;
		if (Math.abs(scoreDelta) > 1e-9) {
			return scoreDelta;
		}
		return a.gap - b.gap;
	});
	const picked = candidates[0]!;
	return {line: picked.line, trendLineNumber: picked.index + 1};
}

export function trendLinePriceAtLastBar(line: TrendLine, bars: Record<string, unknown>[]): number | null {
	if (!bars.length) {
		return null;
	}
	const lastBar = bars[bars.length - 1]!;
	const t = barTimeSec(lastBar);
	if (t == null) {
		return null;
	}
	return linePriceAt(t, line.pointA, line.pointB);
}
