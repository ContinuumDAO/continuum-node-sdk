import type {KeyLevel} from '../levels/key-levels.js';

export type KeyLevelSwingKind = 'support' | 'resistance';
export type KeyLevelRole = 'support' | 'resistance';
export type KeyLevelFibPairKind = 'strongest_bracket';

/** Per-leg key-level confidence gate for Fib strongest-bracket (strength/100). */
export const DEFAULT_FIB_KEY_LEVEL_MIN_CONFIDENCE = 0.35;

export type KeyLevelMenuEntry = {
	index: number;
	levelNumber: number;
	/** Positional role vs last close (what the level acts as now). */
	kind: KeyLevelRole;
	/** Swing origin from pivot detection (metadata). */
	swingKind: KeyLevelSwingKind;
	/** True when swingKind differs from kind (broken flip). */
	isRoleFlipped: boolean;
	price: number;
	strength: number;
	touchCount: number;
	distancePct: number;
	isPrimary: boolean;
	isNearestSupport: boolean;
	isNearestResistance: boolean;
};

export type KeyLevelFibPair = {
	pairNumber: number;
	pairKind: KeyLevelFibPairKind;
	lowLevelNumber: number;
	highLevelNumber: number;
	low: number;
	high: number;
	/** Last close at pair build is at or above range midpoint (not Fib chart orientation). */
	closeAboveMid: boolean;
	/** Fib overlay orientation: `down` → 0% at low / 100% at high; `up` → inverted. */
	chartFibTrend: 'up' | 'down';
	retracement618: number;
	isPrimaryTradePair?: boolean;
};

export function keyLevelConfidenceFromStrength(strength: number): number {
	return Math.min(1, Math.max(0, strength) / 100);
}

export function keyLevelRoleForPrice(
	swingKind: KeyLevelSwingKind,
	price: number,
	lastClose: number,
): KeyLevelRole {
	if (price < lastClose) {
		return 'support';
	}
	if (price > lastClose) {
		return 'resistance';
	}
	return swingKind;
}

export function keyLevelMenuDisplayLabel(
	role: KeyLevelRole,
	levelNumber: number,
	price: number,
	swingKind?: KeyLevelSwingKind,
): string {
	const priceText = price.toFixed(2);
	if (swingKind && swingKind !== role) {
		if (role === 'support' && swingKind === 'resistance') {
			return `Level #${levelNumber} Broken resistance (support) @ ${priceText}`;
		}
		if (role === 'resistance' && swingKind === 'support') {
			return `Level #${levelNumber} Broken support (resistance) @ ${priceText}`;
		}
	}
	const kindLabel = role === 'support' ? 'Support' : 'Resistance';
	return `Level #${levelNumber} ${kindLabel} @ ${priceText}`;
}

/** @deprecated Use keyLevelMenuDisplayLabel — kept for callers passing role-only. */
export function keyLevelMenuLabel(kind: KeyLevelRole, levelNumber: number, price: number): string {
	return keyLevelMenuDisplayLabel(kind, levelNumber, price);
}

export function fibPairOverlayId(lowLevelNumber: number, highLevelNumber: number): string {
	return `KeyFib #${lowLevelNumber}-#${highLevelNumber}`;
}

function distancePctFromClose(price: number, lastClose: number): number {
	if (!Number.isFinite(lastClose) || lastClose === 0) {
		return 0;
	}
	return ((price - lastClose) / lastClose) * 100;
}

export function buildKeyLevelMenu(levels: KeyLevel[], lastClose: number): KeyLevelMenuEntry[] {
	if (!levels.length) {
		return [];
	}
	const primaryStrength = levels[0]?.strength ?? 0;

	const entries: KeyLevelMenuEntry[] = levels.map((level, index) => {
		const swingKind = level.kind;
		const kind = keyLevelRoleForPrice(swingKind, level.price, lastClose);
		return {
			index,
			levelNumber: index + 1,
			kind,
			swingKind,
			isRoleFlipped: swingKind !== kind,
			price: level.price,
			strength: level.strength,
			touchCount: level.touchCount,
			distancePct: distancePctFromClose(level.price, lastClose),
			isPrimary: false,
			isNearestSupport: false,
			isNearestResistance: false,
		};
	});

	const supportsBelow = entries
		.filter(row => row.kind === 'support' && row.price <= lastClose)
		.sort((a, b) => b.price - a.price);
	const resistancesAbove = entries
		.filter(row => row.kind === 'resistance' && row.price >= lastClose)
		.sort((a, b) => a.price - b.price);
	const nearestSupport = supportsBelow[0];
	const nearestResistance = resistancesAbove[0];

	return entries.map(entry => ({
		...entry,
		isPrimary: entry.index === 0 || Math.abs(entry.strength - primaryStrength) < 1e-9,
		isNearestSupport: nearestSupport != null && nearestSupport.levelNumber === entry.levelNumber,
		isNearestResistance:
			nearestResistance != null && nearestResistance.levelNumber === entry.levelNumber,
	}));
}

export function pickKeyLevelByNumber(menu: KeyLevelMenuEntry[], levelNumber: number): KeyLevelMenuEntry | undefined {
	if (levelNumber < 1 || levelNumber > menu.length) {
		return undefined;
	}
	return menu[levelNumber - 1];
}

function fibRetracement618(low: number, high: number): number {
	const range = high - low;
	if (!Number.isFinite(range) || range <= 0) {
		return low;
	}
	return low + range * 0.618;
}

