import type {TrendLine} from '../../levels/trend-lines.js';
import {trendLinePriceAtLastBar} from '../trend-line-menu-summary.js';
import type {TradeSetupSide, TradeSetupStatus} from './shared.js';
import {isFiniteTradePrice} from './shared.js';

export type TrendStructureTradeSetup = {
	status: TradeSetupStatus;
	source: 'trend_structure';
	bias: 'bullish' | 'bearish' | 'neutral';
	structure: 'higher_highs' | 'lower_lows' | 'range' | 'mixed';
	lastClose: number;
	side: TradeSetupSide;
	confidence: number;
	triggerPrice?: number;
	triggerLabel?: string;
	targetPrice?: number;
	targetLabel?: string;
	invalidationPrice?: number;
	invalidationLabel?: string;
	primaryTrendKind?: 'support' | 'resistance';
	primaryTrendTouchCount?: number;
	/** 1-based trendLineMenu index for the bias-aligned entry line (not always menu #1). */
	trendLineNumber?: number;
	entryOffsetMode?: 'retest';
	setupPurposeCode?: string;
	unclearReason?: string;
};

function sideFromBias(bias: 'bullish' | 'bearish' | 'neutral'): TradeSetupSide {
	switch (bias) {
		case 'bullish':
			return 'long';
		case 'bearish':
			return 'short';
		default:
			return 'neutral';
	}
}

function confidenceFromTrend(line: TrendLine | null, structure: TrendStructureTradeSetup['structure']): number {
	let confidence = 0.35;
	if (line) {
		confidence = Math.min(0.85, 0.35 + line.touchCount * 0.08 + line.score * 0.02);
	}
	if (structure === 'higher_highs' || structure === 'lower_lows') {
		confidence = Math.min(0.9, confidence + 0.05);
	}
	return confidence;
}

export function buildTrendStructureTradeSetup(input: {
	bias: 'bullish' | 'bearish' | 'neutral';
	structure: 'higher_highs' | 'lower_lows' | 'range' | 'mixed';
	lastClose: number;
	swingHigh: {price: number} | null;
	swingLow: {price: number} | null;
	primaryTrendLine: TrendLine | null;
	trendLineNumber?: number | null;
	bars: Record<string, unknown>[];
	minConfidence?: number;
}): TrendStructureTradeSetup | null {
	const close = input.lastClose;
	if (!isFiniteTradePrice(close)) {
		return null;
	}
	const side = sideFromBias(input.bias);
	const line = input.primaryTrendLine;
	const confidence = confidenceFromTrend(line, input.structure);
	const minConfidence = input.minConfidence ?? 0.45;

	let triggerPrice: number | undefined;
	let triggerLabel: string | undefined;
	let invalidationPrice: number | undefined;
	let invalidationLabel: string | undefined;
	let targetPrice: number | undefined;
	let targetLabel: string | undefined;
	let unclearReason: string | undefined;

	if (side === 'neutral') {
		unclearReason = 'Trend bias is neutral — no directional trade from structure alone.';
	} else if (!line) {
		unclearReason = 'No ranked trend line met touch threshold for a limit entry.';
	} else if (side === 'long' && line.kind !== 'support') {
		unclearReason = 'Bullish bias expects a support trend line for a long limit entry.';
	} else if (side === 'short' && line.kind !== 'resistance' && line.kind !== 'support') {
		unclearReason = 'Bearish bias expects a resistance or broken-support trend line for a short limit entry.';
	} else {
		const linePrice = trendLinePriceAtLastBar(line, input.bars);
		if (linePrice == null || !isFiniteTradePrice(linePrice)) {
			unclearReason = 'Could not project trade trend line to the current bar.';
		} else if (side === 'short' && line.kind === 'support' && linePrice <= close * 1.001) {
			unclearReason =
				'Bearish short needs broken support above last close for a retest entry — support line sits at or below spot.';
		} else {
			triggerPrice = linePrice;
			if (side === 'short' && line.kind === 'support') {
				triggerLabel = 'broken support retest';
			} else {
				triggerLabel = `${line.kind} trend retest`;
			}
			if (side === 'long' && input.swingLow) {
				invalidationPrice = input.swingLow.price;
				invalidationLabel = 'recent swing low';
			}
			if (side === 'short' && input.swingHigh) {
				invalidationPrice = input.swingHigh.price;
				invalidationLabel = 'recent swing high';
			}
			if (side === 'long' && input.swingHigh && input.swingHigh.price > triggerPrice) {
				targetPrice = input.swingHigh.price;
				targetLabel = 'recent swing high';
			}
			if (side === 'short' && input.swingLow && input.swingLow.price < triggerPrice) {
				targetPrice = input.swingLow.price;
				targetLabel = 'recent swing low';
			}
		}
	}

	let status: TradeSetupStatus = 'unclear';
	if (
		!unclearReason &&
		triggerPrice != null &&
		invalidationPrice != null &&
		confidence >= minConfidence
	) {
		if (side === 'long' && invalidationPrice < triggerPrice) {
			status = 'clear';
		} else if (side === 'short' && invalidationPrice > triggerPrice) {
			status = 'clear';
		} else {
			unclearReason =
				side === 'long'
					? 'Invalidation must sit below trigger for long-bias trend setups.'
					: 'Invalidation must sit above trigger for short-bias trend setups.';
		}
	} else if (!unclearReason && confidence < minConfidence) {
		unclearReason = `Trend setup confidence ${confidence.toFixed(2)} is below threshold ${minConfidence.toFixed(2)}.`;
	}

	return {
		status,
		source: 'trend_structure',
		bias: input.bias,
		structure: input.structure,
		lastClose: close,
		side,
		confidence,
		entryOffsetMode: 'retest',
		setupPurposeCode: 'trend-ret',
		...(isFiniteTradePrice(triggerPrice) ? {triggerPrice, triggerLabel: triggerLabel ?? ''} : {}),
		...(isFiniteTradePrice(targetPrice) ? {targetPrice, targetLabel: targetLabel ?? ''} : {}),
		...(isFiniteTradePrice(invalidationPrice)
			? {invalidationPrice, invalidationLabel: invalidationLabel ?? ''}
			: {}),
		...(line ? {primaryTrendKind: line.kind, primaryTrendTouchCount: line.touchCount} : {}),
		...(input.trendLineNumber != null && input.trendLineNumber >= 1
			? {trendLineNumber: input.trendLineNumber}
			: {}),
		...(unclearReason ? {unclearReason} : {}),
	};
}

export function normalizeTrendStructureTradeSetup(setup: TrendStructureTradeSetup) {
	return {
		status: setup.status,
		side: setup.side,
		confidence: setup.confidence,
		lastClose: setup.lastClose,
		entry:
			setup.triggerPrice != null && isFiniteTradePrice(setup.triggerPrice)
				? {price: setup.triggerPrice, label: setup.triggerLabel ?? 'trend retest'}
				: {price: setup.lastClose, label: 'last close'},
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
