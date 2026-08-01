import type {KeyLevelFibPair, KeyLevelMenuEntry} from '../key-level-menu-summary.js';
import {
	DEFAULT_FIB_KEY_LEVEL_MIN_CONFIDENCE,
	pickStrongestBracketFibPair,
} from '../key-level-menu-summary.js';
import {chartFibTrendForRange} from '../key-level-drawings-shared.js';
import type {EntryOffsetMode} from './pattern-limit-entry.js';
import type {TradeSetupSide, TradeSetupStatus} from './shared.js';
import {isFiniteTradePrice} from './shared.js';
import {assessTradeSetupEntryActionability} from './trade-entry-gates.js';
import {entryProximityAtrFromOhlcvRows} from './entry-proximity-atr.js';
import {
	tradeDeskConfig,
	type EntryProximityMode,
	type TradeDeskConfig,
} from './trade-desk-defaults.js';
import {tradeSetupPurposeCode} from './trade-purpose-format.js';

/** Valid strongest-bracket Fib setups always place last close between the legs. */
export type KeyLevelFibPriceRegime = 'inside_range';

export type KeyLevelFibTargetSource = 'retrace_618' | 'range_leg';

export type KeyLevelFibInsideSubRegime = 'upper_half' | 'lower_half';

export type KeyLevelFibSideVariant = {
	side: TradeSetupSide;
	entryPrice: number;
	entryLabel: string;
	targetPrice?: number;
	targetLabel?: string;
	targetSource?: KeyLevelFibTargetSource;
	invalidationPrice?: number;
	invalidationLabel?: string;
};

export type KeyLevelFibRetraceTradeSetup = {
	status: TradeSetupStatus;
	source: 'strongest_bracket';
	priceRegime: KeyLevelFibPriceRegime;
	/** When true, Fib 0 = range high and Fib 1 = range low. */
	fibRangeInverted?: boolean;
	insideSubRegime?: KeyLevelFibInsideSubRegime;
	defaultSide: 'long' | 'short';
	sideVariants?: {long: KeyLevelFibSideVariant; short: KeyLevelFibSideVariant};
	framing: 'retrace';
	entryOffsetMode: EntryOffsetMode;
	entryProximityPct: number;
	entryProximityMode?: EntryProximityMode;
	atrAtLastBar?: number;
	entryOffsetPct: number;
	invalidationOffsetPct: number;
	invalidationOffsetMode?: EntryProximityMode;
	fibPairNumber: number;
	lowLevelNumber: number;
	highLevelNumber: number;
	low: number;
	high: number;
	retracement618: number;
	/** Chart Fib overlay orientation (distinct from closeAboveMid on fib pair). */
	displayTrend: 'up' | 'down';
	lastClose: number;
	side: TradeSetupSide;
	entryPrice: number;
	entryLabel: string;
	targetPrice?: number;
	targetLabel?: string;
	targetSource?: KeyLevelFibTargetSource;
	invalidationPrice?: number;
	invalidationLabel?: string;
	setupPurposeCode: string;
	confidence: number;
	unclearReason?: string;
};

/** Inverted Fib 0.618 (0 = high, 1 = low). */
export function invertedFib618(low: number, high: number): number {
	const range = high - low;
	if (!Number.isFinite(range) || range <= 0) {
		return low;
	}
	return high - range * 0.618;
}