/** Fib overlay orientation for fast-technical-indicators (0 at low when `down`, 0 at high when `up`). */
export function resolveChartFibTrendForClose(
	close: number,
	low: number,
	high: number,
	retracement618: number,
): 'up' | 'down' {
	if (!(low < close && close < high)) {
		return 'down';
	}
	return close >= retracement618 ? 'down' : 'up';
}

function pickStrongestLevelNearClose(
	candidates: KeyLevelMenuEntry[],
	lastClose: number,
): KeyLevelMenuEntry | undefined {
	if (!candidates.length) {
		return undefined;
	}
	return [...candidates].sort((a, b) => {
		if (b.strength !== a.strength) {
			return b.strength - a.strength;
		}
		return Math.abs(a.price - lastClose) - Math.abs(b.price - lastClose);
	})[0];
}

export function pickStrongestBracketLevels(
	menu: KeyLevelMenuEntry[],
	lastClose: number,
	minConfidence: number = DEFAULT_FIB_KEY_LEVEL_MIN_CONFIDENCE,
): {low: KeyLevelMenuEntry; high: KeyLevelMenuEntry} | null {
	const below = menu.filter(row => row.price < lastClose);
	const above = menu.filter(row => row.price > lastClose);
	const low = pickStrongestLevelNearClose(below, lastClose);
	const high = pickStrongestLevelNearClose(above, lastClose);
	if (!low || !high || low.price >= high.price) {
		return null;
	}
	if (keyLevelConfidenceFromStrength(low.strength) < minConfidence) {
		return null;
	}
	if (keyLevelConfidenceFromStrength(high.strength) < minConfidence) {
		return null;
	}
	return {low, high};
}

function makeFibPair(
	low: KeyLevelMenuEntry,
	high: KeyLevelMenuEntry,
	lastClose: number,
): KeyLevelFibPair {
	const lowPrice = low.price;
	const highPrice = high.price;
	const mid = (lowPrice + highPrice) / 2;
	const closeAboveMid = lastClose >= mid;
	const retracement618 = fibRetracement618(lowPrice, highPrice);
	const chartFibTrend = resolveChartFibTrendForClose(
		lastClose,
		lowPrice,
		highPrice,
		retracement618,
	);
	return {
		pairNumber: 1,
		pairKind: 'strongest_bracket',
		lowLevelNumber: low.levelNumber,
		highLevelNumber: high.levelNumber,
		low: lowPrice,
		high: highPrice,
		closeAboveMid,
		chartFibTrend,
		retracement618,
		isPrimaryTradePair: true,
	};
}

/**
 * Fib pairs: at most one strongest-bracket range = strongest key level below last close
 * × strongest key level above last close, when both legs meet minConfidence (strength/100).
 */
export function buildKeyLevelFibPairs(
	menu: KeyLevelMenuEntry[],
	lastClose: number,
	options?: {minConfidence?: number},
): KeyLevelFibPair[] {
	if (menu.length < 2) {
		return [];
	}
	const minConfidence = options?.minConfidence ?? DEFAULT_FIB_KEY_LEVEL_MIN_CONFIDENCE;
	const bracket = pickStrongestBracketLevels(menu, lastClose, minConfidence);
	if (!bracket) {
		return [];
	}
	return [makeFibPair(bracket.low, bracket.high, lastClose)];
}

export function pickPrimaryFibPair(pairs: KeyLevelFibPair[]): KeyLevelFibPair | null {
	return pairs.find(p => p.pairKind === 'strongest_bracket') ?? pairs[0] ?? null;
}

export function pickStrongestBracketFibPair(pairs: KeyLevelFibPair[]): KeyLevelFibPair | null {
	return pairs.find(p => p.pairKind === 'strongest_bracket') ?? null;
}

export function pickFibPairByNumber(pairs: KeyLevelFibPair[], pairNumber: number): KeyLevelFibPair | undefined {
	return pairs.find(p => p.pairNumber === pairNumber);
}

export function fibPairForLevel(pairs: KeyLevelFibPair[], levelNumber: number): KeyLevelFibPair | undefined {
	return pairs.find(
		p => p.lowLevelNumber === levelNumber || p.highLevelNumber === levelNumber,
	);
}

export type KeyLevelsTradeSetupForDraw = {
	levelNumber?: number | null;
	targetSource?: string;
	targetPrice?: number;
	targetLabel?: string;
	fibPairNumber?: number;
	fibRangeInverted?: boolean;
	insideSubRegime?: 'upper_half' | 'lower_half';
	priceRegime?: 'inside_range';
};

/** When nearest trade setup targets the next menu level, return that row for chart apply. */
export function resolveNextLevelTargetForDraw(
	menu: KeyLevelMenuEntry[],
	setup: KeyLevelsTradeSetupForDraw | null | undefined,
	appliedLevelNumber: number | undefined,
): KeyLevelMenuEntry | null {
	if (!setup || appliedLevelNumber == null) {
		return null;
	}
	const setupLevel = setup.levelNumber;
	if (typeof setupLevel === 'number' && setupLevel !== appliedLevelNumber) {
		return null;
	}
	if (
		setup.targetSource !== 'next_level' ||
		setup.targetPrice == null ||
		!Number.isFinite(setup.targetPrice)
	) {
		return null;
	}
	const price = setup.targetPrice;
	return menu.find(m => Math.abs(m.price - price) < 1e-6) ?? null;
}

/** Fallback target line when the next level is not a ranked menu row. */
export function nextLevelTargetLineLabel(setup: KeyLevelsTradeSetupForDraw): string {
	const price = setup.targetPrice!;
	const base = setup.targetLabel?.trim() || 'target';
	return `Target — ${base} @ ${price.toFixed(2)}`;
}
