import type {TrendLine} from '../../levels/trend-lines.js';
import {detectSwingsFromBars} from '../../levels/key-levels.js';
import {trendLinePriceAtLastBar} from '../trend-line-menu-summary.js';
import type {TradeSetupSide, TradeSetupStatus} from './shared.js';
import {isFiniteTradePrice} from './shared.js';
import {DEFAULT_TRADE_DESK_INVALIDATION_OFFSET_PCT} from './trade-desk-defaults.js';

export type TrendStructureMeasuredMove = {
	targetPrice: number;
	referencePrice: number;
	height: number;
	direction: 'up' | 'down';
	formula: string;
	status: 'projected';
};

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
	/** Impulse-leg projection from entry — supplementary to swing targetPrice. */
	measuredMove?: TrendStructureMeasuredMove;
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

/** Relative gap required between entry and invalidation for a clear trend setup. */
export const TREND_MIN_INVALIDATION_GAP_PCT = 0.15;

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

function uniqueSortedPrices(prices: number[]): number[] {
	const out: number[] = [];
	for (const price of prices) {
		if (!isFiniteTradePrice(price)) {
			continue;
		}
		if (out.some(p => Math.abs(p - price) < 1e-9)) {
			continue;
		}
		out.push(price);
	}
	return out.sort((a, b) => a - b);
}

function swingLookback(bars: Record<string, unknown>[]): number {
	return Math.max(2, Math.min(5, Math.floor(bars.length / 10)));
}

function collectSwingPrices(
	kind: 'support' | 'resistance',
	bars: Record<string, unknown>[],
	primary: {price: number} | null,
	extras?: Array<{price: number}> | null,
): number[] {
	const prices: number[] = [];
	if (primary && isFiniteTradePrice(primary.price)) {
		prices.push(primary.price);
	}
	for (const row of extras ?? []) {
		if (row && isFiniteTradePrice(row.price)) {
			prices.push(row.price);
		}
	}
	if (bars.length >= swingLookback(bars) * 2 + 1) {
		for (const swing of detectSwingsFromBars(bars, swingLookback(bars))) {
			if (swing.kind === kind) {
				prices.push(swing.price);
			}
		}
	}
	return uniqueSortedPrices(prices);
}

function minInvalidationGapPrice(triggerPrice: number, side: 'long' | 'short'): number {
	const gap = triggerPrice * (TREND_MIN_INVALIDATION_GAP_PCT / 100);
	return side === 'short' ? triggerPrice + gap : triggerPrice - gap;
}

/**
 * Invalidation for trend retests must sit beyond the entry line — not on the same
 * swing that anchors the line (which collapses risk to ~0).
 *
 * Short: prefer a swing high clearly above entry; else buffer above the line.
 * Long: prefer a swing low clearly below entry; else buffer below the line.
 */
export function resolveTrendStructureInvalidation(input: {
	side: 'long' | 'short';
	triggerPrice: number;
	swingHigh: {price: number} | null;
	swingLow: {price: number} | null;
	swingHighs?: Array<{price: number}> | null;
	swingLows?: Array<{price: number}> | null;
	bars: Record<string, unknown>[];
	invalidationOffsetPct?: number;
}): {price: number; label: string} | null {
	const trigger = input.triggerPrice;
	if (!isFiniteTradePrice(trigger)) {
		return null;
	}
	const offsetPct =
		input.invalidationOffsetPct ?? DEFAULT_TRADE_DESK_INVALIDATION_OFFSET_PCT;
	const minGapPrice = minInvalidationGapPrice(trigger, input.side);

	if (input.side === 'short') {
		const highs = collectSwingPrices('resistance', input.bars, input.swingHigh, input.swingHighs);
		// Nearest swing high that clears the minimum gap above entry.
		const above = highs.filter(price => price >= minGapPrice);
		if (above.length > 0) {
			const price = above[0]!;
			return {price, label: 'recent swing high'};
		}
		const buffered = trigger * (1 + offsetPct / 100);
		if (buffered >= minGapPrice) {
			return {price: buffered, label: 'above resistance retest'};
		}
		return null;
	}

	const lows = collectSwingPrices('support', input.bars, input.swingLow, input.swingLows);
	const below = lows.filter(price => price <= minGapPrice);
	if (below.length > 0) {
		const price = below[below.length - 1]!;
		return {price, label: 'recent swing low'};
	}
	const buffered = trigger * (1 - offsetPct / 100);
	if (buffered <= minGapPrice) {
		return {price: buffered, label: 'below support retest'};
	}
	return null;
}

