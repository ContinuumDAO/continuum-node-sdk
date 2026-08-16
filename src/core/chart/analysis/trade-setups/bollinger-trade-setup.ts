import type {EntryOffsetMode, EntryProximityMode} from './pattern-limit-entry.js';
import type {TradeSetupSide, TradeSetupStatus} from './shared.js';
import {isFiniteTradePrice} from './shared.js';
import {entryProximityAtrFromOhlcvRows} from './entry-proximity-atr.js';
import {tradeDeskConfig} from './trade-desk-defaults.js';

export const DEFAULT_BOLLINGER_PERIOD = 20;
export const DEFAULT_BOLLINGER_STD_DEV = 2;
export const DEFAULT_BOLLINGER_ENTRY_PROXIMITY_PCT = 5;
export const DEFAULT_BOLLINGER_ENTRY_PROXIMITY_MODE = 'bandWidth' as const;

export type BollingerEntryProximityMode = 'bandWidth' | 'atr';

export type BollingerTradeSetup = {
	status: TradeSetupStatus;
	source: 'bollinger_bands';
	lastClose: number;
	upper: number;
	middle: number;
	lower: number;
	bandWidth: number;
	percentB: number;
	period: number;
	stdDev: number;
	entryProximityPct: number;
	entryProximityMode: BollingerEntryProximityMode;
	entryOffsetMode: EntryOffsetMode;
	entryOffsetPct: number;
	invalidationOffsetPct: number;
	invalidationOffsetMode?: EntryProximityMode;
	atrAtLastBar?: number;
	setupPurposeCode: string;
	invalidated: boolean;
	side: TradeSetupSide;
	entryPrice?: number;
	entryLabel?: string;
	targetPrice?: number;
	targetLabel?: string;
	invalidationPrice?: number;
	invalidationLabel?: string;
	conditionalNote: string;
	confidence: number;
	unclearReason?: string;
};

export function withinBandProximity(
	lastClose: number,
	entryBand: number,
	bandWidth: number,
	proximityPct: number,
): boolean {
	if (!isFiniteTradePrice(lastClose) || !isFiniteTradePrice(entryBand) || bandWidth <= 0) {
		return false;
	}
	const threshold = bandWidth * (proximityPct / 100);
	return Math.abs(lastClose - entryBand) <= threshold;
}

export function withinBollingerEntryProximity(input: {
	lastClose: number;
	entryBand: number;
	bandWidth: number;
	proximityPct: number;
	mode: BollingerEntryProximityMode;
	atrAtLastBar?: number | null;
}): boolean {
	if (
		!isFiniteTradePrice(input.lastClose) ||
		!isFiniteTradePrice(input.entryBand) ||
		input.proximityPct < 0
	) {
		return false;
	}
	if (input.mode === 'atr') {
		const atr = input.atrAtLastBar;
		if (atr == null || !Number.isFinite(atr) || atr <= 0) {
			return false;
		}
		return Math.abs(input.lastClose - input.entryBand) <= atr * (input.proximityPct / 100);
	}
	if (input.bandWidth <= 0) {
		return false;
	}
	return withinBandProximity(
		input.lastClose,
		input.entryBand,
		input.bandWidth,
		input.proximityPct,
	);
}

function bollingerProximityGateLabel(
	pct: number,
	mode: BollingerEntryProximityMode,
): string {
	if (mode === 'atr') {
		return `${pct}% of one ATR bar`;
	}
	return `${pct}% of band width`;
}

