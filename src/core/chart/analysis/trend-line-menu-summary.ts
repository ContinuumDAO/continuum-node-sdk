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

/** Highest-scored trend line matching trade bias (support for long, resistance for short). */
export function pickTrendLineForTradeSetup(
	bias: 'bullish' | 'bearish' | 'neutral',
	lines: TrendLine[],
): TrendLineTradePick {
	if (bias === 'neutral' || !lines.length) {
		return {line: null, trendLineNumber: null};
	}
	const wantKind = bias === 'bullish' ? 'support' : 'resistance';
	const index = lines.findIndex(line => line.kind === wantKind);
	if (index < 0) {
		return {line: null, trendLineNumber: null};
	}
	return {line: lines[index]!, trendLineNumber: index + 1};
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
