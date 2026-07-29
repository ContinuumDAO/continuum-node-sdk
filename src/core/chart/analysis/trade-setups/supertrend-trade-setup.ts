import type {EntryOffsetMode} from './pattern-limit-entry.js';
import type {TradeSetupSide, TradeSetupStatus} from './shared.js';
import {isFiniteTradePrice} from './shared.js';
import {tradeDeskConfig} from './trade-desk-defaults.js';

export const DEFAULT_SUPERTREND_PERIOD = 10;
export const DEFAULT_SUPERTREND_MULTIPLIER = 3;
export const DEFAULT_SUPERTREND_ENTRY_MODE = 'flip' as const;
export const DEFAULT_SUPERTREND_TARGET_ATR_MULTIPLE = 3;
export const DEFAULT_SUPERTREND_FLIP_LOOKBACK = 5;

export type SupertrendEntryMode = 'flip' | 'retest';

export type SupertrendPoint = {
	supertrend: number;
	direction: number;
};

export type SupertrendTradeSetup = {
	status: TradeSetupStatus;
	source: 'supertrend';
	entryMode: SupertrendEntryMode;
	lastClose: number;
	supertrend: number;
	direction: number;
	period: number;
	multiplier: number;
	entryProximityPct: number;
	entryOffsetMode: EntryOffsetMode;
	entryOffsetPct: number;
	invalidationOffsetPct: number;
	atrAtLastBar?: number;
	targetAtrMultiple: number;
	setupPurposeCode: string;
	invalidated: boolean;
	side: TradeSetupSide;
	flippedOnLastBar: boolean;
	barsSinceFlip: number | null;
	entryPrice?: number;
	entryLabel?: string;
	targetPrice?: number;
	targetLabel?: string;
	invalidationPrice?: number;
	invalidationLabel?: string;
	conditionalNote: string;
	confidence: number;
	unclearReason?: string;
	flipAlternative?: SupertrendTradeSetup | null;
	retestAlternative?: SupertrendTradeSetup | null;
};

function withinPriceProximity(
	lastClose: number,
	entryPrice: number,
	proximityPct: number,
): boolean {
	if (!isFiniteTradePrice(lastClose) || !isFiniteTradePrice(entryPrice) || entryPrice === 0) {
		return false;
	}
	return (Math.abs(lastClose - entryPrice) / Math.abs(entryPrice)) * 100 <= proximityPct;
}

function resolveTargetAtrMultiple(raw: number | undefined): number {
	if (raw != null && Number.isFinite(raw) && raw > 0) {
		return raw;
	}
	return DEFAULT_SUPERTREND_TARGET_ATR_MULTIPLE;
}

function atrTargetAndStop(input: {
	side: TradeSetupSide;
	status: TradeSetupStatus;
	entryPrice: number | undefined;
	supertrend: number;
	atr: number | null | undefined;
	targetAtrMultiple: number;
}): {
	targetPrice?: number;
	targetLabel?: string;
	invalidationPrice?: number;
	invalidationLabel?: string;
} {
	if (input.status !== 'clear' || (input.side !== 'long' && input.side !== 'short')) {
		return {};
	}
	const invalidationPrice = isFiniteTradePrice(input.supertrend) ? input.supertrend : undefined;
	const invalidationLabel =
		invalidationPrice != null ? 'Supertrend trail' : undefined;
	const atr = input.atr;
	const multiple = input.targetAtrMultiple;
	let targetPrice: number | undefined;
	let targetLabel: string | undefined;
	if (
		input.entryPrice != null &&
		isFiniteTradePrice(input.entryPrice) &&
		atr != null &&
		Number.isFinite(atr) &&
		atr > 0
	) {
		const distance = multiple * atr;
		targetPrice =
			input.side === 'long' ? input.entryPrice + distance : input.entryPrice - distance;
		targetLabel = `${multiple}× ATR from entry`;
	}
	return {
		...(targetPrice != null && targetLabel ? {targetPrice, targetLabel} : {}),
		...(invalidationPrice != null && invalidationLabel
			? {invalidationPrice, invalidationLabel}
			: {}),
	};
}

