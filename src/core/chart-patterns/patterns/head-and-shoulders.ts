import {blendConfidence, clampConfidence} from '../confidence.js';
import {minLowBetween} from '../swings.js';
import type {ChartPatternHit} from '../types.js';
import {
	type DetectorContext,
	finalizeHit,
	headProminenceScore,
	makePoint,
	pickBestHit,
	shoulderSymmetryScore,
	barSpanFromIndices,
} from './utils.js';
import type {OrderedSwing} from '../types.js';

function detectOne(
	ctx: DetectorContext,
	left: (typeof ctx.highs)[number],
	head: (typeof ctx.highs)[number],
	right: (typeof ctx.highs)[number],
): ChartPatternHit | null {
	if (!(left.barIndex < head.barIndex && head.barIndex < right.barIndex)) {
		return null;
	}
	if (head.price <= left.price || head.price <= right.price) {
		return null;
	}
	const shoulderScore = shoulderSymmetryScore(left.price, right.price);
	const headScore = headProminenceScore(head.price, (left.price + right.price) / 2);
	if (shoulderScore < 0.35 || headScore < 0.35) {
		return null;
	}

	const trough1 = minLowBetween(ctx.bars, left.barIndex, head.barIndex);
	const trough2 = minLowBetween(ctx.bars, head.barIndex, right.barIndex);
	if (!trough1 || !trough2) {
		return null;
	}
	const neckline = (trough1.low + trough2.low) / 2;
	const lastClose = ctx.lastClose;
	const completed = lastClose < neckline;

	const confidence = blendConfidence(shoulderScore, headScore, completed ? 0.85 : 0.55);
	const fromIndex = left.barIndex;
	const toIndex = right.barIndex;

	return finalizeHit(
		{
			id: 'head_and_shoulders',
			name: 'Head & Shoulders',
			category: 'reversal',
			direction: 'bearish',
			confidence,
			completionState: completed ? 'completed' : 'forming',
			barSpan: barSpanFromIndices(ctx.bars, fromIndex, toIndex),
			points: [
				makePoint(ctx.bars[left.barIndex]!, left.price, 'LS', 'left_shoulder'),
				makePoint(ctx.bars[head.barIndex]!, head.price, 'H', 'head'),
				makePoint(ctx.bars[right.barIndex]!, right.price, 'RS', 'right_shoulder'),
				makePoint(trough1, trough1.low, 'T1', 'trough'),
				makePoint(trough2, trough2.low, 'T2', 'trough'),
			],
			lines: [
				{
					pointA: makePoint(trough1, trough1.low, 'T1'),
					pointB: makePoint(trough2, trough2.low, 'T2'),
					label: 'Neckline',
					kind: 'neckline',
				},
			],
			levels: [{price: neckline, label: 'Neckline', kind: 'neckline'}],
			description: `Head & shoulders with head at ${head.price.toFixed(2)}, shoulders ${left.price.toFixed(2)} / ${right.price.toFixed(2)}, neckline near ${neckline.toFixed(2)}.`,
		},
		ctx.lastClose,
	);
}

export function detectHeadAndShoulders(
	ctx: DetectorContext,
	swingHighsOverride?: OrderedSwing[],
): ChartPatternHit | null {
	const highs = (swingHighsOverride ?? ctx.highs).filter(h => h.barIndex >= ctx.focusFromIndex - 5);
	const candidates: ChartPatternHit[] = [];
	for (let i = 0; i < highs.length; i++) {
		for (let j = i + 1; j < highs.length; j++) {
			for (let k = j + 1; k < highs.length; k++) {
				const hit = detectOne(ctx, highs[i]!, highs[j]!, highs[k]!);
				if (hit && hit.barSpan.toIndex >= ctx.focusFromIndex) {
					candidates.push(hit);
				}
			}
		}
	}
	return pickBestHit(candidates);
}
