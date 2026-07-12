import type {KeyLevelFibPair, KeyLevelMenuEntry} from '../key-level-menu-summary.js';
import {
	alternateBreakCandidatesForSkill,
	detectKeyLevelBreaks,
	pickStrongestBreakCandidate,
} from '../key-level-break-detect.js';
import type {PatternEntryPhase} from './pattern-limit-entry.js';
import type {EntryOffsetMode} from './pattern-limit-entry.js';
import type {TradeSetupSide, TradeSetupStatus} from './shared.js';
import {isFiniteTradePrice} from './shared.js';
import {assessTradeSetupEntryActionability} from './trade-entry-gates.js';
import {entryProximityAtrFromOhlcvRows} from './entry-proximity-atr.js';
import {tradeDeskConfig, type EntryProximityMode} from './trade-desk-defaults.js';
import {tradeSetupPurposeCode} from './trade-purpose-format.js';

export type KeyLevelTargetSource = 'next_level' | 'fib_extension';

export type KeyLevelsBreakRetestAlternative = {
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
	invalidationPrice?: number;
	invalidationLabel?: string;
	targetSource?: KeyLevelTargetSource;
	fibPairNumber?: number;
	confidence: number;
	higherTimeframeAdvisory?: string;
	unclearReason?: string;
	alternateBreakCandidates: Array<{
		levelNumber: number;
		kind: 'support' | 'resistance';
		strength: number;
		side: TradeSetupSide;
		selectionHint: 'strongest' | 'most_recent' | 'nearest_retest';
	}>;
};

export type KeyLevelsTradeSetup = {
	status: TradeSetupStatus;
	source: 'nearest_levels';
	framing: 'bounce' | 'break';
	entryOffsetMode: EntryOffsetMode;
	entryProximityPct: number;
	entryProximityMode?: EntryProximityMode;
	atrAtLastBar?: number;
	entryOffsetPct: number;
	invalidationOffsetPct: number;
	setupPurposeCode: string;
	levelNumber: number | null;
	supportRank: number | null;
	resistanceRank: number | null;
	supportPrice: number | null;
	supportLabel: string;
	resistancePrice: number | null;
	resistanceLabel: string;
	lastClose: number;
	side: TradeSetupSide;
	entryPrice: number;
	entryLabel: string;
	targetPrice?: number;
	targetLabel?: string;
	invalidationPrice?: number;
	invalidationLabel?: string;
	targetSource?: KeyLevelTargetSource;
	fibPairNumber?: number;
	confidence: number;
	higherTimeframeAdvisory?: string;
	unclearReason?: string;
	breakRetestAlternative?: KeyLevelsBreakRetestAlternative | null;
};

type KeyLevel = {
	price: number;
	kind: 'support' | 'resistance';
	strength: number;
	touchCount?: number;
};

const HTF_ADVISORY =
	'Target uses Fibonacci extension — re-run analyze_key_levels on a higher timeframe for structural confirmation.';

function resolveTarget(input: {
	side: TradeSetupSide;
	entryPrice: number;
	supports: KeyLevel[];
	resistances: KeyLevel[];
	fibPair: KeyLevelFibPair | null;
}): {
	targetPrice?: number;
	targetLabel?: string;
	targetSource?: KeyLevelTargetSource;
	higherTimeframeAdvisory?: string;
} {
	if (input.side === 'long') {
		const next = input.resistances.find(r => r.price > input.entryPrice);
		if (next) {
			return {
				targetPrice: next.price,
				targetLabel: 'next resistance',
				targetSource: 'next_level',
			};
		}
		if (input.fibPair) {
			return {
				targetPrice: input.fibPair.extension1618Up,
				targetLabel: 'Fib 1.618 extension',
				targetSource: 'fib_extension',
				higherTimeframeAdvisory: HTF_ADVISORY,
			};
		}
	} else if (input.side === 'short') {
		const nextSupport = input.supports.filter(s => s.price < input.entryPrice).sort((a, b) => b.price - a.price)[0];
		if (nextSupport) {
			return {
				targetPrice: nextSupport.price,
				targetLabel: 'next support',
				targetSource: 'next_level',
			};
		}
		if (input.fibPair) {
			return {
				targetPrice: input.fibPair.extension1618Down,
				targetLabel: 'Fib 1.618 extension',
				targetSource: 'fib_extension',
				higherTimeframeAdvisory: HTF_ADVISORY,
			};
		}
	}
	return {};
}