function findBarsSinceFlip(points: Array<SupertrendPoint | null>): number | null {
	let lastDir: number | null = null;
	let lastFlipAt: number | null = null;
	for (let i = 0; i < points.length; i++) {
		const p = points[i];
		if (p == null || !isFiniteTradePrice(p.supertrend)) {
			continue;
		}
		const dir = p.direction >= 0 ? 1 : -1;
		if (lastDir != null && dir !== lastDir) {
			lastFlipAt = i;
		}
		lastDir = dir;
	}
	if (lastFlipAt == null) {
		return null;
	}
	return points.length - 1 - lastFlipAt;
}

export function buildFlipSupertrendSetup(input: {
	lastClose: number;
	supertrend: number;
	direction: number;
	prevDirection: number | null;
	barsSinceFlip: number | null;
	period: number;
	multiplier: number;
	entryProximityPct?: number;
	entryOffsetPct?: number;
	invalidationOffsetPct?: number;
	atr?: number | null;
	targetAtrMultiple?: number;
	flipLookback?: number;
}): SupertrendTradeSetup | null {
	const {lastClose, supertrend, direction, period, multiplier} = input;
	if (![lastClose, supertrend].every(isFiniteTradePrice) || direction === 0) {
		return null;
	}
	const desk = tradeDeskConfig({
		entryProximityPct: input.entryProximityPct,
		entryOffsetPct: input.entryOffsetPct,
		invalidationOffsetPct: input.invalidationOffsetPct,
	});
	const targetAtrMultiple = resolveTargetAtrMultiple(input.targetAtrMultiple);
	const atr =
		input.atr != null && Number.isFinite(input.atr) && input.atr > 0 ? input.atr : undefined;
	const lookback = input.flipLookback ?? DEFAULT_SUPERTREND_FLIP_LOOKBACK;
	const dir = direction >= 0 ? 1 : -1;
	const side: TradeSetupSide = dir > 0 ? 'long' : 'short';
	const flippedOnLastBar =
		input.prevDirection != null && (input.prevDirection >= 0 ? 1 : -1) !== dir;
	const barsSinceFlip = input.barsSinceFlip;
	const freshFlip =
		flippedOnLastBar || (barsSinceFlip != null && barsSinceFlip >= 0 && barsSinceFlip <= lookback);

	let status: TradeSetupStatus = 'unclear';
	let confidence = 0.4;
	let conditionalNote = 'No recent Supertrend flip — wait for direction change.';
	let unclearReason = 'No fresh Supertrend flip within lookback.';

	if (freshFlip) {
		const near = withinPriceProximity(lastClose, supertrend, desk.entryProximityPct * 3) ||
			withinPriceProximity(lastClose, lastClose, desk.entryProximityPct);
		if (flippedOnLastBar || near || (barsSinceFlip != null && barsSinceFlip <= 1)) {
			status = 'clear';
			unclearReason = '';
			confidence = flippedOnLastBar ? 0.62 : 0.55;
			conditionalNote = flippedOnLastBar
				? `Fresh Supertrend flip to ${side === 'long' ? 'bullish' : 'bearish'}.`
				: `Recent Supertrend flip to ${side === 'long' ? 'bullish' : 'bearish'} (${barsSinceFlip} bars ago).`;
		} else {
			unclearReason = `Flip aged ${barsSinceFlip} bars — price not near Supertrend trail.`;
			conditionalNote = unclearReason;
		}
	}

	const entryPrice = status === 'clear' ? lastClose : undefined;
	const entryLabel = status === 'clear' ? 'last close (flip)' : undefined;
	const levels = atrTargetAndStop({
		side,
		status,
		entryPrice,
		supertrend,
		atr,
		targetAtrMultiple,
	});

	return {
		status,
		source: 'supertrend',
		entryMode: 'flip',
		lastClose,
		supertrend,
		direction: dir,
		period,
		multiplier,
		entryProximityPct: desk.entryProximityPct,
		entryOffsetMode: 'bounce',
		entryOffsetPct: desk.entryOffsetPct,
		invalidationOffsetPct: desk.invalidationOffsetPct,
		targetAtrMultiple,
		setupPurposeCode: 'st-flip',
		invalidated: false,
		side,
		flippedOnLastBar,
		barsSinceFlip,
		conditionalNote,
		confidence,
		...(atr != null ? {atrAtLastBar: atr} : {}),
		...(entryPrice != null && entryLabel ? {entryPrice, entryLabel} : {}),
		...levels,
		...(unclearReason ? {unclearReason} : {}),
	};
}

