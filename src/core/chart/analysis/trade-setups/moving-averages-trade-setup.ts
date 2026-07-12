import type {EntryOffsetMode, EntryProximityMode} from './pattern-limit-entry.js';
import type {TradeSetupSide, TradeSetupStatus} from './shared.js';
import {isFiniteTradePrice} from './shared.js';
import {entryProximityAtrFromOhlcvRows} from './entry-proximity-atr.js';
import {assessTradeSetupEntryActionability} from './trade-entry-gates.js';
import {tradeDeskConfig} from './trade-desk-defaults.js';

export const DEFAULT_MA_FAST_PERIOD = 50;
export const DEFAULT_MA_SLOW_PERIOD = 200;
export const DEFAULT_MA_TYPE = 'sma' as const;
export const DEFAULT_FRESH_CROSSOVER_MAX_BARS = 5;
const MIN_CLEAR_CONFIDENCE = 0.45;

export type MaType = 'sma' | 'ema';
export type MaCrossoverState = 'bullish' | 'bearish' | 'none';
export type MaStrategy = 'crossover' | 'proximity_retest';
export type MaCrossoverLabel = 'golden_cross' | 'death_cross' | 'none';
export type MaProximityType = 'slow_ma_retest_bullish' | 'slow_ma_retest_bearish' | 'none';

export type MovingAveragesTradeSetup = {
	status: TradeSetupStatus;
	source: 'moving_averages';
	lastClose: number;
	fastMa: number;
	slowMa: number;
	fastPeriod: number;
	slowPeriod: number;
	maType: MaType;
	crossoverState: MaCrossoverState;
	barsSinceCrossover: number | null;
	strategy: MaStrategy;
	crossoverLabel: MaCrossoverLabel;
	proximityType: MaProximityType;
	setupPurposeCode: string;
	entryOffsetMode: EntryOffsetMode;
	entryProximityPct: number;
	entryProximityMode: EntryProximityMode;
	entryOffsetPct: number;
	invalidationOffsetPct: number;
	atrAtLastBar?: number;
	side: TradeSetupSide;
	confidence: number;
	tradeSummary: string;
	conditionalNote: string;
	entryPrice?: number;
	entryLabel?: string;
	targetPrice?: number;
	targetLabel?: string;
	invalidationPrice?: number;
	invalidationLabel?: string;
	unclearReason?: string;
};

export function maPairLabel(maType: MaType, fastPeriod: number, slowPeriod: number): string {
	const prefix = maType === 'ema' ? 'EMA' : 'SMA';
	return `${prefix}(${fastPeriod})/${prefix}(${slowPeriod})`;
}

function sideFromRegime(fastMa: number, slowMa: number): TradeSetupSide {
	if (fastMa > slowMa) {
		return 'long';
	}
	if (fastMa < slowMa) {
		return 'short';
	}
	return 'neutral';
}

function crossoverLabelFromState(state: MaCrossoverState): MaCrossoverLabel {
	if (state === 'bullish') {
		return 'golden_cross';
	}
	if (state === 'bearish') {
		return 'death_cross';
	}
	return 'none';
}

function proximityTypeFromSide(side: TradeSetupSide): MaProximityType {
	if (side === 'long') {
		return 'slow_ma_retest_bullish';
	}
	if (side === 'short') {
		return 'slow_ma_retest_bearish';
	}
	return 'none';
}

function crossoverConfidence(barsSinceCrossover: number | null, fastMa: number, slowMa: number): number {
	let confidence = 0.45;
	if (barsSinceCrossover != null && barsSinceCrossover <= 2) {
		confidence += 0.1;
	} else if (barsSinceCrossover != null && barsSinceCrossover <= 5) {
		confidence += 0.05;
	}
	const spread = Math.abs(fastMa - slowMa);
	const mid = (fastMa + slowMa) / 2;
	if (mid > 0 && spread / mid > 0.002) {
		confidence = Math.min(0.75, confidence + 0.05);
	}
	return confidence;
}

function retestConfidence(fastMa: number, slowMa: number): number {
	const spread = Math.abs(fastMa - slowMa);
	const mid = (fastMa + slowMa) / 2;
	let confidence = 0.45;
	if (mid > 0 && spread / mid > 0.003) {
		confidence = Math.min(0.65, confidence + 0.07);
	}
	return confidence;
}

