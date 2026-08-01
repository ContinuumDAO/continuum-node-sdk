import {blendConfidence} from '../confidence.js';
import type {ChartPatternHit} from '../types.js';
import {enumeratePoleFlagWindows, flagBoundaryPoints} from './flag-pennant-shared.js';
import {type DetectorContext, barSpanFromIndices, finalizeHit, makePoint, pickBestHit} from './utils.js';

function detectFlag(ctx: DetectorContext, bullish: boolean): ChartPatternHit | null {
	const n = ctx.bars.length;
	if (n < 25) {
		return null;
	}

	const windows = enumeratePoleFlagWindows(ctx.bars, {
		bullish,
		minPoleMove: 0.035,
		minFlagLen: 5,
		maxFlagLen: 16,
		minPoleLen: 4,
		maxPoleLen: Math.min(40, Math.floor(n / 2)),
		maxFlagEndLag: 2,
	});

	const candidates: ChartPatternHit[] = [];
	for (const w of windows) {
		// Flag: counter-trend or flat consolidation (not a continuing impulse).
		if (bullish) {
			if (w.flagSlope > 0.008 || w.flagSlope < -0.1) {
				continue;
			}
		} else if (w.flagSlope < -0.008 || w.flagSlope > 0.1) {
			continue;
		}

		// Prefer parallel / mild-contract channel over a hard pennant coil, but allow overlap.
		const parallelish = w.lateRange >= w.earlyRange * 0.55;
		if (!parallelish && w.contracts) {
			// Strong coil is pennant territory; skip unless slope is clearly counter-trend.
			const counter = bullish ? w.flagSlope < -0.005 : w.flagSlope > 0.005;
			if (!counter) {
				continue;
			}
		}

		const bounds = flagBoundaryPoints(w.flagBars);
		const confidence = blendConfidence(
			Math.min(1, w.poleMove / 0.07),
			0.78,
			w.compact ? 0.82 : 0.55,
			w.flagEnd === n - 1 ? 0.9 : 0.72,
			parallelish ? 0.8 : 0.65,
		);

		candidates.push(
			finalizeHit(
				{
					id: bullish ? 'flag_bullish' : 'flag_bearish',
					name: bullish ? 'Bull Flag' : 'Bear Flag',
					category: 'continuation',
					direction: bullish ? 'bullish' : 'bearish',
					confidence,
					completionState: 'forming',
					barSpan: barSpanFromIndices(ctx.bars, w.poleStartBar.index, w.flagEnd),
					points: [
						makePoint(w.poleStartBar, w.poleStartPrice, 'P0', 'pole_start'),
						makePoint(w.poleEndBar, w.poleEndPrice, 'P1', 'pole_end'),
						makePoint(w.flagBars[0]!, w.flagBars[0]!.high, 'F0', 'flag'),
						makePoint(w.flagBars.at(-1)!, w.flagBars.at(-1)!.close, 'F1', 'flag'),
						bounds.upperA,
						bounds.upperB,
						bounds.lowerA,
						bounds.lowerB,
					],
					lines: [
						{
							pointA: makePoint(w.poleStartBar, w.poleStartPrice, 'P0'),
							pointB: makePoint(w.poleEndBar, w.poleEndPrice, 'P1'),
							label: 'Pole',
							kind: 'flagpole',
						},
						{
							pointA: bounds.upperA,
							pointB: bounds.upperB,
							label: 'Upper channel',
							kind: 'boundary',
						},
						{
							pointA: bounds.lowerA,
							pointB: bounds.lowerB,
							label: 'Lower channel',
							kind: 'boundary',
						},
					],
					description: `${bullish ? 'Bull' : 'Bear'} flag with ${(w.poleMove * 100).toFixed(1)}% pole and counter-trend channel.`,
				},
				ctx.lastClose,
			),
		);
	}

	const best = pickBestHit(candidates);
	if (!best || best.barSpan.toIndex < ctx.focusFromIndex) {
		return null;
	}
	return best;
}

export function detectFlags(ctx: DetectorContext): ChartPatternHit[] {
	return [detectFlag(ctx, true), detectFlag(ctx, false)].filter(
		(h): h is ChartPatternHit => h != null,
	);
}
