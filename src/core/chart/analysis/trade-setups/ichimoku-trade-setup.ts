import type {EntryOffsetMode, EntryProximityMode} from './pattern-limit-entry.js';
import type {TradeSetupSide, TradeSetupStatus} from './shared.js';
import {isFiniteTradePrice} from './shared.js';
import {tradeDeskConfig} from './trade-desk-defaults.js';

export const DEFAULT_ICHIMOKU_CONVERSION_PERIOD = 9;
export const DEFAULT_ICHIMOKU_BASE_PERIOD = 26;
export const DEFAULT_ICHIMOKU_SPAN_PERIOD = 52;
export const DEFAULT_ICHIMOKU_DISPLACEMENT = 26;
export const DEFAULT_ICHIMOKU_TARGET_ATR_MULTIPLE = 3;
export const DEFAULT_ICHIMOKU_CROSS_LOOKBACK = 5;

export type IchimokuStrategy = 'tk_cross' | 'cloud';

export type IchimokuPoint = {
	conversion: number;
	base: number;
	spanA: number;
	spanB: number;
};

export type IchimokuTradeSetup = {
	status: TradeSetupStatus;
	source: 'ichimoku';
	strategy: IchimokuStrategy;
	lastClose: number;
	conversion: number;
	base: number;
	/** Cloud at current bar (spans computed displacement bars ago). */
	cloudTop: number;
	cloudBottom: number;
	spanA: number;
	spanB: number;
	conversionPeriod: number;
	basePeriod: number;
	spanPeriod: number;
	displacement: number;
	tkState: 'bullish' | 'bearish' | 'flat';
	cloudPosition: 'above' | 'below' | 'inside';
	entryProximityPct: number;
	entryOffsetMode: EntryOffsetMode;
	entryOffsetPct: number;
	invalidationOffsetPct: number;
	invalidationOffsetMode?: EntryProximityMode;
	atrAtLastBar?: number;
	targetAtrMultiple: number;
	setupPurposeCode: string;
	invalidated: boolean;
	side: TradeSetupSide;
	barsSinceTkCross: number | null;
	entryPrice?: number;
	entryLabel?: string;
	targetPrice?: number;
	targetLabel?: string;
	invalidationPrice?: number;
	invalidationLabel?: string;
	conditionalNote: string;
	confidence: number;
	unclearReason?: string;
	tkCrossAlternative?: IchimokuTradeSetup | null;
	cloudAlternative?: IchimokuTradeSetup | null;
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
	return DEFAULT_ICHIMOKU_TARGET_ATR_MULTIPLE;
}

function cloudBounds(spanA: number, spanB: number): {top: number; bottom: number} {
	return {top: Math.max(spanA, spanB), bottom: Math.min(spanA, spanB)};
}

function cloudPositionOf(
	lastClose: number,
	top: number,
	bottom: number,
): 'above' | 'below' | 'inside' {
	if (lastClose > top) {
		return 'above';
	}
	if (lastClose < bottom) {
		return 'below';
	}
	return 'inside';
}

function tkStateOf(conversion: number, base: number): 'bullish' | 'bearish' | 'flat' {
	if (conversion > base) {
		return 'bullish';
	}
	if (conversion < base) {
		return 'bearish';
	}
	return 'flat';
}

/** Current-bar cloud uses spans from barIndex - displacement (classic plot alignment). */
export function currentCloudFromPoints(
	points: Array<IchimokuPoint | null>,
	displacement: number,
): {spanA: number; spanB: number; top: number; bottom: number} | null {
	const idx = points.length - 1 - displacement;
	if (idx < 0) {
		return null;
	}
	const p = points[idx];
	if (p == null || ![p.spanA, p.spanB].every(isFiniteTradePrice)) {
		return null;
	}
	const bounds = cloudBounds(p.spanA, p.spanB);
	return {spanA: p.spanA, spanB: p.spanB, top: bounds.top, bottom: bounds.bottom};
}