function formatCrossoverAge(barsSinceCrossover: number | null): string {
	if (barsSinceCrossover == null) {
		return '';
	}
	if (barsSinceCrossover === 0) {
		return '';
	}
	return ` ${barsSinceCrossover} bar${barsSinceCrossover === 1 ? '' : 's'} ago`;
}

export function buildMovingAveragesTradeSummary(input: {
	maType: MaType;
	fastPeriod: number;
	slowPeriod: number;
	strategy: MaStrategy;
	crossoverLabel: MaCrossoverLabel;
	proximityType: MaProximityType;
	side: TradeSetupSide;
	status: TradeSetupStatus;
	barsSinceCrossover: number | null;
	unclearReason?: string;
}): string {
	const pair = maPairLabel(input.maType, input.fastPeriod, input.slowPeriod);
	if (input.strategy === 'crossover') {
		const crossName = input.crossoverLabel === 'golden_cross' ? 'Golden cross' : 'Death cross';
		const age = formatCrossoverAge(input.barsSinceCrossover);
		if (input.status === 'clear' && input.side !== 'neutral') {
			const sideWord = input.side === 'long' ? 'long' : 'short';
			return `${crossName}${age} · ${pair} · ${sideWord} entry at last close`;
		}
		return `${crossName}${age} · ${pair} · no actionable entry`;
	}
	const regime =
		input.proximityType === 'slow_ma_retest_bullish'
			? 'bullish regime'
			: input.proximityType === 'slow_ma_retest_bearish'
				? 'bearish regime'
				: 'neutral regime';
	const slowLabel = `${input.maType === 'ema' ? 'EMA' : 'SMA'}(${input.slowPeriod})`;
	if (input.status === 'clear' && input.side !== 'neutral') {
		const sideWord = input.side === 'long' ? 'long' : 'short';
		return `Proximity + retest · ${regime} · ${sideWord} limit at ${slowLabel}`;
	}
	if (input.unclearReason?.includes('proximity')) {
		return `Proximity + retest · ${regime} · price not within proximity of ${slowLabel}`;
	}
	return `Proximity + retest · ${regime} · no actionable entry`;
}

export type MaCrossoverDetectResult = {
	crossoverState: MaCrossoverState;
	barsSinceCrossover: number | null;
};

export function detectMaCrossover(
	fastSeries: number[],
	slowSeries: number[],
): MaCrossoverDetectResult {
	const len = Math.min(fastSeries.length, slowSeries.length);
	if (len < 2) {
		return {crossoverState: 'none', barsSinceCrossover: null};
	}
	for (let offset = 0; offset < len - 1; offset++) {
		const i = len - 1 - offset;
		const prev = i - 1;
		const fast = fastSeries[i]!;
		const slow = slowSeries[i]!;
		const fastPrev = fastSeries[prev]!;
		const slowPrev = slowSeries[prev]!;
		if (
			!isFiniteTradePrice(fast) ||
			!isFiniteTradePrice(slow) ||
			!isFiniteTradePrice(fastPrev) ||
			!isFiniteTradePrice(slowPrev)
		) {
			continue;
		}
		if (fast > slow && fastPrev <= slowPrev) {
			return {crossoverState: 'bullish', barsSinceCrossover: offset};
		}
		if (fast < slow && fastPrev >= slowPrev) {
			return {crossoverState: 'bearish', barsSinceCrossover: offset};
		}
	}
	return {crossoverState: 'none', barsSinceCrossover: null};
}