export function buildRetestSupertrendSetup(input: {
	lastClose: number;
	supertrend: number;
	direction: number;
	barsSinceFlip: number | null;
	period: number;
	multiplier: number;
	entryProximityPct?: number;
	entryOffsetPct?: number;
	invalidationOffsetPct?: number;
	atr?: number | null;
	targetAtrMultiple?: number;
}): SupertrendTradeSetup | null {
	const {lastClose, supertrend, direction, period, multiplier} = input;
	if (![lastClose, supertrend].every(isFiniteTradePrice) || direction === 0) {
		return null;
	}
	const desk = tradeDeskConfig({
		entryProximityPct: input.entryProximityPct,
		entryOffsetPct: input.entryOffsetPct,
		invalidationOffsetPct: input.invalidationOffsetPct,
	});
	const targetAtrMultiple = resolveTargetAtrMultiple(input.targetAtrMultiple);
	const atr =
		input.atr != null && Number.isFinite(input.atr) && input.atr > 0 ? input.atr : undefined;
	const dir = direction >= 0 ? 1 : -1;
	const side: TradeSetupSide = dir > 0 ? 'long' : 'short';
	const priceOk =
		(side === 'long' && lastClose >= supertrend) || (side === 'short' && lastClose <= supertrend);
	const near = withinPriceProximity(lastClose, supertrend, desk.entryProximityPct);

	let status: TradeSetupStatus = 'unclear';
	let confidence = 0.4;
	let conditionalNote = 'Price not retesting Supertrend in trend direction.';
	let unclearReason = conditionalNote;
	let invalidated = false;
	let setupSide: TradeSetupSide = side;

	if (!priceOk) {
		invalidated = true;
		setupSide = 'neutral';
		unclearReason = 'Close on wrong side of Supertrend — trail broken.';
		conditionalNote = unclearReason;
	} else if (near) {
		status = 'clear';
		unclearReason = '';
		confidence = 0.56;
		conditionalNote = `${side === 'long' ? 'Bullish' : 'Bearish'} Supertrend retest — price near trail.`;
	} else {
		unclearReason = `Price holding ${side} of Supertrend but not within ${desk.entryProximityPct}% of trail.`;
		conditionalNote = unclearReason;
	}

	const entryPrice = status === 'clear' ? supertrend : undefined;
	const entryLabel = status === 'clear' ? 'Supertrend trail' : undefined;
	const levels = atrTargetAndStop({
		side: setupSide,
		status,
		entryPrice,
		supertrend,
		atr,
		targetAtrMultiple,
	});

	return {
		status: invalidated ? 'unclear' : status,
		source: 'supertrend',
		entryMode: 'retest',
		lastClose,
		supertrend,
		direction: dir,
		period,
		multiplier,
		entryProximityPct: desk.entryProximityPct,
		entryOffsetMode: 'retest',
		entryOffsetPct: desk.entryOffsetPct,
		invalidationOffsetPct: desk.invalidationOffsetPct,
		targetAtrMultiple,
		setupPurposeCode: 'st-ret',
		invalidated,
		side: setupSide,
		flippedOnLastBar: false,
		barsSinceFlip: input.barsSinceFlip,
		conditionalNote,
		confidence: invalidated ? 0.3 : confidence,
		...(atr != null ? {atrAtLastBar: atr} : {}),
		...(entryPrice != null && entryLabel ? {entryPrice, entryLabel} : {}),
		...levels,
		...(unclearReason ? {unclearReason} : {}),
	};
}

