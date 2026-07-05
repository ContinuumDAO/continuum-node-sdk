import {calculateTrendLinesFromBars} from '../../chart/levels/trend-lines.js';
import {blendConfidence} from '../confidence.js';
import type {ChartPatternHit} from '../types.js';
import {type DetectorContext, barSpanFromIndices, finalizeHit, pickBestHit} from './utils.js';

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

function detectSwingChannel(ctx: DetectorContext, up: boolean): ChartPatternHit | null {
	const segment = ctx.bars.slice(Math.max(0, ctx.bars.length - 32));
	if (segment.length < 14) {
		return null;
	}
	const start = segment[0]!.index;
	const end = segment.at(-1)!.index;
	const highs = ctx.highs.filter(h => h.barIndex >= start && h.barIndex <= end).slice(-3);
	const lows = ctx.lows.filter(l => l.barIndex >= start && l.barIndex <= end).slice(-3);
	if (highs.length < 2 || lows.length < 2) {
		return null;
	}

	const highLine = fitLine(highs.map(h => ({timeSec: h.timeSec, price: h.price})));
	const lowLine = fitLine(lows.map(l => ({timeSec: l.timeSec, price: l.price})));
	if (!highLine || !lowLine) {
		return null;
	}

	const slopeDiff = Math.abs(highLine.slope - lowLine.slope);
	const avgSlope = (highLine.slope + lowLine.slope) / 2;
	if (slopeDiff > Math.max(Math.abs(avgSlope) * 0.35, 1e-8)) {
		return null;
	}
	if (up && avgSlope <= 0) {
		return null;
	}
	if (!up && avgSlope >= 0) {
		return null;
	}

	const tStart = segment[0]!.timeSec;
	const tEnd = segment.at(-1)!.timeSec;
	const resA = {timeSec: tStart, price: linePrice(highLine, tStart)};
	const resB = {timeSec: tEnd, price: linePrice(highLine, tEnd)};
	const supA = {timeSec: tStart, price: linePrice(lowLine, tStart)};
	const supB = {timeSec: tEnd, price: linePrice(lowLine, tEnd)};

	return finalizeHit(
		{
			id: up ? 'channel_up' : 'channel_down',
			name: up ? 'Ascending Channel' : 'Descending Channel',
			category: 'continuation',
			direction: up ? 'bullish' : 'bearish',
			confidence: blendConfidence(0.7, 0.65),
			completionState: 'forming',
			barSpan: barSpanFromIndices(ctx.bars, start, end),
			points: [
				{...supA, label: 'S1', role: 'support'},
				{...supB, label: 'S2', role: 'support'},
				{...resA, label: 'R1', role: 'resistance'},
				{...resB, label: 'R2', role: 'resistance'},
			],
			lines: [
				{pointA: {...supA, label: 'S1'}, pointB: {...supB, label: 'S2'}, label: 'Support', kind: 'support'},
				{pointA: {...resA, label: 'R1'}, pointB: {...resB, label: 'R2'}, label: 'Resistance', kind: 'resistance'},
			],
			description: `${up ? 'Ascending' : 'Descending'} price channel with parallel boundaries.`,
		},
		ctx.lastClose,
	);
}

function detectTrendLineChannel(
	ctx: DetectorContext,
	rawBars: Record<string, unknown>[],
): ChartPatternHit | null {
	const lines = calculateTrendLinesFromBars(rawBars, {maxLines: 4, minTouches: 2});
	const support = lines.filter(l => l.kind === 'support').sort((a, b) => b.score - a.score)[0];
	const resistance = lines.filter(l => l.kind === 'resistance').sort((a, b) => b.score - a.score)[0];
	if (!support || !resistance) {
		return null;
	}
	const slopeDiff = Math.abs(support.slope - resistance.slope);
	const avgSlope = (support.slope + resistance.slope) / 2;
	if (slopeDiff > Math.max(Math.abs(avgSlope) * 0.4, 1e-8)) {
		return null;
	}
	const up = avgSlope > 0;
	const fromIndex = Math.max(0, ctx.bars.length - 30);
	const toIndex = ctx.bars.length - 1;
	return finalizeHit(
		{
			id: up ? 'channel_up' : 'channel_down',
			name: up ? 'Ascending Channel' : 'Descending Channel',
			category: 'continuation',
			direction: up ? 'bullish' : 'bearish',
			confidence: blendConfidence(0.72, Math.min(1, (support.score + resistance.score) / 2)),
			completionState: 'forming',
			barSpan: barSpanFromIndices(ctx.bars, fromIndex, toIndex),
			points: [
				{timeSec: support.pointA.time, price: support.pointA.price, label: 'S1', role: 'support'},
				{timeSec: support.pointB.time, price: support.pointB.price, label: 'S2', role: 'support'},
				{timeSec: resistance.pointA.time, price: resistance.pointA.price, label: 'R1', role: 'resistance'},
				{timeSec: resistance.pointB.time, price: resistance.pointB.price, label: 'R2', role: 'resistance'},
			],
			lines: [
				{
					pointA: {timeSec: support.pointA.time, price: support.pointA.price, label: 'S1'},
					pointB: {timeSec: support.pointB.time, price: support.pointB.price, label: 'S2'},
					label: 'Support',
					kind: 'support',
				},
				{
					pointA: {timeSec: resistance.pointA.time, price: resistance.pointA.price, label: 'R1'},
					pointB: {timeSec: resistance.pointB.time, price: resistance.pointB.price, label: 'R2'},
					label: 'Resistance',
					kind: 'resistance',
				},
			],
			description: `${up ? 'Ascending' : 'Descending'} channel from swing trend lines.`,
		},
		ctx.lastClose,
	);
}

export function detectChannels(
	ctx: DetectorContext,
	rawBars: Record<string, unknown>[],
): ChartPatternHit[] {
	const candidates = [
		detectSwingChannel(ctx, true),
		detectSwingChannel(ctx, false),
		detectTrendLineChannel(ctx, rawBars),
	].filter((h): h is ChartPatternHit => h != null && h.barSpan.toIndex >= ctx.focusFromIndex);

	const byId = new Map<string, ChartPatternHit>();
	for (const hit of candidates) {
		const prev = byId.get(hit.id);
		if (!prev || hit.confidence > prev.confidence) {
			byId.set(hit.id, hit);
		}
	}
	return [...byId.values()];
}
