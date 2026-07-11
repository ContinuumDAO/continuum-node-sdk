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
		const targetLabel = 'Fib 1.618 extension below range';
		const entryPrice = pair.low;
		const entryLabel = `Level #${pair.lowLevelNumber} range low break`;
		const invalidationPrice = pair.retracement618;
		const invalidationLabel = 'Fib 0.618 (back inside range)';
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
			unclearDefault: 'Fib range extension setup is not actionable at last close.',
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

	let side: TradeSetupSide = 'neutral';
	let entryPrice = retrace;
	let entryLabel = 'Fib 0.618 retrace';
	let targetPrice: number | undefined;
	let targetLabel: string | undefined;
	let targetSource: KeyLevelFibTargetSource = 'retrace_618';
	let invalidationPrice: number | undefined;
	let invalidationLabel: string | undefined;

	if (pair.trend === 'up' || close >= retrace) {
		side = 'long';
		targetPrice = pair.high;
		targetLabel = `Level #${pair.highLevelNumber} range high`;
		targetSource = 'range_leg';
		invalidationPrice = pair.low;
		invalidationLabel = `Level #${pair.lowLevelNumber} range low`;
	} else {
		side = 'short';
		targetPrice = pair.low;
		targetLabel = `Level #${pair.lowLevelNumber} range low`;
		targetSource = 'range_leg';
		invalidationPrice = pair.high;
		invalidationLabel = `Level #${pair.highLevelNumber} range high`;
	}

	const validation = validateFibTradeSetup({
		close,
		side,
		entryPrice,
		entryOffsetMode: 'bounce',
		targetPrice,
		invalidationPrice,
		confidence,
		minConfidence,
		entryProximityPct: deskSeed.entryProximityPct,
		entryOffsetPct: deskSeed.entryOffsetPct,
		unclearDefault: 'Fib 0.618 retrace setup is not actionable at last close.',
	});

	return {
		...base,
		status: validation.status,
		...(validation.unclearReason ? {unclearReason: validation.unclearReason} : {}),
		framing: 'retrace',
		entryOffsetMode: 'bounce',
		entryProximityPct: validation.deskPcts.entryProximityPct,
		entryOffsetPct: validation.deskPcts.entryOffsetPct,
		invalidationOffsetPct: validation.deskPcts.invalidationOffsetPct,
		side,
		entryPrice,
		entryLabel,
		targetPrice,
		targetLabel,
		targetSource,
		invalidationPrice,
		invalidationLabel,
		setupPurposeCode: tradeSetupPurposeCode({
			analysisType: 'key_levels',
			keyLevelsVariant: 'fib_retrace',
		}),
		breakRetestAlternative: null,
	};
}
