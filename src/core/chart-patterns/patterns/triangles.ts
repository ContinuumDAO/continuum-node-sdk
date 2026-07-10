import {blendConfidence, withinPct} from '../confidence.js';
import type {ChartPatternHit, ChartPatternId} from '../types.js';
import {
	type DetectorContext,
	barSpanFromIndices,
	finalizeHit,
	makePoint,
	pickBestHit,
} from './utils.js';

function fitLine(points: Array<{timeSec: number; price: number}>): {slope: number; intercept: number} | null {
	if (points.length < 2) {
		return null;
	}
	const a = points[0]!;
	const b = points.at(-1)!;
	const dt = b.timeSec - a.timeSec;
	if (dt === 0) {
		return null;
	}
	const slope = (b.price - a.price) / dt;
	const intercept = a.price - slope * a.timeSec;
	return {slope, intercept};
}

function linePrice(line: {slope: number; intercept: number}, timeSec: number): number {
	return line.slope * timeSec + line.intercept;
}

function detectTriangle(
	ctx: DetectorContext,
	id: ChartPatternId,
	name: string,
	direction: 'bullish' | 'bearish' | 'neutral',
): ChartPatternHit | null {
	const segment = ctx.bars.slice(Math.max(0, ctx.bars.length - 30));
	if (segment.length < 12) {
		return null;
	}
	const start = segment[0]!.index;
	const end = segment.at(-1)!.index;
	const highs = ctx.highs.filter(h => h.barIndex >= start && h.barIndex <= end);
	const lows = ctx.lows.filter(l => l.barIndex >= start && l.barIndex <= end);
	if (highs.length < 2 || lows.length < 2) {
		return null;
	}

	const highLine = fitLine(highs.map(h => ({timeSec: h.timeSec, price: h.price})));
	const lowLine = fitLine(lows.map(l => ({timeSec: l.timeSec, price: l.price})));
	if (!highLine || !lowLine) {
		return null;
	}

	const flatHigh = Math.abs(highLine.slope) < 1e-6;
	const flatLow = Math.abs(lowLine.slope) < 1e-6;
	const risingLows = lowLine.slope > 0;
	const fallingHighs = highLine.slope < 0;

	let match = false;
	if (id === 'ascending_triangle') {
		match = flatHigh && risingLows;
	} else if (id === 'descending_triangle') {
		match = flatLow && fallingHighs;
	} else {
		match = risingLows && fallingHighs && !flatHigh && !flatLow;
	}
	if (!match) {
		return null;
	}

	const tStart = segment[0]!.timeSec;
	const tEnd = segment.at(-1)!.timeSec;
	const resA = {timeSec: tStart, price: linePrice(highLine, tStart)};
	const resB = {timeSec: tEnd, price: linePrice(highLine, tEnd)};
	const supA = {timeSec: tStart, price: linePrice(lowLine, tStart)};
	const supB = {timeSec: tEnd, price: linePrice(lowLine, tEnd)};

	const flatLevel =
		id === 'ascending_triangle'
			? (resA.price + resB.price) / 2
			: id === 'descending_triangle'
				? (supA.price + supB.price) / 2
				: null;

	const breakout =
		id === 'ascending_triangle'
			? ctx.lastClose > (flatLevel ?? 0)
			: id === 'descending_triangle'
				? ctx.lastClose < (flatLevel ?? 0)
				: id === 'symmetrical_triangle'
					? ctx.lastClose > resB.price || ctx.lastClose < supB.price
					: false;

	const confidence = blendConfidence(
		0.7,
		id === 'symmetrical_triangle' ? 0.55 : 0.75,
		breakout ? 0.85 : 0.5,
	);

	return finalizeHit(
		{
			id,
			name,
			category: 'continuation',
			direction,
			confidence,
			completionState: breakout ? 'completed' : 'forming',
			barSpan: barSpanFromIndices(ctx.bars, start, end),
			points: [
				{...supA, label: 'S1', role: 'support'},
				{...supB, label: 'S2', role: 'support'},
				{...resA, label: 'R1', role: 'resistance'},
				{...resB, label: 'R2', role: 'resistance'},
			],
			lines: [
				{
					pointA: {...supA, label: 'S1'},
					pointB: {...supB, label: 'S2'},
					label: 'Support',
					kind: 'boundary',
				},
				{
					pointA: {...resA, label: 'R1'},
					pointB: {...resB, label: 'R2'},
					label: 'Resistance',
					kind: 'boundary',
				},
			],
			levels: flatLevel != null ? [{price: flatLevel, label: 'Flat boundary', kind: 'level'}] : undefined,
			description: `${name} with converging boundaries over bars ${start}–${end}.`,
		},
		ctx.lastClose,
	);
}

export function detectTriangles(ctx: DetectorContext): ChartPatternHit[] {
	const hits = [
		detectTriangle(ctx, 'ascending_triangle', 'Ascending Triangle', 'bullish'),
		detectTriangle(ctx, 'descending_triangle', 'Descending Triangle', 'bearish'),
		detectTriangle(ctx, 'symmetrical_triangle', 'Symmetrical Triangle', 'neutral'),
	].filter((h): h is ChartPatternHit => h != null && h.barSpan.toIndex >= ctx.focusFromIndex);
	return hits;
}
