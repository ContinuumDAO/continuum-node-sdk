import type {NormalizedBar} from '../types.js';

export type PoleFlagWindow = {
	poleStart: number;
	flagStart: number;
	flagEnd: number;
	poleBars: NormalizedBar[];
	flagBars: NormalizedBar[];
	/** Positive extent ratio of the impulse pole (high→low for bearish, low→high for bullish). */
	poleMove: number;
	poleStartBar: NormalizedBar;
	poleEndBar: NormalizedBar;
	poleStartPrice: number;
	poleEndPrice: number;
	flagSlope: number;
	earlyRange: number;
	lateRange: number;
	contracts: boolean;
	flagRange: number;
	compact: boolean;
	score: number;
};

function argExtrema(
	bars: NormalizedBar[],
	kind: 'high' | 'low',
): {index: number; price: number} {
	let bestIdx = 0;
	let best = kind === 'high' ? bars[0]!.high : bars[0]!.low;
	for (let i = 1; i < bars.length; i++) {
		const price = kind === 'high' ? bars[i]!.high : bars[i]!.low;
		if (kind === 'high' ? price > best : price < best) {
			best = price;
			bestIdx = i;
		}
	}
	return {index: bestIdx, price: best};
}

/**
 * Enumerate recent pole + consolidation windows ending near the series tip.
 * Pole size uses swing extremes (high→low / low→high), not close-to-close.
 */
