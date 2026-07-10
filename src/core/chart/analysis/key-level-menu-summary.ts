import type {KeyLevel} from '../levels/key-levels.js';

export type KeyLevelMenuEntry = {
	index: number;
	levelNumber: number;
	kind: 'support' | 'resistance';
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

export function keyLevelMenuLabel(kind: 'support' | 'resistance', levelNumber: number, price: number): string {
	const kindLabel = kind === 'support' ? 'Support' : 'Resistance';
	return `Level #${levelNumber} ${kindLabel} @ ${price.toFixed(2)}`;
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
	const supports = levels.filter(l => l.kind === 'support' && l.price <= lastClose);
	const resistances = levels.filter(l => l.kind === 'resistance' && l.price >= lastClose);
	const nearestSupport = supports.sort((a, b) => b.price - a.price)[0];
	const nearestResistance = resistances.sort((a, b) => a.price - b.price)[0];

	return levels.map((level, index) => ({
		index,
		levelNumber: index + 1,
		kind: level.kind,
		price: level.price,
		strength: level.strength,
		touchCount: level.touchCount,
		distancePct: distancePctFromClose(level.price, lastClose),
		isPrimary: index === 0 || Math.abs(level.strength - primaryStrength) < 1e-9,
		isNearestSupport: nearestSupport != null && nearestSupport.price === level.price,
		isNearestResistance: nearestResistance != null && nearestResistance.price === level.price,
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

/** Adjacent support/resistance brackets from ranked menu levels. */
export function buildKeyLevelFibPairs(
	menu: KeyLevelMenuEntry[],
	lastClose: number,
	tradeAnchorLevelNumber?: number | null,
): KeyLevelFibPair[] {
	if (menu.length < 2) {
		return [];
	}
	const supports = menu.filter(row => row.kind === 'support').sort((a, b) => a.price - b.price);
	const resistances = menu.filter(row => row.kind === 'resistance').sort((a, b) => a.price - b.price);
	const pairs: KeyLevelFibPair[] = [];
	let pairNumber = 0;

	for (const resistance of resistances) {
		const supportBelow = [...supports].reverse().find(s => s.price < resistance.price);
		if (!supportBelow) {
			continue;
		}
		pairNumber++;
		const low = supportBelow.price;
		const high = resistance.price;
		const mid = (low + high) / 2;
		const trend: 'up' | 'down' = lastClose >= mid ? 'up' : 'down';
		const ext = fibExtensionPrices(low, high);
		const bracketsTrade =
			tradeAnchorLevelNumber != null &&
			(tradeAnchorLevelNumber === supportBelow.levelNumber ||
				tradeAnchorLevelNumber === resistance.levelNumber);
		pairs.push({
			pairNumber,
			lowLevelNumber: supportBelow.levelNumber,
			highLevelNumber: resistance.levelNumber,
			low,
			high,
			trend,
			...ext,
			...(bracketsTrade ? {isPrimaryTradePair: true} : {}),
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
	return pairs.find(p => p.isPrimaryTradePair) ?? pairs[0] ?? null;
}

export function fibPairForLevel(pairs: KeyLevelFibPair[], levelNumber: number): KeyLevelFibPair | undefined {
	return pairs.find(
		p => p.lowLevelNumber === levelNumber || p.highLevelNumber === levelNumber,
	);
}

export function fibExtensionLineLabel(lowLevelNumber: number, highLevelNumber: number): string {
	return `Fib 1.618 ext #${lowLevelNumber}-#${highLevelNumber}`;
}

export type KeyLevelsTradeSetupForDraw = {
	targetSource?: string;
	targetPrice?: number;
	fibPairNumber?: number;
	breakRetestAlternative?: {
		targetSource?: string;
		targetPrice?: number;
		fibPairNumber?: number;
	} | null;
};

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
		fibPairNumber != null ? fibPairNumber === pair.pairNumber : primaryFallback || pair.isPrimaryTradePair === true;

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
