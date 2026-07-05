import {blendConfidence} from '../confidence.js';
import type {ChartPatternHit} from '../types.js';
import {type DetectorContext, barSpanFromIndices, finalizeHit, makePoint, pickBestHit} from './utils.js';

function detectPennant(ctx: DetectorContext, bullish: boolean): ChartPatternHit | null {
	const n = ctx.bars.length;
	if (n < 20) {
		return null;
	}
	const poleLen = Math.min(8, Math.floor(n / 4));
	const flagLen = Math.min(10, Math.floor(n / 3));
	const poleStart = n - poleLen - flagLen;
	const flagStart = n - flagLen;
	if (poleStart < 1) {
		return null;
	}

	const poleBars = ctx.bars.slice(poleStart, flagStart);
	const flagBars = ctx.bars.slice(flagStart);
	if (poleBars.length < 3 || flagBars.length < 4) {
		return null;
	}

	const poleMove =
		(bullish ? poleBars.at(-1)!.close - poleBars[0]!.close : poleBars[0]!.close - poleBars.at(-1)!.close) /
		Math.max(Math.abs(poleBars[0]!.close), 1e-8);
	if (poleMove < 0.04) {
		return null;
	}

	const flagHighs = flagBars.map(b => b.high);
	const flagLows = flagBars.map(b => b.low);
	const earlyRange = Math.max(...flagHighs.slice(0, 2)) - Math.min(...flagLows.slice(0, 2));
	const lateRange = Math.max(...flagHighs.slice(-2)) - Math.min(...flagLows.slice(-2));
	if (lateRange >= earlyRange * 0.95) {
		return null;
	}

	const fromIndex = poleBars[0]!.index;
	const toIndex = flagBars.at(-1)!.index;
	const poleA = poleBars[0]!;
	const poleB = poleBars.at(-1)!;
	const confidence = blendConfidence(Math.min(1, poleMove / 0.08), 0.7, 0.6);

	return finalizeHit(
		{
			id: bullish ? 'pennant_bullish' : 'pennant_bearish',
			name: bullish ? 'Bullish Pennant' : 'Bearish Pennant',
			category: 'continuation',
			direction: bullish ? 'bullish' : 'bearish',
			confidence,
			completionState: 'forming',
			barSpan: barSpanFromIndices(ctx.bars, fromIndex, toIndex),
			points: [
				makePoint(poleA, poleA.close, 'P0', 'pole_start'),
				makePoint(poleB, poleB.close, 'P1', 'pole_end'),
				makePoint(flagBars[0]!, flagBars[0]!.high, 'F0', 'flag'),
				makePoint(flagBars.at(-1)!, flagBars.at(-1)!.close, 'F1', 'flag'),
			],
			lines: [
				{
					pointA: makePoint(poleA, poleA.close, 'P0'),
					pointB: makePoint(poleB, poleB.close, 'P1'),
					label: 'Pole',
					kind: 'flagpole',
				},
			],
			description: `${bullish ? 'Bullish' : 'Bearish'} pennant with ${(poleMove * 100).toFixed(1)}% pole and contracting flag.`,
		},
		ctx.lastClose,
	);
}

export function detectPennants(ctx: DetectorContext): ChartPatternHit[] {
	const hits = [detectPennant(ctx, true), detectPennant(ctx, false)].filter(
		(h): h is ChartPatternHit => h != null && h.barSpan.toIndex >= ctx.focusFromIndex,
	);
	return hits;
}
