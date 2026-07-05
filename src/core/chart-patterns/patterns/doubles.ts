import {blendConfidence, withinPct} from '../confidence.js';
import {minLowBetween, maxHighBetween} from '../swings.js';
import type {ChartPatternHit, NormalizedBar} from '../types.js';
import {
	type DetectorContext,
	finalizeHit,
	makePoint,
	pickBestHit,
	barSpanFromIndices,
	depthScore,
} from './utils.js';

function troughShapeScore(bars: NormalizedBar[], centerIndex: number): number {
	const window = 2;
	const lows: number[] = [];
	for (let i = centerIndex - window; i <= centerIndex + window; i++) {
		const bar = bars[i];
		if (bar) {
			lows.push(bar.low);
		}
	}
	if (lows.length < 3) {
		return 0.5;
	}
	const min = Math.min(...lows);
	const atCenter = bars[centerIndex]?.low ?? min;
	const spread = (Math.max(...lows) - min) / Math.max(min, 1e-8);
	const sharp = atCenter <= min * 1.002;
	if (sharp && spread > 0.02) {
		return 0.9;
	}
	if (spread < 0.015) {
		return 0.85;
	}
	return 0.55;
}

function detectDoubleTop(ctx: DetectorContext): ChartPatternHit | null {
	const highs = ctx.highs;
	const candidates: ChartPatternHit[] = [];
	for (let i = 0; i < highs.length; i++) {
		for (let j = i + 1; j < highs.length; j++) {
			const a = highs[i]!;
			const b = highs[j]!;
			if (b.barIndex - a.barIndex < 3) {
				continue;
			}
			if (!withinPct(a.price, b.price, 0.04)) {
				continue;
			}
			const valley = minLowBetween(ctx.bars, a.barIndex, b.barIndex);
			if (!valley) {
				continue;
			}
			const depth = (a.price - valley.low) / Math.max(a.price, 1e-8);
			if (depth < 0.02) {
				continue;
			}
			const confidence = blendConfidence(
				withinPct(a.price, b.price, 0.02) ? 0.9 : 0.7,
				depthScore(depth, 0.03, 0.2),
				ctx.lastClose < valley.low ? 0.85 : 0.55,
			);
			candidates.push(
				finalizeHit(
					{
						id: 'double_top',
						name: 'Double Top',
						category: 'reversal',
						direction: 'bearish',
						confidence,
						completionState: ctx.lastClose < valley.low ? 'completed' : 'forming',
						barSpan: barSpanFromIndices(ctx.bars, a.barIndex, b.barIndex),
						points: [
							makePoint(ctx.bars[a.barIndex]!, a.price, 'T1', 'top'),
							makePoint(ctx.bars[b.barIndex]!, b.price, 'T2', 'top'),
							makePoint(valley, valley.low, 'V', 'valley'),
						],
						lines: [],
						levels: [{price: valley.low, label: 'Neckline', kind: 'neckline'}],
						description: `Double top at ${a.price.toFixed(2)} / ${b.price.toFixed(2)} with valley ${valley.low.toFixed(2)}.`,
					},
					ctx.lastClose,
				),
			);
		}
	}
	return pickBestHit(candidates.filter(c => c.barSpan.toIndex >= ctx.focusFromIndex));
}

function detectDoubleBottom(ctx: DetectorContext, adamEve = false): ChartPatternHit | null {
	const lows = ctx.lows;
	const candidates: ChartPatternHit[] = [];
	for (let i = 0; i < lows.length; i++) {
		for (let j = i + 1; j < lows.length; j++) {
			const a = lows[i]!;
			const b = lows[j]!;
			if (b.barIndex - a.barIndex < 3) {
				continue;
			}
			if (!withinPct(a.price, b.price, 0.05)) {
				continue;
			}
			const peak = maxHighBetween(ctx.bars, a.barIndex, b.barIndex);
			if (!peak) {
				continue;
			}
			const depth = (peak.high - a.price) / Math.max(peak.high, 1e-8);
			if (depth < 0.02) {
				continue;
			}

			let variant: string | undefined;
			let id: 'double_bottom' | 'double_bottom_adam_eve' = 'double_bottom';
			let shapeBoost = 0.65;
			if (adamEve) {
				const adamScore = troughShapeScore(ctx.bars, a.barIndex);
				const eveScore = 1 - troughShapeScore(ctx.bars, b.barIndex) + 0.5;
				if (adamScore < 0.75 || eveScore < 0.75) {
					continue;
				}
				id = 'double_bottom_adam_eve';
				variant = 'adam_eve';
				shapeBoost = 0.85;
			}

			const confidence = blendConfidence(
				withinPct(a.price, b.price, 0.02) ? 0.9 : 0.7,
				depthScore(depth, 0.03, 0.2),
				shapeBoost,
				ctx.lastClose > peak.high ? 0.85 : 0.55,
			);
			candidates.push(
				finalizeHit(
					{
						id,
						name: adamEve ? 'Adam & Eve Double Bottom' : 'Double Bottom',
						variant,
						category: 'reversal',
						direction: 'bullish',
						confidence,
						completionState: ctx.lastClose > peak.high ? 'completed' : 'forming',
						barSpan: barSpanFromIndices(ctx.bars, a.barIndex, b.barIndex),
						points: [
							makePoint(ctx.bars[a.barIndex]!, a.price, adamEve ? 'Adam' : 'B1', 'bottom'),
							makePoint(ctx.bars[b.barIndex]!, b.price, adamEve ? 'Eve' : 'B2', 'bottom'),
							makePoint(peak, peak.high, 'P', 'peak'),
						],
						lines: [],
						levels: [{price: peak.high, label: 'Neckline', kind: 'neckline'}],
						description: `${adamEve ? 'Adam & Eve double bottom' : 'Double bottom'} at ${a.price.toFixed(2)} / ${b.price.toFixed(2)} with peak ${peak.high.toFixed(2)}.`,
					},
					ctx.lastClose,
				),
			);
		}
	}
	return pickBestHit(candidates.filter(c => c.barSpan.toIndex >= ctx.focusFromIndex));
}

export function detectDoubles(ctx: DetectorContext): ChartPatternHit[] {
	const hits: ChartPatternHit[] = [];
	const top = detectDoubleTop(ctx);
	const bottom = detectDoubleBottom(ctx, false);
	const adamEve = detectDoubleBottom(ctx, true);
	if (top) {
		hits.push(top);
	}
	if (bottom) {
		hits.push(bottom);
	}
	if (adamEve) {
		hits.push(adamEve);
	}
	return hits;
}
