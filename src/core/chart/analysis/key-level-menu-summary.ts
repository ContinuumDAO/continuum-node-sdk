import type {KeyLevel} from '../levels/key-levels.js';

export type KeyLevelSwingKind = 'support' | 'resistance';
export type KeyLevelRole = 'support' | 'resistance';
export type KeyLevelFibPairKind = 'primary_range' | 'concentric';

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
	/** 1 = outermost concentric pair (lowest support + highest resistance). */
	concentricRank?: number;
	lowLevelNumber: number;
	highLevelNumber: number;
	low: number;
	high: number;
	trend: 'up' | 'down';
	retracement618: number;
	extension1618Up: number;
	extension1618Down: number;
	isPrimaryTradePair?: boolean;
};

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

function fibExtensionPrices(low: number, high: number): {
	retracement618: number;
	extension1618Up: number;
	extension1618Down: number;
} {
	const range = high - low;
	if (!Number.isFinite(range) || range <= 0) {
		return {retracement618: low, extension1618Up: high, extension1618Down: low};
	}
	return {
		retracement618: low + range * 0.618,
		extension1618Up: low + range * 1.618,
		extension1618Down: high - range * 1.618,
	};
}

function pairKey(lowLevelNumber: number, highLevelNumber: number): string {
	return `${lowLevelNumber}:${highLevelNumber}`;
}

function appendFibPair(
	pairs: KeyLevelFibPair[],
	seen: Set<string>,
	input: {
		pairKind: KeyLevelFibPairKind;
		concentricRank?: number;
		low: KeyLevelMenuEntry;
		high: KeyLevelMenuEntry;
		lastClose: number;
		isPrimaryTradePair?: boolean;
	},
): void {
	if (input.low.price >= input.high.price) {
		return;
	}
	const key = pairKey(input.low.levelNumber, input.high.levelNumber);
	if (seen.has(key)) {
		return;
	}
	seen.add(key);
	const low = input.low.price;
	const high = input.high.price;
	const mid = (low + high) / 2;
	const trend: 'up' | 'down' = input.lastClose >= mid ? 'up' : 'down';
	const ext = fibExtensionPrices(low, high);
	pairs.push({
		pairNumber: pairs.length + 1,
		pairKind: input.pairKind,
		...(input.concentricRank != null ? {concentricRank: input.concentricRank} : {}),
		lowLevelNumber: input.low.levelNumber,
		highLevelNumber: input.high.levelNumber,
		low,
		high,
		trend,
		...ext,
		...(input.isPrimaryTradePair ? {isPrimaryTradePair: true} : {}),
	});
}

/**
 * Fib pairs: (1) primary range = nearest support below close + nearest resistance above close (positional role);
 * (2) concentric ranked pairs = lowest swing support with highest swing resistance, then 2nd-lowest with 2nd-highest, etc.
 */
export function buildKeyLevelFibPairs(
	menu: KeyLevelMenuEntry[],
	lastClose: number,
	tradeAnchorLevelNumber?: number | null,
): KeyLevelFibPair[] {
	if (menu.length < 2) {
		return [];
	}

	const pairs: KeyLevelFibPair[] = [];
	const seen = new Set<string>();

	const swingSupports = menu.filter(row => row.swingKind === 'support').sort((a, b) => a.price - b.price);
	const swingResistances = menu.filter(row => row.swingKind === 'resistance').sort((a, b) => b.price - a.price);

	const nearestSupport = menu.find(row => row.isNearestSupport);
	const nearestResistance = menu.find(row => row.isNearestResistance);
	if (nearestSupport && nearestResistance && nearestSupport.price < nearestResistance.price) {
		appendFibPair(pairs, seen, {
			pairKind: 'primary_range',
			low: nearestSupport,
			high: nearestResistance,
			lastClose,
		});
	}

	const concentricCount = Math.min(swingSupports.length, swingResistances.length);
	for (let i = 0; i < concentricCount; i++) {
		appendFibPair(pairs, seen, {
			pairKind: 'concentric',
			concentricRank: i + 1,
			low: swingSupports[i]!,
			high: swingResistances[i]!,
			lastClose,
		});
	}

	if (tradeAnchorLevelNumber != null && !pairs.some(p => p.isPrimaryTradePair)) {
		const anchor = pickKeyLevelByNumber(menu, tradeAnchorLevelNumber);
		if (anchor) {
			let best: KeyLevelFibPair | null = null;
			let bestDist = Number.POSITIVE_INFINITY;
			for (const pair of pairs) {
				if (anchor.price >= pair.low && anchor.price <= pair.high) {
					best = pair;
					break;
				}
				const dist = Math.min(Math.abs(anchor.price - pair.low), Math.abs(anchor.price - pair.high));
				if (dist < bestDist) {
					bestDist = dist;
					best = pair;
				}
			}
			if (best) {
				best.isPrimaryTradePair = true;
			}
		}
	}

	return pairs;
}

