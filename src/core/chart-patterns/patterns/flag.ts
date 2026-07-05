import {blendConfidence} from '../confidence.js';
import type {ChartPatternHit} from '../types.js';
import {type DetectorContext, barSpanFromIndices, finalizeHit, makePoint} from './utils.js';

function detectFlag(ctx: DetectorContext, bullish: boolean): ChartPatternHit | null {
	const n = ctx.bars.length;
	if (n < 25) {
		return null;
	}
	const poleLen = Math.min(10, Math.floor(n / 3));
	const flagLen = Math.min(12, Math.floor(n / 3));
	const poleStart = n - poleLen - flagLen;
	const flagStart = n - flagLen;
	if (poleStart < 1) {
		return null;
	}

	const poleBars = ctx.bars.slice(poleStart, flagStart);
	const flagBars = ctx.bars.slice(flagStart);
	if (poleBars.length < 4 || flagBars.length < 5) {
		return null;
	}

	const poleMove =
		(bullish ? poleBars.at(-1)!.close - poleBars[0]!.close : poleBars[0]!.close - poleBars.at(-1)!.close) /
		Math.max(Math.abs(poleBars[0]!.close), 1e-8);
	if (poleMove < 0.05) {
		return null;
	}

	const flagSlope =
		(flagBars.at(-1)!.close - flagBars[0]!.close) / Math.max(Math.abs(flagBars[0]!.close), 1e-8);
	if (bullish && flagSlope > 0.01) {
		return null;
	}
	if (!bullish && flagSlope < -0.01) {
		return null;
	}

	const fromIndex = poleBars[0]!.index;
	const toIndex = flagBars.at(-1)!.index;
	const confidence = blendConfidence(Math.min(1, poleMove / 0.1), 0.72, 0.58);

	return finalizeHit(
		{
			id: bullish ? 'flag_bullish' : 'flag_bearish',
			name: bullish ? 'Bull Flag' : 'Bear Flag',
			category: 'continuation',
			direction: bullish ? 'bullish' : 'bearish',
			confidence,
			completionState: 'forming',
			barSpan: barSpanFromIndices(ctx.bars, fromIndex, toIndex),
			points: [
				makePoint(poleBars[0]!, poleBars[0]!.close, 'P0', 'pole_start'),
				makePoint(poleBars.at(-1)!, poleBars.at(-1)!.close, 'P1', 'pole_end'),
				makePoint(flagBars[0]!, flagBars[0]!.high, 'F0', 'flag'),
				makePoint(flagBars.at(-1)!, flagBars.at(-1)!.close, 'F1', 'flag'),
			],
			lines: [
				{
					pointA: makePoint(poleBars[0]!, poleBars[0]!.close, 'P0'),
					pointB: makePoint(poleBars.at(-1)!, poleBars.at(-1)!.close, 'P1'),
					label: 'Pole',
					kind: 'flagpole',
				},
			],
			description: `${bullish ? 'Bull' : 'Bear'} flag with ${(poleMove * 100).toFixed(1)}% pole and counter-trend channel.`,
		},
		ctx.lastClose,
	);
}

export function detectFlags(ctx: DetectorContext): ChartPatternHit[] {
	const hits = [detectFlag(ctx, true), detectFlag(ctx, false)].filter(
		(h): h is ChartPatternHit => h != null && h.barSpan.toIndex >= ctx.focusFromIndex,
	);
	return hits;
}