function findBarsSinceTkCross(points: Array<IchimokuPoint | null>): number | null {
	let prevState: 'bullish' | 'bearish' | 'flat' | null = null;
	let lastCrossAt: number | null = null;
	for (let i = 0; i < points.length; i++) {
		const p = points[i];
		if (p == null || ![p.conversion, p.base].every(isFiniteTradePrice)) {
			continue;
		}
		const state = tkStateOf(p.conversion, p.base);
		if (
			prevState != null &&
			prevState !== 'flat' &&
			state !== 'flat' &&
			state !== prevState
		) {
			lastCrossAt = i;
		}
		prevState = state;
	}
	if (lastCrossAt == null) {
		return null;
	}
	return points.length - 1 - lastCrossAt;
}

function atrTargetAndCloudStop(input: {
	side: TradeSetupSide;
	status: TradeSetupStatus;
	entryPrice: number | undefined;
	cloudTop: number;
	cloudBottom: number;
	base: number;
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
	const invalidationPrice =
		input.side === 'long'
			? Math.min(input.cloudBottom, input.base)
			: Math.max(input.cloudTop, input.base);
	const invalidationLabel =
		input.side === 'long' ? 'Below cloud / kijun' : 'Above cloud / kijun';
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
		targetLabel =
			input.side === 'long'
				? `entry + ${multiple}× ATR`
				: `entry - ${multiple}× ATR`;
	}
	return {
		...(targetPrice != null && targetLabel ? {targetPrice, targetLabel} : {}),
		...(isFiniteTradePrice(invalidationPrice)
			? {invalidationPrice, invalidationLabel}
			: {}),
	};
}

export function buildTkCrossIchimokuSetup(input: {
	lastClose: number;
	conversion: number;
	base: number;
	cloudTop: number;
	cloudBottom: number;
	spanA: number;
	spanB: number;
	barsSinceTkCross: number | null;
	conversionPeriod: number;
	basePeriod: number;
	spanPeriod: number;
	displacement: number;
	entryProximityPct?: number;
	entryOffsetPct?: number;
	invalidationOffsetPct?: number;
	invalidationOffsetMode?: EntryProximityMode;
	atr?: number | null;
	targetAtrMultiple?: number;
	crossLookback?: number;
}): IchimokuTradeSetup | null {
	if (
		![
			input.lastClose,
			input.conversion,
			input.base,
			input.cloudTop,
			input.cloudBottom,
		].every(isFiniteTradePrice)
	) {
		return null;
	}
	const desk = tradeDeskConfig({
		entryProximityPct: input.entryProximityPct,
		entryOffsetPct: input.entryOffsetPct,
		invalidationOffsetPct: input.invalidationOffsetPct,
		invalidationOffsetMode: input.invalidationOffsetMode,
	});
	const targetAtrMultiple = resolveTargetAtrMultiple(input.targetAtrMultiple);
	const atr =
		input.atr != null && Number.isFinite(input.atr) && input.atr > 0 ? input.atr : undefined;
	const tkState = tkStateOf(input.conversion, input.base);
	const cloudPosition = cloudPositionOf(input.lastClose, input.cloudTop, input.cloudBottom);
	const lookback = input.crossLookback ?? DEFAULT_ICHIMOKU_CROSS_LOOKBACK;
	const freshCross =
		input.barsSinceTkCross != null &&
		input.barsSinceTkCross >= 0 &&
		input.barsSinceTkCross <= lookback;

	let side: TradeSetupSide = 'neutral';
	let status: TradeSetupStatus = 'unclear';
	let confidence = 0.4;
	let conditionalNote = 'No fresh Tenkan/Kijun cross with cloud alignment.';
	let unclearReason = conditionalNote;

	if (freshCross && tkState === 'bullish' && cloudPosition === 'above') {
		side = 'long';
		status = 'clear';
		unclearReason = '';
		confidence = input.barsSinceTkCross === 0 ? 0.6 : 0.54;
		conditionalNote = 'Bullish TK cross with price above the cloud.';
	} else if (freshCross && tkState === 'bearish' && cloudPosition === 'below') {
		side = 'short';
		status = 'clear';
		unclearReason = '';
		confidence = input.barsSinceTkCross === 0 ? 0.6 : 0.54;
		conditionalNote = 'Bearish TK cross with price below the cloud.';
	} else if (freshCross && tkState !== 'flat') {
		side = tkState === 'bullish' ? 'long' : 'short';
		unclearReason = `TK cross ${tkState} but price is ${cloudPosition} the cloud.`;
		conditionalNote = unclearReason;
		confidence = 0.42;
	}

	const entryPrice = status === 'clear' ? input.lastClose : undefined;
	const entryLabel = status === 'clear' ? 'last close (TK cross)' : undefined;
	const levels = atrTargetAndCloudStop({
		side,
		status,
		entryPrice,
		cloudTop: input.cloudTop,
		cloudBottom: input.cloudBottom,
		base: input.base,
		atr,
		targetAtrMultiple,
	});

	return {
		status,
		source: 'ichimoku',
		strategy: 'tk_cross',
		lastClose: input.lastClose,
		conversion: input.conversion,
		base: input.base,
		cloudTop: input.cloudTop,
		cloudBottom: input.cloudBottom,
		spanA: input.spanA,
		spanB: input.spanB,
		conversionPeriod: input.conversionPeriod,
		basePeriod: input.basePeriod,
		spanPeriod: input.spanPeriod,
		displacement: input.displacement,
		tkState,
		cloudPosition,
		entryProximityPct: desk.entryProximityPct,
		entryOffsetMode: 'bounce',
		entryOffsetPct: desk.entryOffsetPct,
		invalidationOffsetPct: desk.invalidationOffsetPct,
		invalidationOffsetMode: desk.invalidationOffsetMode,
		targetAtrMultiple,
		setupPurposeCode: 'ichi-tk',
		invalidated: false,
		side,
		barsSinceTkCross: input.barsSinceTkCross,
		conditionalNote,
		confidence,
		...(atr != null ? {atrAtLastBar: atr} : {}),
		...(entryPrice != null && entryLabel ? {entryPrice, entryLabel} : {}),
		...levels,
		...(unclearReason ? {unclearReason} : {}),
	};
}