function levelNumberForPrice(menu: KeyLevelMenuEntry[], price: number, role: 'support' | 'resistance'): number | null {
	const row = menu.find(m => m.kind === role && Math.abs(m.price - price) < 1e-8);
	return row?.levelNumber ?? null;
}

function roleLevelsFromMenu(menu: KeyLevelMenuEntry[]): {
	supports: KeyLevel[];
	resistances: KeyLevel[];
} {
	const supports: KeyLevel[] = [];
	const resistances: KeyLevel[] = [];
	for (const row of menu) {
		const level: KeyLevel = {
			price: row.price,
			kind: row.kind,
			strength: row.strength,
			touchCount: row.touchCount,
		};
		if (row.kind === 'support') {
			supports.push(level);
		} else {
			resistances.push(level);
		}
	}
	return {
		supports: supports.sort((a, b) => b.price - a.price),
		resistances: resistances.sort((a, b) => a.price - b.price),
	};
}

function buildBreakRetestAlternative(input: {
	lastClose: number;
	menu: KeyLevelMenuEntry[];
	fibPairs: KeyLevelFibPair[];
	bars: Record<string, unknown>[];
	supports: KeyLevel[];
	resistances: KeyLevel[];
	minConfidence: number;
}): KeyLevelsBreakRetestAlternative | null {
	const candidates = detectKeyLevelBreaks(input.menu, input.bars);
	if (!candidates.length) {
		return null;
	}
	const primary = pickStrongestBreakCandidate(candidates);
	if (!primary) {
		return null;
	}

	const entryPrice = primary.price;
	const entryLabel = `${primary.kind} break retest`;

	let invalidationPrice: number | undefined;
	let invalidationLabel: string | undefined;
	if (primary.side === 'long') {
		const lower = input.supports.filter(s => s.price < entryPrice).sort((a, b) => b.price - a.price)[0];
		invalidationPrice = lower?.price ?? entryPrice * 0.99;
		invalidationLabel = lower ? 'lower support' : 'level break';
	} else {
		const upper = input.resistances.filter(r => r.price > entryPrice).sort((a, b) => a.price - b.price)[0];
		invalidationPrice = upper?.price ?? entryPrice * 1.01;
		invalidationLabel = upper ? 'upper resistance' : 'level break';
	}

	const target = resolveTarget({
		side: primary.side,
		entryPrice,
		supports: input.supports,
		resistances: input.resistances,
		fibPair: null,
	});

	const confidence = Math.min(1, primary.strength / 100);
	let status: TradeSetupStatus = 'unclear';
	let unclearReason: string | undefined;

	if (!primary.hasRetestOnLastBar) {
		unclearReason = `Break confirmed — wait for retest at Level #${primary.levelNumber}.`;
	} else if (confidence < input.minConfidence) {
		unclearReason = `Break retest confidence ${confidence.toFixed(2)} is below threshold ${input.minConfidence.toFixed(2)}.`;
	} else if (!isFiniteTradePrice(entryPrice) || !isFiniteTradePrice(invalidationPrice)) {
		unclearReason = 'Break retest lacks finite entry or invalidation.';
	} else if (target.targetPrice == null) {
		unclearReason = 'Break retest lacks a measured target.';
	} else if (primary.side === 'long' && invalidationPrice >= entryPrice) {
		unclearReason = 'Invalidation must sit below entry for long break retest.';
	} else if (primary.side === 'short' && invalidationPrice <= entryPrice) {
		unclearReason = 'Invalidation must sit above entry for short break retest.';
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
			keyLevelsVariant: 'break_retest',
		}),
		brokenLevelNumber: primary.levelNumber,
		brokenLevelKind: primary.kind,
		entryPrice,
		entryLabel,
		...(target.targetPrice != null
			? {
					targetPrice: target.targetPrice,
					targetLabel: target.targetLabel,
					targetSource: target.targetSource,
					...(target.higherTimeframeAdvisory ? {higherTimeframeAdvisory: target.higherTimeframeAdvisory} : {}),
				}
			: {}),
		...(invalidationPrice != null ? {invalidationPrice, invalidationLabel} : {}),
		confidence,
		...(unclearReason ? {unclearReason} : {}),
		alternateBreakCandidates: alternateBreakCandidatesForSkill(candidates),
	};
}

