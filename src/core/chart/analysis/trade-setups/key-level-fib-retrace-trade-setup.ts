import type {KeyLevelFibPair, KeyLevelMenuEntry} from '../key-level-menu-summary.js';
import {pickOuterConcentricFibPair} from '../key-level-menu-summary.js';
import {
	alternateBreakCandidatesForSkill,
	detectKeyLevelBreaks,
	pickStrongestBreakCandidate,
} from '../key-level-break-detect.js';
import type {EntryOffsetMode, PatternEntryPhase} from './pattern-limit-entry.js';
import type {TradeSetupSide, TradeSetupStatus} from './shared.js';
import {isFiniteTradePrice} from './shared.js';
import {assessTradeSetupEntryActionability} from './trade-entry-gates.js';
import {tradeDeskDefaultPcts, type TradeDeskDefaultPctFields} from './trade-desk-defaults.js';
import {tradeSetupPurposeCode} from './trade-purpose-format.js';

export type KeyLevelFibPriceRegime = 'inside_range' | 'above_range' | 'below_range';

export type KeyLevelFibTargetSource = 'retrace_618' | 'range_leg' | 'fib_extension';

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

export type KeyLevelFibBreakRetestAlternative = {
	status: TradeSetupStatus;
	framing: 'break';
	entryPhase: PatternEntryPhase;
	entryOffsetMode: EntryOffsetMode;
	setupPurposeCode: string;
	brokenLevelNumber: number;
	brokenLevelKind: 'support' | 'resistance';
	entryPrice: number;
	entryLabel: string;
	targetPrice?: number;
	targetLabel?: string;
	targetSource?: KeyLevelFibTargetSource;
	fibPairNumber: number;
	invalidationPrice?: number;
	invalidationLabel?: string;
	confidence: number;
	higherTimeframeAdvisory?: string;
	unclearReason?: string;
	entryProximityPct: number;
	entryOffsetPct: number;
	invalidationOffsetPct: number;
	alternateBreakCandidates: Array<{
		levelNumber: number;
		kind: 'support' | 'resistance';
		strength: number;
		side: TradeSetupSide;
		selectionHint: 'strongest' | 'most_recent' | 'nearest_retest';
	}>;
};

export type KeyLevelFibRetraceTradeSetup = {
	status: TradeSetupStatus;
	source: 'concentric_range';
	priceRegime: KeyLevelFibPriceRegime;
	/** When true, Fib 0 = range high and Fib 1 = range low. */
	fibRangeInverted?: boolean;
	insideSubRegime?: KeyLevelFibInsideSubRegime;
	defaultSide: 'long' | 'short';
	sideVariants?: {long: KeyLevelFibSideVariant; short: KeyLevelFibSideVariant};
	framing: 'retrace' | 'break';
	entryOffsetMode: EntryOffsetMode;
	entryProximityPct: number;
	entryOffsetPct: number;
	invalidationOffsetPct: number;
	fibPairNumber: number;
	concentricRank: number;
	lowLevelNumber: number;
	highLevelNumber: number;
	low: number;
	high: number;
	retracement618: number;
	trend: 'up' | 'down';
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
	higherTimeframeAdvisory?: string;
	unclearReason?: string;
	breakRetestAlternative?: KeyLevelFibBreakRetestAlternative | null;
};

const HTF_ADVISORY =
	'Target uses Fibonacci extension — re-run analyze_key_level_fibonacci on a higher timeframe for structural confirmation.';

function resolvePriceRegime(close: number, pair: KeyLevelFibPair): KeyLevelFibPriceRegime {
	if (close > pair.high) {
		return 'above_range';
	}
	if (close < pair.low) {
		return 'below_range';
	}
	return 'inside_range';
}

/** Inverted Fib 0.618 (0 = high, 1 = low). */
export function invertedFib618(low: number, high: number): number {
	const range = high - low;
	if (!Number.isFinite(range) || range <= 0) {
		return low;
	}
	return high - range * 0.618;
}