function validateFibTradeSetup(input: {
	close: number;
	side: TradeSetupSide;
	entryPrice: number;
	entryOffsetMode: EntryOffsetMode;
	targetPrice: number | undefined;
	invalidationPrice: number | undefined;
	confidence: number;
	minConfidence: number;
	entryProximityPct?: number;
	entryProximityMode?: EntryProximityMode;
	entryProximityAtr?: number | null;
	entryOffsetPct?: number;
	skipProximityGate?: boolean;
	unclearDefault: string;
}): {
	status: TradeSetupStatus;
	unclearReason?: string;
	deskPcts: TradeDeskConfig;
} {
	let status: TradeSetupStatus = 'unclear';
	let unclearReason: string | undefined = input.unclearDefault;

	if (
		input.confidence >= input.minConfidence &&
		isFiniteTradePrice(input.entryPrice) &&
		isFiniteTradePrice(input.targetPrice)
	) {
		const entryCheck = assessTradeSetupEntryActionability({
			lastClose: input.close,
			entryPrice: input.entryPrice,
			side: input.side,
			entryOffsetMode: input.entryOffsetMode,
			entryProximityPct: input.entryProximityPct,
			entryProximityMode: input.entryProximityMode,
			entryProximityAtr: input.entryProximityAtr,
			entryOffsetPct: input.entryOffsetPct,
			skipProximityGate: input.skipProximityGate,
		});
		if (!entryCheck.ok) {
			unclearReason = entryCheck.unclearReason;
		} else if (input.side === 'long' && input.invalidationPrice != null && input.invalidationPrice >= input.entryPrice) {
			unclearReason = 'Invalidation must sit below entry for long setup.';
		} else if (input.side === 'short' && input.invalidationPrice != null && input.invalidationPrice <= input.entryPrice) {
			unclearReason = 'Invalidation must sit above entry for short setup.';
		} else {
			status = 'clear';
			unclearReason = undefined;
		}
		return {
			status,
			...(unclearReason ? {unclearReason} : {}),
			deskPcts: entryCheck.deskPcts,
		};
	}

	return {
		status,
		...(unclearReason ? {unclearReason} : {}),
		deskPcts: tradeDeskConfig({
			entryProximityPct: input.entryProximityPct,
			entryOffsetPct: input.entryOffsetPct,
			entryProximityMode: input.entryProximityMode,
		}),
	};
}

function fibLegBuffer(pair: KeyLevelFibPair): number {
	const range = pair.high - pair.low;
	if (!Number.isFinite(range) || range <= 0) {
		return 0;
	}
	return Math.max(range * 1e-4, pair.high * 1e-8);
}

function buildInsideUpperHalfVariants(
	pair: KeyLevelFibPair,
): {long: KeyLevelFibSideVariant; short: KeyLevelFibSideVariant} {
	const retrace = pair.retracement618;
	const buf = fibLegBuffer(pair);
	return {
		short: {
			side: 'short',
			entryPrice: pair.high,
			entryLabel: `Fib 1.0 — Level #${pair.highLevelNumber} range high (retrace toward 0.618)`,
			targetPrice: retrace,
			targetLabel: 'Fib 0.618 retrace',
			targetSource: 'retrace_618',
			invalidationPrice: pair.high + buf,
			invalidationLabel: `Above Level #${pair.highLevelNumber} range high (break invalidates retrace short)`,
		},
		long: {
			side: 'long',
			entryPrice: pair.low,
			entryLabel: `Fib 0.0 — Level #${pair.lowLevelNumber} range low (continuation toward upper)`,
			targetPrice: pair.high,
			targetLabel: `Level #${pair.highLevelNumber} range high (Fib 1.0)`,
			targetSource: 'range_leg',
			invalidationPrice: pair.low - buf,
			invalidationLabel: `Below Level #${pair.lowLevelNumber} range low (break below Fib 0)`,
		},
	};
}

function buildInsideLowerHalfVariants(
	pair: KeyLevelFibPair,
): {long: KeyLevelFibSideVariant; short: KeyLevelFibSideVariant} {
	const inv618 = invertedFib618(pair.low, pair.high);
	const buf = fibLegBuffer(pair);
	return {
		long: {
			side: 'long',
			entryPrice: pair.low,
			entryLabel: `Fib 1.0 (inverted) — Level #${pair.lowLevelNumber} range low (bounce toward 0.618)`,
			targetPrice: inv618,
			targetLabel: 'Fib 0.618 (inverted · upper=0 / lower=1)',
			targetSource: 'retrace_618',
			invalidationPrice: pair.low - buf,
			invalidationLabel: `Below Level #${pair.lowLevelNumber} range low (Fib 1.0 inverted)`,
		},
		short: {
			side: 'short',
			entryPrice: pair.high,
			entryLabel: `Fib 0.0 (inverted) — Level #${pair.highLevelNumber} range high (continuation toward lower)`,
			targetPrice: pair.low,
			targetLabel: `Level #${pair.lowLevelNumber} range low (Fib 1.0 inverted)`,
			targetSource: 'range_leg',
			invalidationPrice: pair.high + buf,
			invalidationLabel: 'Above Fib 0 (inverted) — break above range high',
		},
	};
}