export function buildMovingAveragesTradeSetup(input: {
	lastClose: number;
	fastMa: number;
	slowMa: number;
	fastPeriod: number;
	slowPeriod: number;
	maType: MaType;
	crossoverState: MaCrossoverState;
	barsSinceCrossover: number | null;
	freshCrossoverMaxBars?: number;
	bars?: Record<string, unknown>[];
	entryProximityPct?: number;
	entryProximityMode?: EntryProximityMode;
}): MovingAveragesTradeSetup | null {
	const close = input.lastClose;
	const fastMa = input.fastMa;
	const slowMa = input.slowMa;
	if (!isFiniteTradePrice(close) || !isFiniteTradePrice(fastMa) || !isFiniteTradePrice(slowMa)) {
		return null;
	}

	const desk = tradeDeskConfig({
		entryProximityPct: input.entryProximityPct,
		entryProximityMode: input.entryProximityMode,
	});
	const freshMax = input.freshCrossoverMaxBars ?? DEFAULT_FRESH_CROSSOVER_MAX_BARS;
	const regimeSide = sideFromRegime(fastMa, slowMa);
	const crossoverLabel = crossoverLabelFromState(input.crossoverState);
	const proximityType = proximityTypeFromSide(regimeSide);
	const atrAtLastBar =
		desk.entryProximityMode === 'atr' && input.bars?.length
			? entryProximityAtrFromOhlcvRows(input.bars, desk.entryProximityAtrPeriod)
			: null;

	const freshCrossover =
		input.crossoverState !== 'none' &&
		input.barsSinceCrossover != null &&
		input.barsSinceCrossover <= freshMax;

	let strategy: MaStrategy = 'proximity_retest';
	let side: TradeSetupSide = regimeSide;
	let status: TradeSetupStatus = 'unclear';
	let confidence = 0.35;
	let entryPrice: number | undefined;
	let entryLabel: string | undefined;
	let entryOffsetMode: EntryOffsetMode = 'retest';
	let setupPurposeCode = 'ma-ret';
	let unclearReason =
		regimeSide === 'neutral'
			? 'Fast and slow moving averages are aligned — no directional regime.'
			: 'No actionable moving-average setup on the current bar.';

	if (freshCrossover && input.crossoverState === 'bullish') {
		strategy = 'crossover';
		side = 'long';
		confidence = crossoverConfidence(input.barsSinceCrossover, fastMa, slowMa);
		entryOffsetMode = 'bounce';
		setupPurposeCode = 'ma-cross';
		if (confidence >= MIN_CLEAR_CONFIDENCE) {
			status = 'clear';
			entryPrice = close;
			entryLabel = 'last close (crossover)';
			unclearReason = '';
		}
	} else if (freshCrossover && input.crossoverState === 'bearish') {
		strategy = 'crossover';
		side = 'short';
		confidence = crossoverConfidence(input.barsSinceCrossover, fastMa, slowMa);
		entryOffsetMode = 'bounce';
		setupPurposeCode = 'ma-cross';
		if (confidence >= MIN_CLEAR_CONFIDENCE) {
			status = 'clear';
			entryPrice = close;
			entryLabel = 'last close (crossover)';
			unclearReason = '';
		}
	} else if (
		input.crossoverState !== 'none' &&
		input.barsSinceCrossover != null &&
		input.barsSinceCrossover > freshMax
	) {
		strategy = 'crossover';
		side = input.crossoverState === 'bullish' ? 'long' : 'short';
		confidence = crossoverConfidence(input.barsSinceCrossover, fastMa, slowMa);
		entryOffsetMode = 'bounce';
		setupPurposeCode = 'ma-cross';
		unclearReason = `Crossover occurred ${input.barsSinceCrossover} bars ago — outside fresh window (${freshMax} bars).`;
	} else if (regimeSide !== 'neutral') {
		strategy = 'proximity_retest';
		side = regimeSide;
		confidence = retestConfidence(fastMa, slowMa);
		entryOffsetMode = 'retest';
		setupPurposeCode = 'ma-ret';
		const entryCheck = assessTradeSetupEntryActionability({
			lastClose: close,
			entryPrice: slowMa,
			side,
			entryOffsetMode: 'retest',
			entryProximityPct: desk.entryProximityPct,
			entryProximityMode: desk.entryProximityMode,
			entryProximityAtr: atrAtLastBar,
			entryOffsetPct: desk.entryOffsetPct,
		});
		if (entryCheck.ok && confidence >= MIN_CLEAR_CONFIDENCE) {
			status = 'clear';
			entryPrice = slowMa;
			entryLabel = `${input.maType === 'ema' ? 'EMA' : 'SMA'}(${input.slowPeriod}) retest`;
			unclearReason = '';
			confidence = Math.min(0.7, confidence + 0.05);
		} else if (!entryCheck.ok) {
			unclearReason = entryCheck.unclearReason;
		}
	}

	const targetPrice =
		status === 'clear' && side === 'long'
			? fastMa
			: status === 'clear' && side === 'short'
				? fastMa
				: undefined;
	const targetLabel =
		status === 'clear' ? `${input.maType === 'ema' ? 'EMA' : 'SMA'}(${input.fastPeriod})` : undefined;
	const invalidationPrice =
		status === 'clear' && side === 'long'
			? slowMa
			: status === 'clear' && side === 'short'
				? slowMa
				: undefined;
	const invalidationLabel =
		status === 'clear'
			? `below ${input.maType === 'ema' ? 'EMA' : 'SMA'}(${input.slowPeriod})`
			: undefined;

	const tradeSummary = buildMovingAveragesTradeSummary({
		maType: input.maType,
		fastPeriod: input.fastPeriod,
		slowPeriod: input.slowPeriod,
		strategy,
		crossoverLabel: strategy === 'crossover' ? crossoverLabel : 'none',
		proximityType: strategy === 'proximity_retest' ? proximityType : 'none',
		side,
		status,
		barsSinceCrossover: input.barsSinceCrossover,
		unclearReason,
	});

	const conditionalNote =
		status === 'clear'
			? tradeSummary
			: strategy === 'crossover' && crossoverLabel !== 'none'
				? `${crossoverLabel === 'golden_cross' ? 'Golden cross' : 'Death cross'} detected but not actionable — ${unclearReason || 'wait for a fresh crossover or proximity retest.'}`
				: unclearReason ||
					'Moving-average setup is unclear — wait for crossover or slow MA retest within proximity.';

	return {
		status,
		source: 'moving_averages',
		lastClose: close,
		fastMa,
		slowMa,
		fastPeriod: input.fastPeriod,
		slowPeriod: input.slowPeriod,
		maType: input.maType,
		crossoverState: input.crossoverState,
		barsSinceCrossover: input.barsSinceCrossover,
		strategy,
		crossoverLabel: strategy === 'crossover' ? crossoverLabel : 'none',
		proximityType: strategy === 'proximity_retest' ? proximityType : 'none',
		setupPurposeCode,
		entryOffsetMode,
		entryProximityPct: desk.entryProximityPct,
		entryProximityMode: desk.entryProximityMode,
		entryOffsetPct: desk.entryOffsetPct,
		invalidationOffsetPct: desk.invalidationOffsetPct,
		...(atrAtLastBar != null ? {atrAtLastBar} : {}),
		side,
		confidence,
		tradeSummary,
		conditionalNote,
		...(status === 'clear' && entryPrice != null && entryLabel
			? {entryPrice, entryLabel}
			: {}),
		...(targetPrice != null && targetLabel ? {targetPrice, targetLabel} : {}),
		...(invalidationPrice != null && invalidationLabel
			? {invalidationPrice, invalidationLabel}
			: {}),
		...(unclearReason && status === 'unclear' ? {unclearReason} : {}),
	};
}