export function buildCloudIchimokuSetup(input: {
	lastClose: number;
	conversion: number;
	base: number;
	cloudTop: number;
	cloudBottom: number;
	spanA: number;
	spanB: number;
	barsSinceTkCross: number | null;
	conversionPeriod: number;
	basePeriod: number;
	spanPeriod: number;
	displacement: number;
	entryProximityPct?: number;
	entryOffsetPct?: number;
	invalidationOffsetPct?: number;
	invalidationOffsetMode?: EntryProximityMode;
	atr?: number | null;
	targetAtrMultiple?: number;
}): IchimokuTradeSetup | null {
	if (
		![
			input.lastClose,
			input.conversion,
			input.base,
			input.cloudTop,
			input.cloudBottom,
		].every(isFiniteTradePrice)
	) {
		return null;
	}
	const desk = tradeDeskConfig({
		entryProximityPct: input.entryProximityPct,
		entryOffsetPct: input.entryOffsetPct,
		invalidationOffsetPct: input.invalidationOffsetPct,
		invalidationOffsetMode: input.invalidationOffsetMode,
	});
	const targetAtrMultiple = resolveTargetAtrMultiple(input.targetAtrMultiple);
	const atr =
		input.atr != null && Number.isFinite(input.atr) && input.atr > 0 ? input.atr : undefined;
	const tkState = tkStateOf(input.conversion, input.base);
	const cloudPosition = cloudPositionOf(input.lastClose, input.cloudTop, input.cloudBottom);
	const nearKijun = withinPriceProximity(input.lastClose, input.base, desk.entryProximityPct);
	const nearCloudEdgeLong = withinPriceProximity(
		input.lastClose,
		input.cloudBottom,
		desk.entryProximityPct,
	);
	const nearCloudEdgeShort = withinPriceProximity(
		input.lastClose,
		input.cloudTop,
		desk.entryProximityPct,
	);

	let side: TradeSetupSide = 'neutral';
	let status: TradeSetupStatus = 'unclear';
	let confidence = 0.4;
	let conditionalNote = 'No Ichimoku cloud retest setup.';
	let unclearReason = conditionalNote;
	let entryPrice: number | undefined;
	let entryLabel: string | undefined;

	if (cloudPosition === 'above' && tkState !== 'bearish' && (nearKijun || nearCloudEdgeLong)) {
		side = 'long';
		status = 'clear';
		unclearReason = '';
		confidence = nearKijun ? 0.56 : 0.52;
		entryPrice = nearKijun ? input.base : input.cloudBottom;
		entryLabel = nearKijun ? 'Kijun retest' : 'Cloud top support';
		conditionalNote = 'Price above cloud — retest of kijun/cloud support.';
	} else if (
		cloudPosition === 'below' &&
		tkState !== 'bullish' &&
		(nearKijun || nearCloudEdgeShort)
	) {
		side = 'short';
		status = 'clear';
		unclearReason = '';
		confidence = nearKijun ? 0.56 : 0.52;
		entryPrice = nearKijun ? input.base : input.cloudTop;
		entryLabel = nearKijun ? 'Kijun retest' : 'Cloud bottom resistance';
		conditionalNote = 'Price below cloud — retest of kijun/cloud resistance.';
	} else if (cloudPosition === 'inside') {
		unclearReason = 'Price inside the cloud — wait for break and retest.';
		conditionalNote = unclearReason;
	} else {
		unclearReason = `Price ${cloudPosition} cloud but not near kijun/cloud edge.`;
		conditionalNote = unclearReason;
		side = cloudPosition === 'above' ? 'long' : cloudPosition === 'below' ? 'short' : 'neutral';
	}

	const levels = atrTargetAndCloudStop({
		side,
		status,
		entryPrice,
		cloudTop: input.cloudTop,
		cloudBottom: input.cloudBottom,
		base: input.base,
		atr,
		targetAtrMultiple,
	});

	return {
		status,
		source: 'ichimoku',
		strategy: 'cloud',
		lastClose: input.lastClose,
		conversion: input.conversion,
		base: input.base,
		cloudTop: input.cloudTop,
		cloudBottom: input.cloudBottom,
		spanA: input.spanA,
		spanB: input.spanB,
		conversionPeriod: input.conversionPeriod,
		basePeriod: input.basePeriod,
		spanPeriod: input.spanPeriod,
		displacement: input.displacement,
		tkState,
		cloudPosition,
		entryProximityPct: desk.entryProximityPct,
		entryOffsetMode: 'retest',
		entryOffsetPct: desk.entryOffsetPct,
		invalidationOffsetPct: desk.invalidationOffsetPct,
		invalidationOffsetMode: desk.invalidationOffsetMode,
		targetAtrMultiple,
		setupPurposeCode: 'ichi-cloud',
		invalidated: false,
		side,
		barsSinceTkCross: input.barsSinceTkCross,
		conditionalNote,
		confidence,
		...(atr != null ? {atrAtLastBar: atr} : {}),
		...(entryPrice != null && entryLabel ? {entryPrice, entryLabel} : {}),
		...levels,
		...(unclearReason ? {unclearReason} : {}),
	};
}