function materializeFibSideVariant(
	plan: KeyLevelFibSideVariant,
	validateInput: {
		close: number;
		confidence: number;
		minConfidence: number;
		entryOffsetMode: EntryOffsetMode;
		deskSeed: TradeDeskConfig;
		entryProximityAtr?: number | null;
		unclearDefault: string;
	},
): Pick<
	KeyLevelFibRetraceTradeSetup,
	| 'status'
	| 'side'
	| 'entryPrice'
	| 'entryLabel'
	| 'targetPrice'
	| 'targetLabel'
	| 'targetSource'
	| 'invalidationPrice'
	| 'invalidationLabel'
	| 'entryProximityPct'
	| 'entryProximityMode'
	| 'atrAtLastBar'
	| 'entryOffsetPct'
	| 'invalidationOffsetPct'
	| 'unclearReason'
> {
	const validation = validateFibTradeSetup({
		close: validateInput.close,
		side: plan.side,
		entryPrice: plan.entryPrice,
		entryOffsetMode: validateInput.entryOffsetMode,
		targetPrice: plan.targetPrice,
		invalidationPrice: plan.invalidationPrice,
		confidence: validateInput.confidence,
		minConfidence: validateInput.minConfidence,
		entryProximityPct: validateInput.deskSeed.entryProximityPct,
		entryProximityMode: validateInput.deskSeed.entryProximityMode,
		entryProximityAtr: validateInput.entryProximityAtr,
		entryOffsetPct: validateInput.deskSeed.entryOffsetPct,
		unclearDefault: validateInput.unclearDefault,
	});
	return {
		status: validation.status,
		...(validation.unclearReason ? {unclearReason: validation.unclearReason} : {}),
		side: plan.side,
		entryPrice: plan.entryPrice,
		entryLabel: plan.entryLabel,
		targetPrice: plan.targetPrice,
		targetLabel: plan.targetLabel,
		targetSource: plan.targetSource,
		invalidationPrice: plan.invalidationPrice,
		invalidationLabel: plan.invalidationLabel,
		entryProximityPct: validation.deskPcts.entryProximityPct,
		entryProximityMode: validation.deskPcts.entryProximityMode,
		...(validateInput.entryProximityAtr != null
			? {atrAtLastBar: validateInput.entryProximityAtr}
			: {}),
		entryOffsetPct: validation.deskPcts.entryOffsetPct,
		invalidationOffsetPct: validation.deskPcts.invalidationOffsetPct,
	};
}

/** Apply long/short variant from a fib trade setup (UI or skill override). */
export function applyKeyLevelFibSideVariant(
	setup: KeyLevelFibRetraceTradeSetup,
	side: 'long' | 'short',
): KeyLevelFibRetraceTradeSetup {
	if (setup.side === side || !setup.sideVariants?.[side]) {
		return setup;
	}
	const plan = setup.sideVariants[side];
	const materialized = materializeFibSideVariant(plan, {
			close: setup.lastClose,
			confidence: setup.confidence,
			minConfidence: 0.35,
			entryOffsetMode: setup.entryOffsetMode,
			deskSeed: tradeDeskConfig({
				entryProximityPct: setup.entryProximityPct,
				entryOffsetPct: setup.entryOffsetPct,
				invalidationOffsetPct: setup.invalidationOffsetPct,
				entryProximityMode: setup.entryProximityMode,
			}),
			entryProximityAtr: setup.atrAtLastBar ?? null,
			unclearDefault: setup.unclearReason ?? 'Fib side variant is not actionable at last close.',
		});
	return {
		...setup,
		...materialized,
		defaultSide: setup.defaultSide,
		sideVariants: setup.sideVariants,
	};
}