export function buildKeyLevelsTradeSetup(input: {
	lastClose: number;
	nearestSupport: {price: number; strength: number} | null;
	nearestResistance: {price: number; strength: number} | null;
	levels: KeyLevel[];
	levelMenu: KeyLevelMenuEntry[];
	fibPairs: KeyLevelFibPair[];
	bars: Record<string, unknown>[];
	minConfidence?: number;
	breakMinConfidence?: number;
	entryProximityPct?: number;
	entryProximityMode?: EntryProximityMode;
	entryProximityAtrPeriod?: number;
	entryOffsetPct?: number;
	invalidationOffsetPct?: number;
}): KeyLevelsTradeSetup | null {
	const minConfidence = input.minConfidence ?? 0.35;
	const breakMinConfidence = input.breakMinConfidence ?? 0.45;
	const deskSeed = tradeDeskConfig({
		entryProximityPct: input.entryProximityPct,
		entryOffsetPct: input.entryOffsetPct,
		invalidationOffsetPct: input.invalidationOffsetPct,
		entryProximityMode: input.entryProximityMode,
		entryProximityAtrPeriod: input.entryProximityAtrPeriod,
	});
	const entryProximityAtr =
		deskSeed.entryProximityMode === 'atr'
			? entryProximityAtrFromOhlcvRows(input.bars, deskSeed.entryProximityAtrPeriod)
			: null;
	const close = input.lastClose;
	if (!isFiniteTradePrice(close)) {
		return null;
	}
	const {supports, resistances} = roleLevelsFromMenu(input.levelMenu);

	let side: TradeSetupSide = 'neutral';
	let framing: 'bounce' | 'break' = 'bounce';
	let entryPrice = close;
	let entryLabel = 'last close';
	let levelNumber: number | null = null;
	let targetPrice: number | undefined;
	let targetLabel: string | undefined;
	let targetSource: KeyLevelTargetSource | undefined;
	let higherTimeframeAdvisory: string | undefined;
	let invalidationPrice: number | undefined;
	let invalidationLabel: string | undefined;
	let confidence = 0.4;
	let status: TradeSetupStatus = 'unclear';
	let unclearReason = 'No actionable support/resistance framing near last close.';

	if (input.nearestSupport && close >= input.nearestSupport.price * 0.998) {
		side = 'long';
		framing = 'bounce';
		entryPrice = input.nearestSupport.price;
		entryLabel = 'support bounce';
		levelNumber = levelNumberForPrice(input.levelMenu, entryPrice, 'support');
		confidence = Math.min(1, input.nearestSupport.strength / 100);
		const target = resolveTarget({
			side,
			entryPrice,
			supports,
			resistances,
			fibPair: null,
		});
		targetPrice = target.targetPrice;
		targetLabel = target.targetLabel;
		targetSource = target.targetSource;
		higherTimeframeAdvisory = target.higherTimeframeAdvisory;
		const lowerSupport = supports.find(s => s.price < input.nearestSupport!.price);
		if (lowerSupport) {
			invalidationPrice = lowerSupport.price;
			invalidationLabel = 'lower support';
		} else {
			invalidationPrice = input.nearestSupport.price * 0.99;
			invalidationLabel = 'support break';
		}
		if (confidence >= minConfidence && isFiniteTradePrice(entryPrice)) {
			const entryCheck = assessTradeSetupEntryActionability({
				lastClose: close,
				entryPrice,
				side,
				entryOffsetMode: 'bounce',
				entryProximityPct: deskSeed.entryProximityPct,
				entryProximityMode: deskSeed.entryProximityMode,
				entryProximityAtr,
				entryOffsetPct: deskSeed.entryOffsetPct,
			});
			if (!entryCheck.ok) {
				status = 'unclear';
				unclearReason = entryCheck.unclearReason;
			} else {
				status = targetPrice != null ? 'clear' : 'unclear';
				if (status === 'unclear') {
					unclearReason = 'Support bounce framing lacks a measured target.';
				} else {
					unclearReason = '';
				}
			}
		}
	} else if (input.nearestResistance && close <= input.nearestResistance.price * 1.002) {
		side = 'short';
		framing = 'break';
		entryPrice = input.nearestResistance.price;
		entryLabel = 'resistance rejection';
		levelNumber = levelNumberForPrice(input.levelMenu, entryPrice, 'resistance');
		confidence = Math.min(1, input.nearestResistance.strength / 100);
		const target = resolveTarget({
			side,
			entryPrice,
			supports,
			resistances,
			fibPair: null,
		});
		targetPrice = target.targetPrice;
		targetLabel = target.targetLabel;
		targetSource = target.targetSource;
		higherTimeframeAdvisory = target.higherTimeframeAdvisory;
		const upperResistance = resistances.find(r => r.price > input.nearestResistance!.price);
		if (upperResistance) {
			invalidationPrice = upperResistance.price;
			invalidationLabel = 'upper resistance';
		} else {
			invalidationPrice = input.nearestResistance.price * 1.01;
			invalidationLabel = 'resistance break';
		}
		if (confidence >= minConfidence && isFiniteTradePrice(entryPrice)) {
			const entryCheck = assessTradeSetupEntryActionability({
				lastClose: close,
				entryPrice,
				side,
				entryOffsetMode: 'bounce',
				entryProximityPct: deskSeed.entryProximityPct,
				entryProximityMode: deskSeed.entryProximityMode,
				entryProximityAtr,
				entryOffsetPct: deskSeed.entryOffsetPct,
			});
			if (!entryCheck.ok) {
				status = 'unclear';
				unclearReason = entryCheck.unclearReason;
			} else {
				status = targetPrice != null ? 'clear' : 'unclear';
				if (status === 'unclear') {
					unclearReason = 'Resistance framing lacks a measured target.';
				} else {
					unclearReason = '';
				}
			}
		}
	}

	const supportRank =
		input.nearestSupport != null
			? supports.findIndex(s => s.price === input.nearestSupport!.price) + 1 || 1
			: null;
	const resistanceRank =
		input.nearestResistance != null
			? resistances.findIndex(r => r.price === input.nearestResistance!.price) + 1 || 1
			: null;

	const entryOffsetMode: EntryOffsetMode = framing === 'break' ? 'retest' : 'bounce';

	const breakRetestAlternative = buildBreakRetestAlternative({
		lastClose: close,
		menu: input.levelMenu,
		fibPairs: input.fibPairs,
		bars: input.bars,
		supports,
		resistances,
		minConfidence: breakMinConfidence,
	});

	return {
		status,
		source: 'nearest_levels',
		framing,
		entryOffsetMode,
		entryProximityPct: deskSeed.entryProximityPct,
		entryProximityMode: deskSeed.entryProximityMode,
		...(entryProximityAtr != null ? {atrAtLastBar: entryProximityAtr} : {}),
		entryOffsetPct: deskSeed.entryOffsetPct,
		invalidationOffsetPct: deskSeed.invalidationOffsetPct,
		setupPurposeCode: tradeSetupPurposeCode({analysisType: 'key_levels', keyLevelsFraming: framing}),
		levelNumber,
		supportRank: supportRank && supportRank > 0 ? supportRank : null,
		resistanceRank: resistanceRank && resistanceRank > 0 ? resistanceRank : null,
		supportPrice: input.nearestSupport?.price ?? null,
		supportLabel: input.nearestSupport ? 'nearest support' : '',
		resistancePrice: input.nearestResistance?.price ?? null,
		resistanceLabel: input.nearestResistance ? 'nearest resistance' : '',
		lastClose: close,
		side,
		entryPrice,
		entryLabel,
		...(targetPrice != null ? {targetPrice, targetLabel, targetSource} : {}),
		...(higherTimeframeAdvisory ? {higherTimeframeAdvisory} : {}),
		...(invalidationPrice != null ? {invalidationPrice, invalidationLabel} : {}),
		confidence,
		...(unclearReason ? {unclearReason} : {}),
		...(breakRetestAlternative ? {breakRetestAlternative} : {}),
	};
}

export function normalizeKeyLevelsTradeSetup(setup: KeyLevelsTradeSetup) {
	return {
		status: setup.status,
		side: setup.side,
		confidence: setup.confidence,
		lastClose: setup.lastClose,
		entry: isFiniteTradePrice(setup.entryPrice)
			? {price: setup.entryPrice, label: setup.entryLabel}
			: undefined,
		target:
			setup.targetPrice != null && isFiniteTradePrice(setup.targetPrice)
				? {price: setup.targetPrice, label: setup.targetLabel}
				: undefined,
		invalidation:
			setup.invalidationPrice != null && isFiniteTradePrice(setup.invalidationPrice)
				? {price: setup.invalidationPrice, label: setup.invalidationLabel}
				: undefined,
		unclearReason: setup.unclearReason,
	};
}
