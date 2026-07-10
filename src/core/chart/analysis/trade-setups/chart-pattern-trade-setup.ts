import type {
	ChartPatternClassification,
	ChartPatternHitSummary,
	ChartPatternId,
	EnrichedChartPatternHit,
} from '../../../chart-patterns/types.js';
import {buildPatternKeyLevels} from '../../../chart-patterns/pattern-menu-summary.js';
import {
	type EntryOffsetMode,
	type PatternEntryPhase,
	resolvePatternLimitLevels,
} from './pattern-limit-entry.js';
import {
	type TradeSetupSide,
	type TradeSetupStatus,
	isFiniteTradePrice,
} from './shared.js';
import {tradeSetupPurposeCode} from './trade-purpose-format.js';

export type ChartPatternTradeSetup = {
	status: TradeSetupStatus;
	source: 'primary_pattern';
	patternNumber: number;
	patternId: ChartPatternId;
	patternName: string;
	classification: ChartPatternClassification;
	confidence: number;
	completionState?: 'forming' | 'completed';
	side: TradeSetupSide;
	lastClose: number;
	triggerPrice?: number;
	triggerLabel?: string;
	targetPrice?: number;
	targetDirection?: 'up' | 'down';
	targetStatus?: 'projected' | 'active';
	invalidationPrice?: number;
	invalidationLabel?: string;
	entryPhase?: PatternEntryPhase;
	entryOffsetMode?: EntryOffsetMode;
	setupPurposeCode?: string;
	unclearReason?: string;
};

function sideFromClassification(
	classification: ChartPatternClassification,
	measuredDirection?: 'up' | 'down',
): TradeSetupSide {
	switch (classification) {
		case 'bullish':
		case 'moderately_bullish':
			return 'long';
		case 'bearish':
		case 'moderately_bearish':
			return 'short';
		default:
			if (measuredDirection === 'up') {
				return 'long';
			}
			if (measuredDirection === 'down') {
				return 'short';
			}
			return 'neutral';
	}
}

function evaluateTradeSetupClarity(input: {
	side: TradeSetupSide;
	confidence: number;
	triggerPrice?: number;
	invalidationPrice?: number;
	minConfidence?: number;
	unclearReason?: string;
}): {status: TradeSetupStatus; unclearReason?: string} {
	if (input.unclearReason) {
		return {status: 'unclear', unclearReason: input.unclearReason};
	}
	const minConfidence = input.minConfidence ?? 0.45;
	if (input.side === 'neutral') {
		return {
			status: 'unclear',
			unclearReason:
				'Primary pattern classification is neutral with no directional measured move.',
		};
	}
	if (input.confidence < minConfidence) {
		return {
			status: 'unclear',
			unclearReason: `Primary pattern confidence ${input.confidence.toFixed(2)} is below threshold ${minConfidence.toFixed(2)}.`,
		};
	}
	if (input.triggerPrice == null || !Number.isFinite(input.triggerPrice)) {
		return {
			status: 'unclear',
			unclearReason: 'No trigger/reference price from pattern limit rules.',
		};
	}
	if (input.invalidationPrice == null || !Number.isFinite(input.invalidationPrice)) {
		return {
			status: 'unclear',
			unclearReason: 'No invalidation level on the opposite pattern boundary.',
		};
	}
	if (input.side === 'long' && input.invalidationPrice > input.triggerPrice) {
		return {
			status: 'unclear',
			unclearReason: 'Invalidation must sit below trigger for long-bias setups.',
		};
	}
	if (input.side === 'short' && input.invalidationPrice < input.triggerPrice) {
		return {
			status: 'unclear',
			unclearReason: 'Invalidation must sit above trigger for short-bias setups.',
		};
	}
	return {status: 'clear'};
}

function buildFromResolvedResult(
	input: {
		patternId: ChartPatternId;
		patternName: string;
		classification: ChartPatternClassification;
		confidence: number;
		completionState?: 'forming' | 'completed';
		lastClose: number;
		patternNumber: number;
		measured?: ChartPatternHitSummary['measuredMove'];
		classificationSide: TradeSetupSide;
		minConfidence?: number;
	},
	resolved: ReturnType<typeof resolvePatternLimitLevels>,
): ChartPatternTradeSetup {
	const measured = input.measured;
	let side = input.classificationSide;
	let triggerPrice: number | undefined;
	let triggerLabel: string | undefined;
	let invalidationPrice: number | undefined;
	let invalidationLabel: string | undefined;
	let entryPhase: PatternEntryPhase | undefined;
	let entryOffsetMode: EntryOffsetMode | undefined;
	let resolverUnclear: string | undefined;

	if (resolved.ok) {
		side = resolved.levels.limitSide;
		triggerPrice = resolved.levels.triggerPrice;
		triggerLabel = resolved.levels.triggerLabel;
		invalidationPrice = resolved.levels.invalidationPrice;
		invalidationLabel = resolved.levels.invalidationLabel;
		entryPhase = resolved.levels.entryPhase;
		entryOffsetMode = resolved.levels.entryOffsetMode;
	} else {
		resolverUnclear = resolved.unclearReason;
	}

	const clarity = evaluateTradeSetupClarity({
		side,
		confidence: input.confidence,
		triggerPrice,
		invalidationPrice,
		minConfidence: input.minConfidence,
		unclearReason: resolverUnclear,
	});

	const setupPurposeCode =
		clarity.status === 'clear'
			? tradeSetupPurposeCode({
					analysisType: 'chart_pattern',
					patternId: input.patternId,
					entryPhase,
					entryOffsetMode,
				})
			: undefined;

	return {
		status: clarity.status,
		source: 'primary_pattern',
		patternNumber: input.patternNumber,
		patternId: input.patternId,
		patternName: input.patternName,
		classification: input.classification,
		confidence: input.confidence,
		...(input.completionState ? {completionState: input.completionState} : {}),
		side,
		lastClose: input.lastClose,
		...(isFiniteTradePrice(triggerPrice)
			? {triggerPrice, triggerLabel: triggerLabel ?? ''}
			: {}),
		...(measured
			? {
					targetPrice: measured.targetPrice,
					targetDirection: measured.direction,
					targetStatus: measured.status,
				}
			: {}),
		...(isFiniteTradePrice(invalidationPrice)
			? {invalidationPrice, invalidationLabel: invalidationLabel ?? ''}
			: {}),
		...(entryPhase ? {entryPhase} : {}),
		...(entryOffsetMode ? {entryOffsetMode} : {}),
		...(setupPurposeCode ? {setupPurposeCode} : {}),
		...(clarity.unclearReason ? {unclearReason: clarity.unclearReason} : {}),
	};
}