export type MovingAveragesTradeIdeaContext = {
	tradeSummary: string;
	strategy: MaStrategy;
	crossoverLabel: MaCrossoverLabel;
	proximityType: MaProximityType;
	fastPeriod: number;
	slowPeriod: number;
	maType: MaType;
	barsSinceCrossover: number | null;
	setupPurposeCode: string;
};

export function movingAveragesTradeIdeaContextFromSetup(
	setup: MovingAveragesTradeSetup,
): MovingAveragesTradeIdeaContext {
	return {
		tradeSummary: setup.tradeSummary,
		strategy: setup.strategy,
		crossoverLabel: setup.crossoverLabel,
		proximityType: setup.proximityType,
		fastPeriod: setup.fastPeriod,
		slowPeriod: setup.slowPeriod,
		maType: setup.maType,
		barsSinceCrossover: setup.barsSinceCrossover,
		setupPurposeCode: setup.setupPurposeCode,
	};
}

export function normalizeMovingAveragesTradeSetup(setup: MovingAveragesTradeSetup) {
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
				? {price: setup.entryPrice, label: setup.entryLabel ?? 'MA entry'}
				: undefined,
		...(setup.targetPrice != null && isFiniteTradePrice(setup.targetPrice)
			? {target: {price: setup.targetPrice, label: setup.targetLabel ?? 'fast MA'}}
			: {}),
		...(setup.invalidationPrice != null && isFiniteTradePrice(setup.invalidationPrice)
			? {
					invalidation: {
						price: setup.invalidationPrice,
						label: setup.invalidationLabel ?? 'slow MA breach',
					},
				}
			: {}),
		unclearReason: setup.unclearReason,
	};
}