export function buildIchimokuTradeSetup(input: {
	closes: number[];
	points: Array<IchimokuPoint | null>;
	conversionPeriod: number;
	basePeriod: number;
	spanPeriod: number;
	displacement: number;
	/** Prefer tk_cross as primary (default); cloud as alternate. */
	primaryStrategy?: IchimokuStrategy;
	entryProximityPct?: number;
	entryOffsetPct?: number;
	invalidationOffsetPct?: number;
	invalidationOffsetMode?: EntryProximityMode;
	atr?: number | null;
	targetAtrMultiple?: number;
}): IchimokuTradeSetup | null {
	const {closes, points, displacement} = input;
	if (closes.length < 2 || points.length !== closes.length) {
		return null;
	}
	const lastIndex = closes.length - 1;
	const lastClose = closes[lastIndex]!;
	const current = points[lastIndex];
	if (current == null) {
		return null;
	}
	const cloud = currentCloudFromPoints(points, displacement);
	if (cloud == null) {
		return null;
	}
	const barsSinceTkCross = findBarsSinceTkCross(points);
	const shared = {
		lastClose,
		conversion: current.conversion,
		base: current.base,
		cloudTop: cloud.top,
		cloudBottom: cloud.bottom,
		spanA: cloud.spanA,
		spanB: cloud.spanB,
		barsSinceTkCross,
		conversionPeriod: input.conversionPeriod,
		basePeriod: input.basePeriod,
		spanPeriod: input.spanPeriod,
		displacement,
		entryProximityPct: input.entryProximityPct,
		entryOffsetPct: input.entryOffsetPct,
		invalidationOffsetPct: input.invalidationOffsetPct,
		invalidationOffsetMode: input.invalidationOffsetMode,
		atr: input.atr,
		targetAtrMultiple: input.targetAtrMultiple,
	};

	const tk = buildTkCrossIchimokuSetup(shared);
	const cloudSetup = buildCloudIchimokuSetup(shared);
	const primary = input.primaryStrategy ?? 'tk_cross';

	if (primary === 'cloud') {
		if (!cloudSetup) {
			return tk;
		}
		return {...cloudSetup, tkCrossAlternative: tk, cloudAlternative: null};
	}
	if (!tk) {
		return cloudSetup;
	}
	return {...tk, cloudAlternative: cloudSetup, tkCrossAlternative: null};
}