function buildFibBreakRetestAlternative(input: {
	pair: KeyLevelFibPair;
	menu: KeyLevelMenuEntry[];
	bars: Record<string, unknown>[];
	brokenLevelNumber: number;
	side: TradeSetupSide;
	targetPrice: number;
	targetLabel: string;
	minConfidence: number;
	deskPcts: TradeDeskDefaultPctFields;
}): KeyLevelFibBreakRetestAlternative | null {
	const brokenRow = input.menu.find(m => m.levelNumber === input.brokenLevelNumber);
	if (!brokenRow) {
		return null;
	}
	const candidates = detectKeyLevelBreaks(input.menu, input.bars).filter(
		c => c.levelNumber === input.brokenLevelNumber && c.side === input.side,
	);
	const primary = pickStrongestBreakCandidate(candidates);
	if (!primary) {
		return null;
	}

	const entryPrice = primary.price;
	const entryLabel = `Level #${primary.levelNumber} break retest`;

	let invalidationPrice: number | undefined;
	let invalidationLabel: string | undefined;
	if (input.side === 'long') {
		invalidationPrice = input.pair.low;
		invalidationLabel = `Level #${input.pair.lowLevelNumber} range low`;
	} else {
		invalidationPrice = input.pair.high;
		invalidationLabel = `Level #${input.pair.highLevelNumber} range high`;
	}

	const confidence = Math.min(1, primary.strength / 100);
	let status: TradeSetupStatus = 'unclear';
	let unclearReason: string | undefined;

	if (!primary.hasRetestOnLastBar) {
		unclearReason = `Break confirmed — wait for retest at Level #${primary.levelNumber}.`;
	} else if (confidence < input.minConfidence) {
		unclearReason = `Break retest confidence ${confidence.toFixed(2)} is below threshold ${input.minConfidence.toFixed(2)}.`;
	} else if (!isFiniteTradePrice(entryPrice) || !isFiniteTradePrice(invalidationPrice)) {
		unclearReason = 'Fib break retest lacks finite entry or invalidation.';
	} else if (!isFiniteTradePrice(input.targetPrice)) {
		unclearReason = 'Fib break retest lacks a measured extension target.';
	} else if (input.side === 'long' && invalidationPrice >= entryPrice) {
		unclearReason = 'Invalidation must sit below entry for long fib break retest.';
	} else if (input.side === 'short' && invalidationPrice <= entryPrice) {
		unclearReason = 'Invalidation must sit above entry for short fib break retest.';
	} else {
		status = 'clear';
	}

	return {
		status,
		framing: 'break',
		entryPhase: 'post_breakout_retest',
		entryOffsetMode: 'retest',
		setupPurposeCode: tradeSetupPurposeCode({
			analysisType: 'key_levels',
			keyLevelsVariant: 'fib_break_retest',
		}),
		brokenLevelNumber: primary.levelNumber,
		brokenLevelKind: primary.kind,
		entryPrice,
		entryLabel,
		targetPrice: input.targetPrice,
		targetLabel: input.targetLabel,
		targetSource: 'fib_extension',
		fibPairNumber: input.pair.pairNumber,
		...(invalidationPrice != null ? {invalidationPrice, invalidationLabel} : {}),
		confidence,
		higherTimeframeAdvisory: HTF_ADVISORY,
		entryProximityPct: input.deskPcts.entryProximityPct,
		entryOffsetPct: input.deskPcts.entryOffsetPct,
		invalidationOffsetPct: input.deskPcts.invalidationOffsetPct,
		...(unclearReason ? {unclearReason} : {}),
		alternateBreakCandidates: alternateBreakCandidatesForSkill(candidates),
	};
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
	entryOffsetPct?: number;
	skipProximityGate?: boolean;
	unclearDefault: string;
}): {
	status: TradeSetupStatus;
	unclearReason?: string;
	deskPcts: TradeDeskDefaultPctFields;
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
		deskPcts: tradeDeskDefaultPcts({
			entryProximityPct: input.entryProximityPct,
			entryOffsetPct: input.entryOffsetPct,
		}),
	};
}

function buildInsideUpperHalfVariants(
	pair: KeyLevelFibPair,
	close: number,
): {long: KeyLevelFibSideVariant; short: KeyLevelFibSideVariant} {
	const retrace = pair.retracement618;
	return {
		short: {
			side: 'short',
			entryPrice: close,
			entryLabel: 'Below upper — retrace toward Fib 0.618',
			targetPrice: retrace,
			targetLabel: 'Fib 0.618 retrace',
			targetSource: 'retrace_618',
			invalidationPrice: pair.high,
			invalidationLabel: `Level #${pair.highLevelNumber} range high (break above upper)`,
		},
		long: {
			side: 'long',
			entryPrice: close,
			entryLabel: 'Above Fib 0.618 — continuation toward upper',
			targetPrice: pair.high,
			targetLabel: `Level #${pair.highLevelNumber} range high`,
			targetSource: 'range_leg',
			invalidationPrice: retrace,
			invalidationLabel: 'Fib 0.618 (break below retrace)',
		},
	};
}

