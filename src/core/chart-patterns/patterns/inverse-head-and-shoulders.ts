import {blendConfidence} from '../confidence.js';
import {maxHighBetween} from '../swings.js';
import type {ChartPatternHit, OrderedSwing} from '../types.js';
import {
	type DetectorContext,
	finalizeHit,
	headProminenceScore,
	makePoint,
	pickBestHit,
	shoulderSymmetryScore,
	barSpanFromIndices,
} from './utils.js';

function detectOne(
	ctx: DetectorContext,
	left: (typeof ctx.lows)[number],
	head: (typeof ctx.lows)[number],
	right: (typeof ctx.lows)[number],
): ChartPatternHit | null {
	if (!(left.barIndex < head.barIndex && head.barIndex < right.barIndex)) {
		return null;
	}
	if (head.price >= left.price || head.price >= right.price) {
		return null;
	}
	const shoulderScore = shoulderSymmetryScore(left.price, right.price);
	const headScore = headProminenceScore(left.price, head.price);
	if (shoulderScore < 0.35 || headScore < 0.35) {
		return null;
	}

	const peak1 = maxHighBetween(ctx.bars, left.barIndex, head.barIndex);
	const peak2 = maxHighBetween(ctx.bars, head.barIndex, right.barIndex);
	if (!peak1 || !peak2) {
		return null;
	}
	const neckline = (peak1.high + peak2.high) / 2;
	const completed = ctx.lastClose > neckline;

	const confidence = blendConfidence(shoulderScore, headScore, completed ? 0.85 : 0.55);

	return finalizeHit(
		{
			id: 'inverse_head_and_shoulders',
			name: 'Inverse Head & Shoulders',
			category: 'reversal',
			direction: 'bullish',
			confidence,
			completionState: completed ? 'completed' : 'forming',
			barSpan: barSpanFromIndices(ctx.bars, left.barIndex, right.barIndex),
			points: [
				makePoint(ctx.bars[left.barIndex]!, left.price, 'LS', 'left_shoulder'),
				makePoint(ctx.bars[head.barIndex]!, head.price, 'H', 'head'),
				makePoint(ctx.bars[right.barIndex]!, right.price, 'RS', 'right_shoulder'),
				makePoint(peak1, peak1.high, 'P1', 'peak'),
				makePoint(peak2, peak2.high, 'P2', 'peak'),
			],
			lines: [
				{
					pointA: makePoint(peak1, peak1.high, 'P1'),
					pointB: makePoint(peak2, peak2.high, 'P2'),
					label: 'Neckline',
					kind: 'neckline',
				},
			],
			levels: [{price: neckline, label: 'Neckline', kind: 'neckline'}],
			description: `Inverse H&S with trough at ${head.price.toFixed(2)}, shoulders ${left.price.toFixed(2)} / ${right.price.toFixed(2)}, neckline near ${neckline.toFixed(2)}.`,
		},
		ctx.lastClose,
	);
}

export function detectInverseHeadAndShoulders(
	ctx: DetectorContext,
	swingLowsOverride?: OrderedSwing[],
): ChartPatternHit | null {
	const lows = (swingLowsOverride ?? ctx.lows).filter(l => l.barIndex >= ctx.focusFromIndex - 5);
	const candidates: ChartPatternHit[] = [];
	for (let i = 0; i < lows.length; i++) {
		for (let j = i + 1; j < lows.length; j++) {
			for (let k = j + 1; k < lows.length; k++) {
				const hit = detectOne(ctx, lows[i]!, lows[j]!, lows[k]!);
				if (hit && hit.barSpan.toIndex >= ctx.focusFromIndex) {
					candidates.push(hit);
				}
			}
		}
	}
	return pickBestHit(candidates);
}