export function pickPrimaryFibPair(pairs: KeyLevelFibPair[]): KeyLevelFibPair | null {
	return pickOuterConcentricFibPair(pairs) ?? pairs.find(p => p.pairKind === 'primary_range') ?? pairs[0] ?? null;
}

/** Outermost concentric pair (lowest swing support + highest swing resistance) for Fib retrace trade. */
export function pickOuterConcentricFibPair(pairs: KeyLevelFibPair[]): KeyLevelFibPair | null {
	return (
		pairs.find(p => p.pairKind === 'concentric' && p.concentricRank === 1) ??
		pairs.find(p => p.pairKind === 'concentric') ??
		null
	);
}

export function pickFibPairByNumber(pairs: KeyLevelFibPair[], pairNumber: number): KeyLevelFibPair | undefined {
	return pairs.find(p => p.pairNumber === pairNumber);
}

export function fibPairForLevel(pairs: KeyLevelFibPair[], levelNumber: number): KeyLevelFibPair | undefined {
	const containing = pairs.filter(
		p => p.lowLevelNumber === levelNumber || p.highLevelNumber === levelNumber,
	);
	return (
		containing.find(p => p.pairKind === 'concentric' && p.concentricRank === 1) ??
		containing.find(p => p.pairKind === 'concentric') ??
		containing.find(p => p.pairKind === 'primary_range') ??
		containing[0]
	);
}

export function fibExtensionLineLabel(lowLevelNumber: number, highLevelNumber: number): string {
	return `Fib 1.618 ext #${lowLevelNumber}-#${highLevelNumber}`;
}

export type KeyLevelsTradeSetupForDraw = {
	levelNumber?: number | null;
	targetSource?: string;
	targetPrice?: number;
	targetLabel?: string;
	fibPairNumber?: number;
	fibRangeInverted?: boolean;
	insideSubRegime?: 'upper_half' | 'lower_half';
	priceRegime?: 'inside_range' | 'above_range' | 'below_range';
	breakRetestAlternative?: {
		targetSource?: string;
		targetPrice?: number;
		fibPairNumber?: number;
	} | null;
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

/** When analysis targets a fib 1.618 extension for this pair, return the chart line to draw. */
export function resolveFibExtensionTargetLine(
	setup: KeyLevelsTradeSetupForDraw | null | undefined,
	pair: KeyLevelFibPair,
): {price: number; label: string} | null {
	if (!setup) {
		return null;
	}
	const label = fibExtensionLineLabel(pair.lowLevelNumber, pair.highLevelNumber);

	const pairMatches = (fibPairNumber: number | undefined, primaryFallback: boolean) =>
		fibPairNumber != null ?
			fibPairNumber === pair.pairNumber
		:	primaryFallback || pair.isPrimaryTradePair === true;

	if (
		setup.targetSource === 'fib_extension' &&
		setup.targetPrice != null &&
		Number.isFinite(setup.targetPrice) &&
		pairMatches(setup.fibPairNumber, true)
	) {
		return {price: setup.targetPrice, label};
	}

	const alt = setup.breakRetestAlternative;
	if (
		alt?.targetSource === 'fib_extension' &&
		alt.targetPrice != null &&
		Number.isFinite(alt.targetPrice) &&
		pairMatches(alt.fibPairNumber, false)
	) {
		return {price: alt.targetPrice, label};
	}

	return null;
}