function buildInsideLowerHalfVariants(
	pair: KeyLevelFibPair,
	close: number,
): {long: KeyLevelFibSideVariant; short: KeyLevelFibSideVariant} {
	const inv618 = invertedFib618(pair.low, pair.high);
	return {
		long: {
			side: 'long',
			entryPrice: close,
			entryLabel: 'Below Fib 0.618 (inverted) — bounce toward 0.618',
			targetPrice: inv618,
			targetLabel: 'Fib 0.618 (inverted · upper=0 / lower=1)',
			targetSource: 'retrace_618',
			invalidationPrice: pair.low,
			invalidationLabel: `Level #${pair.lowLevelNumber} range low (Fib 1.0 inverted)`,
		},
		short: {
			side: 'short',
			entryPrice: close,
			entryLabel: 'Below Fib 0.618 (inverted) — continuation toward lower',
			targetPrice: pair.low,
			targetLabel: `Level #${pair.lowLevelNumber} range low (Fib 1.0 inverted)`,
			targetSource: 'range_leg',
			invalidationPrice: inv618,
			invalidationLabel: 'Fib 0.618 inverted (break above retrace)',
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
		deskSeed: TradeDeskDefaultPctFields;
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
			deskSeed: tradeDeskDefaultPcts({
				entryProximityPct: setup.entryProximityPct,
				entryOffsetPct: setup.entryOffsetPct,
				invalidationOffsetPct: setup.invalidationOffsetPct,
			}),
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
	breakMinConfidence?: number;
	entryProximityPct?: number;
	entryOffsetPct?: number;
	invalidationOffsetPct?: number;
	/** trade-defaults skill may prefer long over the desk default short (upper half). */
	defaultSidePreference?: 'long' | 'short';
}): KeyLevelFibRetraceTradeSetup | null {
	const close = input.lastClose;
	if (!isFiniteTradePrice(close)) {
		return null;
	}
	const pair = pickOuterConcentricFibPair(input.fibPairs);
	if (!pair || pair.low >= pair.high) {
		return null;
	}

	const minConfidence = input.minConfidence ?? 0.35;
	const breakMinConfidence = input.breakMinConfidence ?? 0.45;
	const retrace = pair.retracement618;
	if (!isFiniteTradePrice(retrace)) {
		return null;
	}

	const lowRow = input.levelMenu.find(m => m.levelNumber === pair.lowLevelNumber);
	const highRow = input.levelMenu.find(m => m.levelNumber === pair.highLevelNumber);
	const legStrength = (lowRow?.strength ?? 0) + (highRow?.strength ?? 0);
	const confidence = Math.min(1, legStrength / 120);
	const priceRegime = resolvePriceRegime(close, pair);
	const displayTrend: 'up' | 'down' = priceRegime === 'below_range' ? 'down' : pair.trend;
	const bars = input.bars ?? [];
	const deskSeed = tradeDeskDefaultPcts({
		entryProximityPct: input.entryProximityPct,
		entryOffsetPct: input.entryOffsetPct,
		invalidationOffsetPct: input.invalidationOffsetPct,
	});

	const base = {
		source: 'concentric_range' as const,
		priceRegime,
		fibPairNumber: pair.pairNumber,
		concentricRank: pair.concentricRank ?? 1,
		lowLevelNumber: pair.lowLevelNumber,
		highLevelNumber: pair.highLevelNumber,
		low: pair.low,
		high: pair.high,
		retracement618: retrace,
		trend: pair.trend,
		displayTrend,
		lastClose: close,
		confidence,
	};

	if (priceRegime === 'above_range') {
		const targetPrice = pair.extension1618Up;
		const targetLabel = 'Fib 1.618 extension above range';
		const entryPrice = pair.high;
		const entryLabel = `Level #${pair.highLevelNumber} range high break`;
		const invalidationPrice = pair.retracement618;
		const invalidationLabel = 'Fib 0.618 (back inside range)';
		const validation = validateFibTradeSetup({
			close,
			side: 'long',
			entryPrice,
			entryOffsetMode: 'retest',
			targetPrice,
			invalidationPrice,
			confidence,
			minConfidence,
			entryProximityPct: deskSeed.entryProximityPct,
			entryOffsetPct: deskSeed.entryOffsetPct,
			skipProximityGate: true,
			unclearDefault: 'Fib range extension setup is not actionable at last close.',
		});
		const breakRetestAlternative = bars.length
			? buildFibBreakRetestAlternative({
					pair,
					menu: input.levelMenu,
					bars,
					brokenLevelNumber: pair.highLevelNumber,
					side: 'long',
					targetPrice,
					targetLabel,
					minConfidence: breakMinConfidence,
					deskPcts: validation.deskPcts,
				})
			: null;

		return {
			...base,
			status: validation.status,
			...(validation.unclearReason ? {unclearReason: validation.unclearReason} : {}),
			defaultSide: 'long',
			framing: 'break',
			entryOffsetMode: 'retest',
			entryProximityPct: validation.deskPcts.entryProximityPct,
			entryOffsetPct: validation.deskPcts.entryOffsetPct,
			invalidationOffsetPct: validation.deskPcts.invalidationOffsetPct,
			side: 'long',
			entryPrice,
			entryLabel,
			targetPrice,
			targetLabel,
			targetSource: 'fib_extension',
			invalidationPrice,
			invalidationLabel,
			setupPurposeCode: tradeSetupPurposeCode({
				analysisType: 'key_levels',
				keyLevelsVariant: 'fib_extension',
			}),
			higherTimeframeAdvisory: HTF_ADVISORY,
			...(breakRetestAlternative ? {breakRetestAlternative} : {}),
		};
	}

	if (priceRegime === 'below_range') {
		const targetPrice = pair.extension1618Down;
		const targetLabel = 'Fib 1.618 extension below range (inverted)';
		const entryPrice = close;
		const entryLabel = `Below Level #${pair.lowLevelNumber} — extension short`;
		const invalidationPrice = pair.low;
		const invalidationLabel = `Level #${pair.lowLevelNumber} range low (break above lower)`;
		const validation = validateFibTradeSetup({
			close,
			side: 'short',
			entryPrice,
			entryOffsetMode: 'retest',
			targetPrice,
			invalidationPrice,
			confidence,
			minConfidence,
			entryProximityPct: deskSeed.entryProximityPct,
			entryOffsetPct: deskSeed.entryOffsetPct,
			skipProximityGate: true,
			unclearDefault: 'Fib inverted extension setup is not actionable at last close.',
		});
		const breakRetestAlternative = bars.length
			? buildFibBreakRetestAlternative({
					pair,
					menu: input.levelMenu,
					bars,
					brokenLevelNumber: pair.lowLevelNumber,
					side: 'short',
					targetPrice,
					targetLabel,
					minConfidence: breakMinConfidence,
					deskPcts: validation.deskPcts,
				})
			: null;

		return {
			...base,
			fibRangeInverted: true,
			defaultSide: 'short',
			status: validation.status,
			...(validation.unclearReason ? {unclearReason: validation.unclearReason} : {}),
			framing: 'break',
			entryOffsetMode: 'retest',
			entryProximityPct: validation.deskPcts.entryProximityPct,
			entryOffsetPct: validation.deskPcts.entryOffsetPct,
			invalidationOffsetPct: validation.deskPcts.invalidationOffsetPct,
			side: 'short',
			entryPrice,
			entryLabel,
			targetPrice,
			targetLabel,
			targetSource: 'fib_extension',
			invalidationPrice,
			invalidationLabel,
			setupPurposeCode: tradeSetupPurposeCode({
				analysisType: 'key_levels',
				keyLevelsVariant: 'fib_extension',
			}),
			higherTimeframeAdvisory: HTF_ADVISORY,
			...(breakRetestAlternative ? {breakRetestAlternative} : {}),
		};
	}

	const insideSubRegime: KeyLevelFibInsideSubRegime =
		close >= retrace ? 'upper_half' : 'lower_half';
	const fibRangeInverted = insideSubRegime === 'lower_half';
	const sideVariants =
		insideSubRegime === 'upper_half'
			? buildInsideUpperHalfVariants(pair, close)
			: buildInsideLowerHalfVariants(pair, close);

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
			unclearDefault: 'Fib 0.618 retrace setup is not actionable at last close.',
		});

	return {
		...base,
		fibRangeInverted,
		insideSubRegime,
		defaultSide,
		sideVariants,
		framing: 'retrace',
		entryOffsetMode: 'bounce',
		setupPurposeCode: tradeSetupPurposeCode({
			analysisType: 'key_levels',
			keyLevelsVariant: 'fib_retrace',
		}),
		breakRetestAlternative: null,
		...materialized,
	};
}
