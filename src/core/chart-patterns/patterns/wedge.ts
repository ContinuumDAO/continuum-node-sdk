import {blendConfidence} from '../confidence.js';
import type {ChartPatternHit, ChartPatternId} from '../types.js';
import {type DetectorContext, barSpanFromIndices, finalizeHit} from './utils.js';

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

function detectWedge(
	ctx: DetectorContext,
	id: ChartPatternId,
	name: string,
	direction: 'bullish' | 'bearish',
	rising: boolean,
): ChartPatternHit | null {
	const segment = ctx.bars.slice(Math.max(0, ctx.bars.length - 28));
	if (segment.length < 12) {
		return null;
	}
	const start = segment[0]!.index;
	const end = segment.at(-1)!.index;
	const highs = ctx.highs.filter(h => h.barIndex >= start && h.barIndex <= end).slice(-4);
	const lows = ctx.lows.filter(l => l.barIndex >= start && l.barIndex <= end).slice(-4);
	if (highs.length < 2 || lows.length < 2) {
		return null;
	}

	const highLine = fitLine(highs.map(h => ({timeSec: h.timeSec, price: h.price})));
	const lowLine = fitLine(lows.map(l => ({timeSec: l.timeSec, price: l.price})));
	if (!highLine || !lowLine) {
		return null;
	}

	const bothUp = highLine.slope > 0 && lowLine.slope > 0;
	const bothDown = highLine.slope < 0 && lowLine.slope < 0;
	if (rising && !bothUp) {
		return null;
	}
	if (!rising && !bothDown) {
		return null;
	}
	if (Math.abs(highLine.slope) <= Math.abs(lowLine.slope)) {
		return null;
	}

	const tStart = segment[0]!.timeSec;
	const tEnd = segment.at(-1)!.timeSec;
	const resA = {timeSec: tStart, price: linePrice(highLine, tStart)};
	const resB = {timeSec: tEnd, price: linePrice(highLine, tEnd)};
	const supA = {timeSec: tStart, price: linePrice(lowLine, tStart)};
	const supB = {timeSec: tEnd, price: linePrice(lowLine, tEnd)};

	const confidence = blendConfidence(0.68, 0.62, 0.55);

	return finalizeHit(
		{
			id,
			name,
			category: 'reversal',
			direction,
			confidence,
			completionState: 'forming',
			barSpan: barSpanFromIndices(ctx.bars, start, end),
			points: [
				{...supA, label: 'S1', role: 'support'},
				{...supB, label: 'S2', role: 'support'},
				{...resA, label: 'R1', role: 'resistance'},
				{...resB, label: 'R2', role: 'resistance'},
			],
			lines: [
				{pointA: {...supA, label: 'S1'}, pointB: {...supB, label: 'S2'}, label: 'Support', kind: 'boundary'},
				{pointA: {...resA, label: 'R1'}, pointB: {...resB, label: 'R2'}, label: 'Resistance', kind: 'boundary'},
			],
			description: `${name} with converging ${rising ? 'upward' : 'downward'} boundaries.`,
		},
		ctx.lastClose,
	);
}

export function detectWedges(ctx: DetectorContext): ChartPatternHit[] {
	const hits = [
		detectWedge(ctx, 'rising_wedge', 'Rising Wedge', 'bearish', true),
		detectWedge(ctx, 'falling_wedge', 'Falling Wedge', 'bullish', false),
	].filter((h): h is ChartPatternHit => h != null && h.barSpan.toIndex >= ctx.focusFromIndex);
	return hits;
}