export function buildKeyLevelFibRetraceTradeSetup(input: {
	lastClose: number;
	levelMenu: KeyLevelMenuEntry[];
	fibPairs: KeyLevelFibPair[];
	bars?: Record<string, unknown>[];
	minConfidence?: number;
	entryProximityPct?: number;
	entryProximityMode?: EntryProximityMode;
	entryProximityAtrPeriod?: number;
	entryOffsetPct?: number;
	invalidationOffsetPct?: number;
	invalidationOffsetMode?: EntryProximityMode;
	/** trade-defaults skill may prefer long over the desk default short (upper half). */
	defaultSidePreference?: 'long' | 'short';
	fibPairNumber?: number;
	fibKeyLevelMinConfidence?: number;
}): KeyLevelFibRetraceTradeSetup | null {
	const close = input.lastClose;
	if (!isFiniteTradePrice(close)) {
		return null;
	}
	const pair =
		(input.fibPairNumber != null
			? input.fibPairs.find(p => p.pairNumber === input.fibPairNumber)
			: undefined) ?? pickStrongestBracketFibPair(input.fibPairs);
	if (!pair || pair.low >= pair.high) {
		return null;
	}
	// Strongest-bracket pairs always require a level below and above last close.
	if (!(pair.low < close && close < pair.high)) {
		return null;
	}

	const minConfidence =
		input.minConfidence ?? input.fibKeyLevelMinConfidence ?? DEFAULT_FIB_KEY_LEVEL_MIN_CONFIDENCE;
	const retrace = pair.retracement618;
	if (!isFiniteTradePrice(retrace)) {
		return null;
	}

	const lowRow = input.levelMenu.find(m => m.levelNumber === pair.lowLevelNumber);
	const highRow = input.levelMenu.find(m => m.levelNumber === pair.highLevelNumber);
	const legStrength = (lowRow?.strength ?? 0) + (highRow?.strength ?? 0);
	const confidence = Math.min(1, legStrength / 120);
	const bars = input.bars ?? [];
	const deskSeed = tradeDeskConfig({
		entryProximityPct: input.entryProximityPct,
		entryOffsetPct: input.entryOffsetPct,
		invalidationOffsetPct: input.invalidationOffsetPct,
		invalidationOffsetMode: input.invalidationOffsetMode,
		entryProximityMode: input.entryProximityMode,
		entryProximityAtrPeriod: input.entryProximityAtrPeriod,
	});
	const entryProximityAtr = entryProximityAtrFromOhlcvRows(
		bars,
		deskSeed.entryProximityAtrPeriod,
	);

	const insideSubRegime: KeyLevelFibInsideSubRegime =
		close >= retrace ? 'upper_half' : 'lower_half';
	const fibRangeInverted = insideSubRegime === 'lower_half';
	const sideVariants =
		insideSubRegime === 'upper_half'
			? buildInsideUpperHalfVariants(pair)
			: buildInsideLowerHalfVariants(pair);

	let defaultSide: 'long' | 'short' =
		insideSubRegime === 'upper_half' ? 'short' : 'long';
	if (input.defaultSidePreference === 'long' || input.defaultSidePreference === 'short') {
		if (insideSubRegime === 'upper_half') {
			defaultSide = input.defaultSidePreference;
		}
	}

	const materialized = materializeFibSideVariant(sideVariants[defaultSide], {
			close,
			confidence,
			minConfidence,
			entryOffsetMode: 'bounce',
			deskSeed,
			entryProximityAtr,
			unclearDefault: 'Fib 0.618 retrace setup is not actionable at last close.',
		});

	return {
		status: materialized.status,
		source: 'strongest_bracket',
		priceRegime: 'inside_range',
		fibRangeInverted,
		insideSubRegime,
		defaultSide,
		sideVariants,
		framing: 'retrace',
		entryOffsetMode: 'bounce',
		entryProximityPct: materialized.entryProximityPct,
		entryProximityMode: materialized.entryProximityMode,
		...(materialized.atrAtLastBar != null ? {atrAtLastBar: materialized.atrAtLastBar} : {}),
		entryOffsetPct: materialized.entryOffsetPct,
		invalidationOffsetPct: materialized.invalidationOffsetPct,
		invalidationOffsetMode: deskSeed.invalidationOffsetMode,
		fibPairNumber: pair.pairNumber,
		lowLevelNumber: pair.lowLevelNumber,
		highLevelNumber: pair.highLevelNumber,
		low: pair.low,
		high: pair.high,
		retracement618: retrace,
		displayTrend: chartFibTrendForRange(fibRangeInverted),
		lastClose: close,
		side: materialized.side,
		entryPrice: materialized.entryPrice,
		entryLabel: materialized.entryLabel,
		targetPrice: materialized.targetPrice,
		targetLabel: materialized.targetLabel,
		targetSource: materialized.targetSource,
		invalidationPrice: materialized.invalidationPrice,
		invalidationLabel: materialized.invalidationLabel,
		setupPurposeCode: tradeSetupPurposeCode({
			analysisType: 'key_levels',
			keyLevelsVariant: 'fib_retrace',
		}),
		confidence,
		...(materialized.unclearReason ? {unclearReason: materialized.unclearReason} : {}),
	};
}