function invalidationClearsEntry(
	side: 'long' | 'short',
	triggerPrice: number,
	invalidationPrice: number,
): boolean {
	const minGap = minInvalidationGapPrice(triggerPrice, side);
	return side === 'short' ? invalidationPrice >= minGap : invalidationPrice <= minGap;
}

export function computeTrendStructureImpulseMeasuredMove(input: {
	side: TradeSetupSide;
	triggerPrice?: number;
	swingHigh: {price: number} | null;
	swingLow: {price: number} | null;
}): TrendStructureMeasuredMove | undefined {
	if (input.side !== 'long' && input.side !== 'short') {
		return undefined;
	}
	if (!isFiniteTradePrice(input.triggerPrice)) {
		return undefined;
	}
	if (!input.swingHigh || !input.swingLow) {
		return undefined;
	}
	const high = input.swingHigh.price;
	const low = input.swingLow.price;
	if (!isFiniteTradePrice(high) || !isFiniteTradePrice(low)) {
		return undefined;
	}
	const height = high - low;
	if (height <= 0) {
		return undefined;
	}
	const entry = input.triggerPrice!;
	if (input.side === 'long') {
		const targetPrice = entry + height;
		if (!isFiniteTradePrice(targetPrice) || targetPrice <= entry) {
			return undefined;
		}
		return {
			targetPrice,
			referencePrice: entry,
			height,
			direction: 'up',
			formula: 'entry + (swingHigh - swingLow)',
			status: 'projected',
		};
	}
	const targetPrice = entry - height;
	if (!isFiniteTradePrice(targetPrice) || targetPrice >= entry) {
		return undefined;
	}
	return {
		targetPrice,
		referencePrice: entry,
		height,
		direction: 'down',
		formula: 'entry - (swingHigh - swingLow)',
		status: 'projected',
	};
}

export function buildTrendStructureTradeSetup(input: {
	bias: 'bullish' | 'bearish' | 'neutral';
	structure: 'higher_highs' | 'lower_lows' | 'range' | 'mixed';
	lastClose: number;
	swingHigh: {price: number} | null;
	swingLow: {price: number} | null;
	/** Optional extra swing highs (newest-first or unsorted) for invalidation selection. */
	swingHighs?: Array<{price: number}> | null;
	/** Optional extra swing lows for invalidation selection. */
	swingLows?: Array<{price: number}> | null;
	primaryTrendLine: TrendLine | null;
	trendLineNumber?: number | null;
	bars: Record<string, unknown>[];
	minConfidence?: number;
	invalidationOffsetPct?: number;
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
			const invalidation = resolveTrendStructureInvalidation({
				side,
				triggerPrice,
				swingHigh: input.swingHigh,
				swingLow: input.swingLow,
				swingHighs: input.swingHighs,
				swingLows: input.swingLows,
				bars: input.bars,
				invalidationOffsetPct: input.invalidationOffsetPct,
			});
			if (invalidation) {
				invalidationPrice = invalidation.price;
				invalidationLabel = invalidation.label;
			} else {
				unclearReason =
					side === 'long'
						? 'No swing low / buffer below the support retest for invalidation.'
						: 'No swing high / buffer above the resistance retest for invalidation.';
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
		(side === 'long' || side === 'short') &&
		triggerPrice != null &&
		invalidationPrice != null &&
		confidence >= minConfidence
	) {
		if (invalidationClearsEntry(side, triggerPrice, invalidationPrice)) {
			status = 'clear';
		} else {
			unclearReason =
				side === 'long'
					? 'Invalidation must sit meaningfully below trigger for long-bias trend setups.'
					: 'Invalidation must sit meaningfully above trigger for short-bias trend setups.';
		}
	} else if (!unclearReason && confidence < minConfidence) {
		unclearReason = `Trend setup confidence ${confidence.toFixed(2)} is below threshold ${minConfidence.toFixed(2)}.`;
	}

	const measuredMove = computeTrendStructureImpulseMeasuredMove({
		side,
		triggerPrice,
		swingHigh: input.swingHigh,
		swingLow: input.swingLow,
	});

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
		...(measuredMove ? {measuredMove} : {}),
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