export type IchimokuTradeIdeaContext = {
	conversionPeriod: number;
	basePeriod: number;
	spanPeriod: number;
	displacement: number;
	strategy: IchimokuStrategy;
	setupPurposeCode: string;
	tkState: 'bullish' | 'bearish' | 'flat';
	cloudPosition: 'above' | 'below' | 'inside';
	cloudTop: number;
	cloudBottom: number;
	entryProximityPct: number;
	entryOffsetPct: number;
	invalidationOffsetPct: number;
	invalidationOffsetMode?: EntryProximityMode;
	atrAtLastBar?: number;
	targetAtrMultiple: number;
};

export function ichimokuTradeIdeaContextFromSetup(
	setup: IchimokuTradeSetup,
): IchimokuTradeIdeaContext {
	return {
		conversionPeriod: setup.conversionPeriod,
		basePeriod: setup.basePeriod,
		spanPeriod: setup.spanPeriod,
		displacement: setup.displacement,
		strategy: setup.strategy,
		setupPurposeCode: setup.setupPurposeCode,
		tkState: setup.tkState,
		cloudPosition: setup.cloudPosition,
		cloudTop: setup.cloudTop,
		cloudBottom: setup.cloudBottom,
		entryProximityPct: setup.entryProximityPct,
		entryOffsetPct: setup.entryOffsetPct,
		invalidationOffsetPct: setup.invalidationOffsetPct,
		targetAtrMultiple: setup.targetAtrMultiple,
		...(setup.invalidationOffsetMode != null
			? {invalidationOffsetMode: setup.invalidationOffsetMode}
			: {}),
		...(setup.atrAtLastBar != null ? {atrAtLastBar: setup.atrAtLastBar} : {}),
	};
}

export function normalizeIchimokuTradeSetup(setup: IchimokuTradeSetup) {
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
				? {price: setup.entryPrice, label: setup.entryLabel ?? 'Ichimoku entry'}
				: undefined,
		...(setup.targetPrice != null && isFiniteTradePrice(setup.targetPrice)
			? {target: {price: setup.targetPrice, label: setup.targetLabel ?? 'Ichimoku target'}}
			: {}),
		...(setup.invalidationPrice != null && isFiniteTradePrice(setup.invalidationPrice)
			? {
					invalidation: {
						price: setup.invalidationPrice,
						label: setup.invalidationLabel ?? 'Ichimoku invalidation',
					},
				}
			: {}),
		unclearReason: setup.unclearReason,
	};
}