export function enumeratePoleFlagWindows(
	bars: NormalizedBar[],
	options: {
		bullish: boolean;
		minPoleMove: number;
		minFlagLen: number;
		maxFlagLen: number;
		minPoleLen: number;
		maxPoleLen: number;
		/** Allow flag to end this many bars before the last bar (default 2). */
		maxFlagEndLag?: number;
	},
): PoleFlagWindow[] {
	const n = bars.length;
	const maxFlagEndLag = options.maxFlagEndLag ?? 2;
	const out: PoleFlagWindow[] = [];

	for (let flagEnd = n - 1; flagEnd >= Math.max(0, n - 1 - maxFlagEndLag); flagEnd--) {
		for (let flagLen = options.minFlagLen; flagLen <= options.maxFlagLen; flagLen++) {
			for (let poleLen = options.minPoleLen; poleLen <= options.maxPoleLen; poleLen++) {
				const flagStart = flagEnd - flagLen + 1;
				const poleStart = flagStart - poleLen;
				if (poleStart < 0 || flagStart <= poleStart) {
					continue;
				}
				const poleBars = bars.slice(poleStart, flagStart);
				const flagBars = bars.slice(flagStart, flagEnd + 1);
				if (poleBars.length < options.minPoleLen || flagBars.length < options.minFlagLen) {
					continue;
				}

				const high = argExtrema(poleBars, 'high');
				const low = argExtrema(poleBars, 'low');
				if (options.bullish) {
					// Impulse up: low precedes high inside the pole.
					if (low.index > high.index) {
						continue;
					}
				} else if (high.index > low.index) {
					// Impulse down: high precedes low.
					continue;
				}

				const poleStartPrice = options.bullish ? low.price : high.price;
				const poleEndPrice = options.bullish ? high.price : low.price;
				const poleMove =
					(options.bullish ? poleEndPrice - poleStartPrice : poleStartPrice - poleEndPrice) /
					Math.max(Math.abs(poleStartPrice), 1e-8);
				if (poleMove < options.minPoleMove) {
					continue;
				}

				// Directional close confirmation (soft): end of pole should not reverse the impulse.
				const closeMove =
					(options.bullish
						? poleBars.at(-1)!.close - poleBars[0]!.close
						: poleBars[0]!.close - poleBars.at(-1)!.close) /
					Math.max(Math.abs(poleBars[0]!.close), 1e-8);
				if (closeMove < options.minPoleMove * 0.35) {
					continue;
				}

				const flagHighs = flagBars.map(b => b.high);
				const flagLows = flagBars.map(b => b.low);
				const earlyN = Math.min(2, flagBars.length);
				const lateN = Math.min(2, flagBars.length);
				const earlyRange =
					Math.max(...flagHighs.slice(0, earlyN)) - Math.min(...flagLows.slice(0, earlyN));
				const lateRange =
					Math.max(...flagHighs.slice(-lateN)) - Math.min(...flagLows.slice(-lateN));
				const flagRange = Math.max(...flagHighs) - Math.min(...flagLows);
				const contracts = lateRange < earlyRange * 0.92;
				const compact = flagRange / Math.max(poleStartPrice * poleMove, 1e-8) < 0.6;
				if (!compact) {
					continue;
				}

				const flagSlope =
					(flagBars.at(-1)!.close - flagBars[0]!.close) /
					Math.max(Math.abs(flagBars[0]!.close), 1e-8);

				// Impulse must be sharp vs the consolidation (rejects slow grinds).
				const poleVelocity = poleMove / poleBars.length;
				const flagDrift = Math.abs(flagSlope);
				const flagVelocity = flagDrift / flagBars.length;
				const flagRangePct = flagRange / Math.max(Math.abs(poleStartPrice), 1e-8);
				if (poleVelocity < 0.005 && poleMove < 0.05) {
					continue;
				}
				if (poleVelocity < flagVelocity * 2.2) {
					continue;
				}
				// Consolidation should be a pause, not a continuation of the impulse.
				if (flagDrift > poleMove * 0.45) {
					continue;
				}
				if (flagRangePct > poleMove * 0.65) {
					continue;
				}

				const poleStartBar = options.bullish
					? poleBars[low.index]!
					: poleBars[high.index]!;
				const poleEndBar = options.bullish
					? poleBars[high.index]!
					: poleBars[low.index]!;

				const lagPenalty = (n - 1 - flagEnd) * 0.04;
				const sharpness = Math.min(1.3, poleVelocity / Math.max(flagVelocity, 1e-6));
				const score =
					poleMove * (contracts ? 1.15 : 1) * (compact ? 1.1 : 1) * sharpness * (1 - lagPenalty) +
					Math.max(0, 0.02 - flagDrift);

				out.push({
					poleStart,
					flagStart,
					flagEnd,
					poleBars,
					flagBars,
					poleMove,
					poleStartBar,
					poleEndBar,
					poleStartPrice,
					poleEndPrice,
					flagSlope,
					earlyRange,
					lateRange,
					contracts,
					flagRange,
					compact,
					score,
				});
			}
		}
	}

	return out.sort((a, b) => b.score - a.score);
}

export function flagBoundaryPoints(flagBars: NormalizedBar[]): {
	upperA: {timeSec: number; price: number; label: string; role: string};
	upperB: {timeSec: number; price: number; label: string; role: string};
	lowerA: {timeSec: number; price: number; label: string; role: string};
	lowerB: {timeSec: number; price: number; label: string; role: string};
} {
	const tStart = flagBars[0]!.timeSec;
	const tEnd = flagBars.at(-1)!.timeSec;
	const earlyHigh = Math.max(...flagBars.slice(0, 2).map(b => b.high));
	const earlyLow = Math.min(...flagBars.slice(0, 2).map(b => b.low));
	const lateHigh = Math.max(...flagBars.slice(-2).map(b => b.high));
	const lateLow = Math.min(...flagBars.slice(-2).map(b => b.low));
	return {
		upperA: {timeSec: tStart, price: earlyHigh, label: 'R1', role: 'resistance'},
		upperB: {timeSec: tEnd, price: lateHigh, label: 'R2', role: 'resistance'},
		lowerA: {timeSec: tStart, price: earlyLow, label: 'S1', role: 'support'},
		lowerB: {timeSec: tEnd, price: lateLow, label: 'S2', role: 'support'},
	};
}