export function buildBollingerTradeSetup(input: {
	lastClose: number;
	upper: number;
	middle: number;
	lower: number;
	period: number;
	stdDev: number;
	bars?: Record<string, unknown>[];
	entryProximityPct?: number;
	entryProximityMode?: BollingerEntryProximityMode;
	entryOffsetPct?: number;
	invalidationOffsetPct?: number;
	invalidationOffsetMode?: EntryProximityMode;
	entryProximityAtrPeriod?: number;
}): BollingerTradeSetup | null {
	const close = input.lastClose;
	const upper = input.upper;
	const middle = input.middle;
	const lower = input.lower;
	if (
		!isFiniteTradePrice(close) ||
		!isFiniteTradePrice(upper) ||
		!isFiniteTradePrice(middle) ||
		!isFiniteTradePrice(lower) ||
		upper <= lower
	) {
		return null;
	}

	const bandWidth = upper - lower;
	const percentB = bandWidth > 0 ? (close - lower) / bandWidth : 0.5;
	const desk = tradeDeskConfig({
		entryOffsetPct: input.entryOffsetPct,
		invalidationOffsetPct: input.invalidationOffsetPct,
		invalidationOffsetMode: input.invalidationOffsetMode,
		entryProximityAtrPeriod: input.entryProximityAtrPeriod,
	});
	const atrAtLastBar = input.bars?.length
		? entryProximityAtrFromOhlcvRows(input.bars, desk.entryProximityAtrPeriod)
		: null;
	const entryProximityPct = input.entryProximityPct ?? DEFAULT_BOLLINGER_ENTRY_PROXIMITY_PCT;
	const entryProximityMode = input.entryProximityMode ?? DEFAULT_BOLLINGER_ENTRY_PROXIMITY_MODE;
	const proximityGateLabel = bollingerProximityGateLabel(entryProximityPct, entryProximityMode);
	const middleEps = bandWidth * 0.001;

	let side: TradeSetupSide = 'neutral';
	let status: TradeSetupStatus = 'unclear';
	let invalidated = false;
	let confidence = 0.4;
	let conditionalNote =
		'Price at the Bollinger middle — wait for a fade setup toward an outer band.';
	let unclearReason = 'No directional Bollinger fade — price is near the middle band.';

	if (close > middle + middleEps) {
		side = 'short';
		conditionalNote =
			'Price above middle band — conditional short fade at upper band toward lower band.';
		if (close > upper) {
			invalidated = true;
			unclearReason = 'Invalidated: price closed above upper Bollinger band.';
		} else if (
			withinBollingerEntryProximity({
				lastClose: close,
				entryBand: upper,
				bandWidth,
				proximityPct: entryProximityPct,
				mode: entryProximityMode,
				atrAtLastBar,
			})
		) {
			status = 'clear';
			unclearReason = '';
			confidence = 0.52;
		} else {
			unclearReason = `Price not within ${proximityGateLabel} of upper band — wait for fade entry.`;
		}
	} else if (close < middle - middleEps) {
		side = 'long';
		conditionalNote =
			'Price below middle band — conditional long fade at lower band toward upper band.';
		if (close < lower) {
			invalidated = true;
			unclearReason = 'Invalidated: price closed below lower Bollinger band.';
		} else if (
			withinBollingerEntryProximity({
				lastClose: close,
				entryBand: lower,
				bandWidth,
				proximityPct: entryProximityPct,
				mode: entryProximityMode,
				atrAtLastBar,
			})
		) {
			status = 'clear';
			unclearReason = '';
			confidence = 0.52;
		} else {
			unclearReason = `Price not within ${proximityGateLabel} of lower band — wait for fade entry.`;
		}
	}

	const entryPrice =
		status === 'clear' && side === 'short'
			? upper
			: status === 'clear' && side === 'long'
				? lower
				: undefined;
	const entryLabel =
		side === 'short' ? 'upper band' : side === 'long' ? 'lower band' : undefined;
	const targetPrice =
		status === 'clear' && side === 'short' ? lower : status === 'clear' && side === 'long' ? upper : undefined;
	const targetLabel =
		side === 'short' ? 'lower band' : side === 'long' ? 'upper band' : undefined;
	const invalidationPrice =
		status === 'clear' && side === 'short'
			? upper
			: status === 'clear' && side === 'long'
				? lower
				: undefined;
	const invalidationLabel =
		side === 'short' ? 'above upper band' : side === 'long' ? 'below lower band' : undefined;

	if (invalidated) {
		status = 'unclear';
	}

	return {
		status,
		source: 'bollinger_bands',
		lastClose: close,
		upper,
		middle,
		lower,
		bandWidth,
		percentB,
		period: input.period,
		stdDev: input.stdDev,
		entryProximityPct,
		entryProximityMode,
		entryOffsetMode: 'bounce',
		entryOffsetPct: desk.entryOffsetPct,
		invalidationOffsetPct: desk.invalidationOffsetPct,
		invalidationOffsetMode: desk.invalidationOffsetMode,
		...(atrAtLastBar != null ? {atrAtLastBar} : {}),
		setupPurposeCode: 'bb-fade',
		invalidated,
		side,
		conditionalNote,
		confidence,
		...(entryPrice != null && entryLabel
			? {entryPrice, entryLabel}
			: {}),
		...(targetPrice != null && targetLabel
			? {targetPrice, targetLabel}
			: {}),
		...(invalidationPrice != null && invalidationLabel
			? {invalidationPrice, invalidationLabel}
			: {}),
		...(unclearReason ? {unclearReason} : {}),
	};
}

export type BollingerTradeIdeaContext = {
	percentB: number;
	bandWidth: number;
	bandWidthPct?: number;
	invalidated: boolean;
	setupPurposeCode: string;
	entryProximityPct: number;
	entryOffsetPct: number;
	invalidationOffsetPct: number;
	period: number;
	stdDev: number;
	middle: number;
	upper: number;
	lower: number;
};

export function bollingerTradeIdeaContextFromSetup(
	setup: BollingerTradeSetup,
): BollingerTradeIdeaContext {
	const bandWidthPct =
		setup.middle > 0 && Number.isFinite(setup.middle)
			? (setup.bandWidth / setup.middle) * 100
			: undefined;
	return {
		percentB: setup.percentB,
		bandWidth: setup.bandWidth,
		...(bandWidthPct != null ? {bandWidthPct} : {}),
		invalidated: setup.invalidated,
		setupPurposeCode: setup.setupPurposeCode,
		entryProximityPct: setup.entryProximityPct,
		entryOffsetPct: setup.entryOffsetPct,
		invalidationOffsetPct: setup.invalidationOffsetPct,
		period: setup.period,
		stdDev: setup.stdDev,
		middle: setup.middle,
		upper: setup.upper,
		lower: setup.lower,
	};
}

export function normalizeBollingerTradeSetup(setup: BollingerTradeSetup) {
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
				? {price: setup.entryPrice, label: setup.entryLabel ?? 'band entry'}
				: undefined,
		...(setup.targetPrice != null && isFiniteTradePrice(setup.targetPrice)
			? {target: {price: setup.targetPrice, label: setup.targetLabel ?? 'opposite band'}}
			: {}),
		...(setup.invalidationPrice != null && isFiniteTradePrice(setup.invalidationPrice)
			? {
					invalidation: {
						price: setup.invalidationPrice,
						label: setup.invalidationLabel ?? 'band breach',
					},
				}
			: {}),
		unclearReason: setup.unclearReason,
	};
}