export function buildSupertrendTradeSetup(input: {
	closes: number[];
	points: Array<SupertrendPoint | null>;
	period: number;
	multiplier: number;
	entryMode?: SupertrendEntryMode;
	entryProximityPct?: number;
	entryOffsetPct?: number;
	invalidationOffsetPct?: number;
	atr?: number | null;
	targetAtrMultiple?: number;
}): SupertrendTradeSetup | null {
	const {closes, points, period, multiplier} = input;
	if (closes.length < 2 || points.length !== closes.length) {
		return null;
	}
	const lastIndex = closes.length - 1;
	const lastClose = closes[lastIndex]!;
	const current = points[lastIndex];
	const prior = points[lastIndex - 1];
	if (current == null) {
		return null;
	}
	const barsSinceFlip = findBarsSinceFlip(points);
	const entryMode = input.entryMode ?? DEFAULT_SUPERTREND_ENTRY_MODE;
	const shared = {
		lastClose,
		supertrend: current.supertrend,
		direction: current.direction,
		barsSinceFlip,
		period,
		multiplier,
		entryProximityPct: input.entryProximityPct,
		entryOffsetPct: input.entryOffsetPct,
		invalidationOffsetPct: input.invalidationOffsetPct,
		atr: input.atr,
		targetAtrMultiple: input.targetAtrMultiple,
	};

	const flip = buildFlipSupertrendSetup({
		...shared,
		prevDirection: prior?.direction ?? null,
	});
	const retest = buildRetestSupertrendSetup(shared);

	if (entryMode === 'retest') {
		if (!retest) {
			return flip;
		}
		return {...retest, flipAlternative: flip, retestAlternative: null};
	}
	if (!flip) {
		return retest;
	}
	return {...flip, retestAlternative: retest, flipAlternative: null};
}

export type SupertrendTradeIdeaContext = {
	period: number;
	multiplier: number;
	entryMode: SupertrendEntryMode;
	setupPurposeCode: string;
	supertrend: number;
	direction: number;
	invalidated: boolean;
	entryProximityPct: number;
	entryOffsetPct: number;
	invalidationOffsetPct: number;
	atrAtLastBar?: number;
	targetAtrMultiple: number;
};

export function supertrendTradeIdeaContextFromSetup(
	setup: SupertrendTradeSetup,
): SupertrendTradeIdeaContext {
	return {
		period: setup.period,
		multiplier: setup.multiplier,
		entryMode: setup.entryMode,
		setupPurposeCode: setup.setupPurposeCode,
		supertrend: setup.supertrend,
		direction: setup.direction,
		invalidated: setup.invalidated,
		entryProximityPct: setup.entryProximityPct,
		entryOffsetPct: setup.entryOffsetPct,
		invalidationOffsetPct: setup.invalidationOffsetPct,
		targetAtrMultiple: setup.targetAtrMultiple,
		...(setup.atrAtLastBar != null ? {atrAtLastBar: setup.atrAtLastBar} : {}),
	};
}

export function normalizeSupertrendTradeSetup(setup: SupertrendTradeSetup) {
	return {
		status: setup.status,
		side: setup.side,
		confidence: setup.confidence,
		lastClose: setup.lastClose,
		entry:
			setup.status === 'clear' &&
			setup.side !== 'neutral' &&
			setup.entryPrice != null &&
			isFiniteTradePrice(setup.entryPrice)
				? {price: setup.entryPrice, label: setup.entryLabel ?? 'Supertrend entry'}
				: undefined,
		...(setup.targetPrice != null && isFiniteTradePrice(setup.targetPrice)
			? {target: {price: setup.targetPrice, label: setup.targetLabel ?? 'Supertrend target'}}
			: {}),
		...(setup.invalidationPrice != null && isFiniteTradePrice(setup.invalidationPrice)
			? {
					invalidation: {
						price: setup.invalidationPrice,
						label: setup.invalidationLabel ?? 'Supertrend invalidation',
					},
				}
			: {}),
		unclearReason: setup.unclearReason,
	};
}