/** Strip non-finite prices before JSON/MCP output (NaN serializes as null). */
export function sanitizeChartPatternTradeSetupForOutput(
	setup: ChartPatternTradeSetup | null | undefined,
): ChartPatternTradeSetup | null {
	if (!setup) {
		return null;
	}
	const out: ChartPatternTradeSetup = {...setup};
	if (!isFiniteTradePrice(out.triggerPrice)) {
		delete out.triggerPrice;
		delete out.triggerLabel;
	}
	if (!isFiniteTradePrice(out.invalidationPrice)) {
		delete out.invalidationPrice;
		delete out.invalidationLabel;
	}
	if (!isFiniteTradePrice(out.targetPrice)) {
		delete out.targetPrice;
		delete out.targetDirection;
		delete out.targetStatus;
	}
	return out;
}

export function buildChartPatternTradeSetupFromHit(
	hit: EnrichedChartPatternHit,
	lastClose: number,
	patternNumber: number,
	options?: {minConfidence?: number; entryProximityPct?: number},
): ChartPatternTradeSetup {
	const keyLevels = buildPatternKeyLevels(hit);
	const measured = hit.measuredMove;
	const classificationSide = sideFromClassification(hit.classification, measured?.direction);
	const resolved = resolvePatternLimitLevels({
		patternId: hit.id,
		lastClose,
		keyLevels,
		classificationSide,
		entryProximityPct: options?.entryProximityPct,
	});
	return buildFromResolvedResult(
		{
			patternId: hit.id,
			patternName: hit.name,
			classification: hit.classification,
			confidence: hit.confidence,
			completionState: hit.completionState,
			lastClose,
			patternNumber,
			measured,
			classificationSide,
			minConfidence: options?.minConfidence,
		},
		resolved,
	);
}

export function buildChartPatternTradeSetupFromSummary(
	summary: ChartPatternHitSummary,
	lastClose: number,
	patternNumber: number,
	completionState?: 'forming' | 'completed',
	options?: {minConfidence?: number; entryProximityPct?: number},
): ChartPatternTradeSetup {
	const measured = summary.measuredMove;
	const classificationSide = sideFromClassification(summary.classification, measured?.direction);
	const resolved = resolvePatternLimitLevels({
		patternId: summary.id,
		lastClose,
		keyLevels: summary.keyLevels,
		classificationSide,
		entryProximityPct: options?.entryProximityPct,
	});
	return buildFromResolvedResult(
		{
			patternId: summary.id,
			patternName: summary.name,
			classification: summary.classification,
			confidence: summary.confidence,
			completionState,
			lastClose,
			patternNumber,
			measured,
			classificationSide,
			minConfidence: options?.minConfidence,
		},
		resolved,
	);
}

export function normalizeChartPatternTradeSetup(setup: ChartPatternTradeSetup): {
	status: TradeSetupStatus;
	side: TradeSetupSide;
	confidence: number;
	lastClose: number;
	entry?: {price: number; label?: string};
	target?: {price: number; label?: string};
	invalidation?: {price: number; label?: string};
	unclearReason?: string;
} {
	const entry = isFiniteTradePrice(setup.triggerPrice)
		? {price: setup.triggerPrice, label: setup.triggerLabel || undefined}
		: undefined;
	const target = isFiniteTradePrice(setup.targetPrice)
		? {price: setup.targetPrice!, label: 'measured move'}
		: undefined;
	const invalidation = isFiniteTradePrice(setup.invalidationPrice)
		? {price: setup.invalidationPrice, label: setup.invalidationLabel || undefined}
		: undefined;
	return {
		status: setup.status,
		side: setup.side,
		confidence: setup.confidence,
		lastClose: setup.lastClose,
		entry,
		target,
		invalidation,
		unclearReason: setup.unclearReason,
	};
}
