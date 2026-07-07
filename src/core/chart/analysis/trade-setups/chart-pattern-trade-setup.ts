import type {
	ChartPatternClassification,
	ChartPatternHitSummary,
	ChartPatternId,
	EnrichedChartPatternHit,
} from '../../../chart-patterns/types.js';
import {
	buildPatternKeyLevels,
	type PatternKeyLevelSummary,
} from '../../../chart-patterns/pattern-menu-summary.js';
import {
	type TradeSetupSide,
	type TradeSetupStatus,
	isFiniteTradePrice,
} from './shared.js';

const TRIGGER_LABEL_HINTS = [
	'neckline',
	'break',
	'rim',
	'reference',
	'resistance',
	'support',
	'upper',
	'lower',
] as const;

const LONG_INVALIDATION_HINTS = ['trough', 'low', 'support', 'bottom', 'pattern low'] as const;
const SHORT_INVALIDATION_HINTS = ['peak', 'high', 'resistance', 'top', 'pattern high'] as const;

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
	triggerPrice: number;
	triggerLabel: string;
	targetPrice?: number;
	targetDirection?: 'up' | 'down';
	targetStatus?: 'projected' | 'active';
	invalidationPrice: number;
	invalidationLabel: string;
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

function labelMatches(label: string, hints: readonly string[]): boolean {
	const lower = label.toLowerCase();
	return hints.some(h => lower.includes(h));
}

function pickTriggerLevel(
	levels: PatternKeyLevelSummary[],
	referencePrice?: number,
): {price: number; label: string} | null {
	if (referencePrice != null && Number.isFinite(referencePrice)) {
		const match = levels.find(l => Math.abs(l.price - referencePrice) < 1e-6);
		return {
			price: referencePrice,
			label: match?.label ?? 'measuredMove reference',
		};
	}
	for (const hint of TRIGGER_LABEL_HINTS) {
		const match = levels.find(l => l.label.toLowerCase().includes(hint));
		if (match) {
			return {price: match.price, label: match.label};
		}
	}
	return levels[0] ? {price: levels[0].price, label: levels[0].label} : null;
}

function pickInvalidationLevel(
	levels: PatternKeyLevelSummary[],
	side: TradeSetupSide,
	triggerPrice: number,
): {price: number; label: string} | null {
	if (side === 'long') {
		const candidates = levels.filter(l => labelMatches(l.label, LONG_INVALIDATION_HINTS));
		const pool = candidates.length ? candidates : levels;
		let best: PatternKeyLevelSummary | null = null;
		for (const level of pool) {
			if (level.price >= triggerPrice) {
				continue;
			}
			if (!best || level.price < best.price) {
				best = level;
			}
		}
		return best ? {price: best.price, label: best.label} : null;
	}
	if (side === 'short') {
		const candidates = levels.filter(l => labelMatches(l.label, SHORT_INVALIDATION_HINTS));
		const pool = candidates.length ? candidates : levels;
		let best: PatternKeyLevelSummary | null = null;
		for (const level of pool) {
			if (level.price <= triggerPrice) {
				continue;
			}
			if (!best || level.price > best.price) {
				best = level;
			}
		}
		return best ? {price: best.price, label: best.label} : null;
	}
	return null;
}

function evaluateTradeSetupClarity(input: {
	side: TradeSetupSide;
	confidence: number;
	triggerPrice?: number;
	invalidationPrice?: number;
	minConfidence?: number;
}): {status: TradeSetupStatus; unclearReason?: string} {
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
			unclearReason: 'No trigger/reference price from pattern key levels or measured move.',
		};
	}
	if (input.invalidationPrice == null || !Number.isFinite(input.invalidationPrice)) {
		return {
			status: 'unclear',
			unclearReason: 'No invalidation level on the opposite pattern boundary.',
		};
	}
	if (input.side === 'long' && input.invalidationPrice >= input.triggerPrice) {
		return {
			status: 'unclear',
			unclearReason: 'Invalidation must sit below trigger for long-bias setups.',
		};
	}
	if (input.side === 'short' && input.invalidationPrice <= input.triggerPrice) {
		return {
			status: 'unclear',
			unclearReason: 'Invalidation must sit above trigger for short-bias setups.',
		};
	}
	return {status: 'clear'};
}

export function buildChartPatternTradeSetupFromHit(
	hit: EnrichedChartPatternHit,
	lastClose: number,
	patternNumber: number,
	options?: {minConfidence?: number},
): ChartPatternTradeSetup {
	const keyLevels = buildPatternKeyLevels(hit);
	const measured = hit.measuredMove;
	const side = sideFromClassification(hit.classification, measured?.direction);
	const trigger = pickTriggerLevel(keyLevels, measured?.referencePrice);
	const invalidation =
		trigger != null ? pickInvalidationLevel(keyLevels, side, trigger.price) : null;
	const clarity = evaluateTradeSetupClarity({
		side,
		confidence: hit.confidence,
		triggerPrice: trigger?.price,
		invalidationPrice: invalidation?.price,
		minConfidence: options?.minConfidence,
	});

	return {
		status: clarity.status,
		source: 'primary_pattern',
		patternNumber,
		patternId: hit.id,
		patternName: hit.name,
		classification: hit.classification,
		confidence: hit.confidence,
		...(hit.completionState ? {completionState: hit.completionState} : {}),
		side,
		lastClose,
		triggerPrice: trigger?.price ?? Number.NaN,
		triggerLabel: trigger?.label ?? '',
		...(measured
			? {
					targetPrice: measured.targetPrice,
					targetDirection: measured.direction,
					targetStatus: measured.status,
				}
			: {}),
		invalidationPrice: invalidation?.price ?? Number.NaN,
		invalidationLabel: invalidation?.label ?? '',
		...(clarity.unclearReason ? {unclearReason: clarity.unclearReason} : {}),
	};
}

export function buildChartPatternTradeSetupFromSummary(
	summary: ChartPatternHitSummary,
	lastClose: number,
	patternNumber: number,
	completionState?: 'forming' | 'completed',
	options?: {minConfidence?: number},
): ChartPatternTradeSetup {
	const measured = summary.measuredMove;
	const side = sideFromClassification(summary.classification, measured?.direction);
	const trigger = pickTriggerLevel(summary.keyLevels, measured?.referencePrice);
	const invalidation =
		trigger != null ? pickInvalidationLevel(summary.keyLevels, side, trigger.price) : null;
	const clarity = evaluateTradeSetupClarity({
		side,
		confidence: summary.confidence,
		triggerPrice: trigger?.price,
		invalidationPrice: invalidation?.price,
		minConfidence: options?.minConfidence,
	});

	return {
		status: clarity.status,
		source: 'primary_pattern',
		patternNumber,
		patternId: summary.id,
		patternName: summary.name,
		classification: summary.classification,
		confidence: summary.confidence,
		...(completionState ? {completionState} : {}),
		side,
		lastClose,
		triggerPrice: trigger?.price ?? Number.NaN,
		triggerLabel: trigger?.label ?? '',
		...(measured
			? {
					targetPrice: measured.targetPrice,
					targetDirection: measured.direction,
					targetStatus: measured.status,
				}
			: {}),
		invalidationPrice: invalidation?.price ?? Number.NaN,
		invalidationLabel: invalidation?.label ?? '',
		...(clarity.unclearReason ? {unclearReason: clarity.unclearReason} : {}),
	};
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
