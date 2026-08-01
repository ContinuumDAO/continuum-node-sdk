import {blendConfidence} from '../confidence.js';
import type {ChartPatternHit} from '../types.js';
import {enumeratePoleFlagWindows, flagBoundaryPoints} from './flag-pennant-shared.js';
import {type DetectorContext, barSpanFromIndices, finalizeHit, makePoint, pickBestHit} from './utils.js';

function detectPennant(ctx: DetectorContext, bullish: boolean): ChartPatternHit | null {
	const n = ctx.bars.length;
	if (n < 20) {
		return null;
	}

	const windows = enumeratePoleFlagWindows(ctx.bars, {
		bullish,
		minPoleMove: 0.03,
		minFlagLen: 4,
		maxFlagLen: 14,
		minPoleLen: 3,
		maxPoleLen: Math.min(36, Math.floor(n / 2)),
		maxFlagEndLag: 2,
	});

	const candidates: ChartPatternHit[] = [];
	for (const w of windows) {
		// Pennant: consolidating coil after the pole (range contracts).
		if (!w.contracts) {
			continue;
		}
		// Avoid with-trend drift inside the coil (continuation belongs to the pole).
		if (bullish && w.flagSlope > 0.02) {
			continue;
		}
		if (!bullish && w.flagSlope < -0.02) {
			continue;
		}
		// Coil must actually tighten — reject mild noise on a grind.
		if (w.lateRange >= w.earlyRange * 0.85) {
			continue;
		}

		const bounds = flagBoundaryPoints(w.flagBars);
		const confidence = blendConfidence(
			Math.min(1, w.poleMove / 0.06),
			0.82,
			w.compact ? 0.85 : 0.55,
			w.flagEnd === n - 1 ? 0.9 : 0.72,
		);

		candidates.push(
			finalizeHit(
				{
					id: bullish ? 'pennant_bullish' : 'pennant_bearish',
					name: bullish ? 'Bullish Pennant' : 'Bearish Pennant',
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
							label: 'Upper boundary',
							kind: 'boundary',
						},
						{
							pointA: bounds.lowerA,
							pointB: bounds.lowerB,
							label: 'Lower boundary',
							kind: 'boundary',
						},
					],
					description: `${bullish ? 'Bullish' : 'Bearish'} pennant with ${(w.poleMove * 100).toFixed(1)}% pole and contracting flag.`,
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

export function detectPennants(ctx: DetectorContext): ChartPatternHit[] {
	return [detectPennant(ctx, true), detectPennant(ctx, false)].filter(
		(h): h is ChartPatternHit => h != null,
	);
}
