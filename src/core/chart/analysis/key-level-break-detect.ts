import {coerceFiniteNumber} from '../point-normalize.js';
import {
	atrAtBreakout,
	DEFAULT_RETEST_ATR_MULTIPLIER,
	DEFAULT_RETEST_ATR_PERIOD,
	retestToleranceBands,
} from '../../chart-patterns/atr.js';
import type {KeyLevelMenuEntry} from './key-level-menu-summary.js';

export type KeyLevelBreakCandidate = {
	levelNumber: number;
	kind: 'support' | 'resistance';
	price: number;
	strength: number;
	touchCount: number;
	direction: 'bullish' | 'bearish';
	side: 'long' | 'short';
	breakIndex: number;
	breakBarTimeSec: number;
	hasRetestOnLastBar: boolean;
	retestPending: boolean;
	score: number;
};

const MAX_BREAKOUT_LOOKBACK = 30;
const MIN_MOVE_PCT = 0.005;
const DEFAULT_RETEST_TOLERANCE_PCT = 0.1;

type BarSlice = {
	close: number;
	high: number;
	low: number;
	timeSec: number;
};

function barsFromRows(bars: Record<string, unknown>[]): BarSlice[] {
	const out: BarSlice[] = [];
	for (const bar of bars) {
		const close = coerceFiniteNumber(bar.close);
		const high = coerceFiniteNumber(bar.high);
		const low = coerceFiniteNumber(bar.low);
		const time = coerceFiniteNumber(bar.time);
		if (close == null || high == null || low == null || time == null) {
			continue;
		}
		out.push({close, high, low, timeSec: time});
	}
	return out;
}

function normalizedBarsForAtr(bars: BarSlice[]): import('../../chart-patterns/types.js').NormalizedBar[] {
	return bars.map((b, index) => ({
		index,
		time: b.timeSec,
		timeSec: b.timeSec,
		open: b.close,
		high: b.high,
		low: b.low,
		close: b.close,
	}));
}

function detectBreakForLevel(
	menuEntry: KeyLevelMenuEntry,
	bars: BarSlice[],
	retestTolerancePct: number,
): KeyLevelBreakCandidate | null {
	const level = menuEntry.price;
	const start = Math.max(1, bars.length - MAX_BREAKOUT_LOOKBACK);
	let breakIndex = -1;
	let direction: 'bullish' | 'bearish' | null = null;

	if (menuEntry.kind === 'resistance') {
		for (let i = start; i < bars.length; i++) {
			const prev = bars[i - 1]!;
			const cur = bars[i]!;
			if (prev.close <= level && cur.close > level) {
				breakIndex = i;
				direction = 'bullish';
			}
		}
	} else {
		for (let i = start; i < bars.length; i++) {
			const prev = bars[i - 1]!;
			const cur = bars[i]!;
			if (prev.close >= level && cur.close < level) {
				breakIndex = i;
				direction = 'bearish';
			}
		}
	}

	if (breakIndex < 0 || direction == null) {
		return null;
	}

	const breakBar = bars[breakIndex]!;
	const norm = normalizedBarsForAtr(bars);
	const atr = atrAtBreakout(norm, breakIndex, DEFAULT_RETEST_ATR_PERIOD);

	let extremePrice = direction === 'bullish' ? breakBar.high : breakBar.low;
	for (let j = breakIndex; j < bars.length; j++) {
		if (direction === 'bullish') {
			extremePrice = Math.max(extremePrice, bars[j]!.high);
		} else {
			extremePrice = Math.min(extremePrice, bars[j]!.low);
		}
	}

	const move =
		direction === 'bullish'
			? extremePrice - breakBar.close
			: breakBar.close - extremePrice;
	if (move / Math.max(breakBar.close, 1e-8) < MIN_MOVE_PCT) {
		return null;
	}

	const bands = retestToleranceBands(move, retestTolerancePct, atr, DEFAULT_RETEST_ATR_MULTIPLIER);
	const lastBar = bars[bars.length - 1]!;
	const distToLevel = Math.abs(lastBar.close - level);
	const hasRetestOnLastBar = distToLevel <= bands.combined;

	return {
		levelNumber: menuEntry.levelNumber,
		kind: menuEntry.kind,
		price: level,
		strength: menuEntry.strength,
		touchCount: menuEntry.touchCount,
		direction,
		side: direction === 'bullish' ? 'long' : 'short',
		breakIndex,
		breakBarTimeSec: breakBar.timeSec,
		hasRetestOnLastBar,
		retestPending: !hasRetestOnLastBar,
		score: menuEntry.strength + (breakIndex / Math.max(bars.length, 1)) * 10,
	};
}

export function detectKeyLevelBreaks(
	menu: KeyLevelMenuEntry[],
	bars: Record<string, unknown>[],
	options?: {retestTolerancePct?: number},
): KeyLevelBreakCandidate[] {
	const slice = barsFromRows(bars);
	if (!slice.length || !menu.length) {
		return [];
	}
	const tolerance = options?.retestTolerancePct ?? DEFAULT_RETEST_TOLERANCE_PCT;
	const candidates: KeyLevelBreakCandidate[] = [];
	for (const entry of menu) {
		const hit = detectBreakForLevel(entry, slice, tolerance);
		if (hit) {
			candidates.push(hit);
		}
	}
	return candidates.sort((a, b) => b.strength - a.strength || b.score - a.score);
}

export function pickStrongestBreakCandidate(
	candidates: KeyLevelBreakCandidate[],
): KeyLevelBreakCandidate | null {
	return candidates[0] ?? null;
}

export function alternateBreakCandidatesForSkill(
	candidates: KeyLevelBreakCandidate[],
): Array<{
	levelNumber: number;
	kind: 'support' | 'resistance';
	strength: number;
	side: 'long' | 'short';
	selectionHint: 'strongest' | 'most_recent' | 'nearest_retest';
}> {
	if (!candidates.length) {
		return [];
	}
	const strongest = pickStrongestBreakCandidate(candidates)!;
	const mostRecent = [...candidates].sort((a, b) => b.breakIndex - a.breakIndex)[0]!;
	const nearestRetest = [...candidates].sort((a, b) => {
		if (a.hasRetestOnLastBar !== b.hasRetestOnLastBar) {
			return a.hasRetestOnLastBar ? -1 : 1;
		}
		return b.strength - a.strength;
	})[0]!;

	const out: Array<{
		levelNumber: number;
		kind: 'support' | 'resistance';
		strength: number;
		side: 'long' | 'short';
		selectionHint: 'strongest' | 'most_recent' | 'nearest_retest';
	}> = [
		{
			levelNumber: strongest.levelNumber,
			kind: strongest.kind,
			strength: strongest.strength,
			side: strongest.side,
			selectionHint: 'strongest',
		},
	];
	if (mostRecent.levelNumber !== strongest.levelNumber) {
		out.push({
			levelNumber: mostRecent.levelNumber,
			kind: mostRecent.kind,
			strength: mostRecent.strength,
			side: mostRecent.side,
			selectionHint: 'most_recent',
		});
	}
	if (
		nearestRetest.levelNumber !== strongest.levelNumber &&
		nearestRetest.levelNumber !== mostRecent.levelNumber
	) {
		out.push({
			levelNumber: nearestRetest.levelNumber,
			kind: nearestRetest.kind,
			strength: nearestRetest.strength,
			side: nearestRetest.side,
			selectionHint: 'nearest_retest',
		});
	}
	return out;
}
