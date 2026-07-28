import type {EntryOffsetMode} from './pattern-limit-entry.js';
import type {TradeSetupSide, TradeSetupStatus} from './shared.js';
import {isFiniteTradePrice} from './shared.js';
import {tradeDeskDefaultPcts} from './trade-desk-defaults.js';

export const DEFAULT_Z_SCORE_PERIOD = 20;
export const DEFAULT_Z_SCORE_ENTRY = 2;
export const DEFAULT_Z_SCORE_EXIT = 0.5;
export const DEFAULT_Z_SCORE_STOP_ATR_MULTIPLE = 2;
export type ZScoreAtrFilter = 'none' | 'contracting';
export const DEFAULT_Z_SCORE_ATR_FILTER: ZScoreAtrFilter = 'none';

export type ZScoreTradeSetup = {
	status: TradeSetupStatus;
	source: 'z_score';
	lastClose: number;
	z: number;
	sma: number;
	sd: number;
	period: number;
	entryZ: number;
	exitZ: number;
	stopAtrMultiple: number;
	atrFilter: ZScoreAtrFilter;
	atrAtLastBar?: number;
	atrContracting?: boolean;
	entryOffsetMode: EntryOffsetMode;
	entryOffsetPct: number;
	invalidationOffsetPct: number;
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

export type ZScoreTradeIdeaContext = {
	period: number;
	z: number;
	sma: number;
	sd: number;
	entryZ: number;
	exitZ: number;
	stopAtrMultiple: number;
	atrFilter: ZScoreAtrFilter;
	setupPurposeCode: string;
	invalidated: boolean;
	atrAtLastBar?: number;
	entryOffsetPct: number;
	invalidationOffsetPct: number;
};

function resolveEntryZ(raw: number | undefined): number {
	if (raw != null && Number.isFinite(raw) && raw > 0) {
		return raw;
	}
	return DEFAULT_Z_SCORE_ENTRY;
}

function resolveExitZ(raw: number | undefined): number {
	if (raw != null && Number.isFinite(raw) && raw >= 0) {
		return raw;
	}
	return DEFAULT_Z_SCORE_EXIT;
}

function resolveStopMultiple(raw: number | undefined): number {
	if (raw != null && Number.isFinite(raw) && raw > 0) {
		return raw;
	}
	return DEFAULT_Z_SCORE_STOP_ATR_MULTIPLE;
}

function resolveAtrFilter(raw: ZScoreAtrFilter | undefined): ZScoreAtrFilter {
	return raw === 'contracting' ? 'contracting' : DEFAULT_Z_SCORE_ATR_FILTER;
}

export function buildZScoreTradeSetup(input: {
	lastClose: number;
	z: number;
	sma: number;
	sd: number;
	period: number;
	entryZ?: number;
	exitZ?: number;
	stopAtrMultiple?: number;
	atrFilter?: ZScoreAtrFilter;
	atr?: number | null;
	atrPrev?: number | null;
	entryOffsetPct?: number;
	invalidationOffsetPct?: number;
}): ZScoreTradeSetup | null {
	const {lastClose, z, sma, sd, period} = input;
	if (
		![lastClose, z, sma, sd].every(isFiniteTradePrice) ||
		sd <= 0 ||
		period < 2
	) {
		return null;
	}

	const entryZ = resolveEntryZ(input.entryZ);
	const exitZ = resolveExitZ(input.exitZ);
	const stopAtrMultiple = resolveStopMultiple(input.stopAtrMultiple);
	const atrFilter = resolveAtrFilter(input.atrFilter);
	const desk = tradeDeskDefaultPcts({
		entryOffsetPct: input.entryOffsetPct,
		invalidationOffsetPct: input.invalidationOffsetPct,
	});
	const atr =
		input.atr != null && Number.isFinite(input.atr) && input.atr > 0 ? input.atr : undefined;
	const atrPrev =
		input.atrPrev != null && Number.isFinite(input.atrPrev) && input.atrPrev > 0
			? input.atrPrev
			: undefined;
	const atrContracting =
		atr != null && atrPrev != null ? atr < atrPrev : undefined;

	let side: TradeSetupSide = 'neutral';
	let status: TradeSetupStatus = 'unclear';
	let invalidated = false;
	let confidence = 0.4;
	let conditionalNote = 'Z-score within normal range — wait for |Z| ≥ entry threshold.';
	let unclearReason = `No Z-score extreme — |Z| < ${entryZ}.`;

	if (z <= -entryZ) {
		side = 'long';
		conditionalNote = `Oversold Z-score (${z.toFixed(2)}) — mean-reversion long toward SMA + ${exitZ}σ.`;
		if (atrFilter === 'contracting' && atrContracting !== true) {
			unclearReason = 'Long Z-score extreme but ATR filter requires contracting volatility.';
		} else if (atr == null) {
			unclearReason = 'Long Z-score extreme but ATR unavailable for stop.';
		} else {
			status = 'clear';
			unclearReason = '';
			confidence = 0.55;
		}
	} else if (z >= entryZ) {
		side = 'short';
		conditionalNote = `Overbought Z-score (${z.toFixed(2)}) — mean-reversion short toward SMA − ${exitZ}σ.`;
		if (atrFilter === 'contracting' && atrContracting !== true) {
			unclearReason = 'Short Z-score extreme but ATR filter requires contracting volatility.';
		} else if (atr == null) {
			unclearReason = 'Short Z-score extreme but ATR unavailable for stop.';
		} else {
			status = 'clear';
			unclearReason = '';
			confidence = 0.55;
		}
	}

	const entryPrice =
		status === 'clear' && (side === 'long' || side === 'short') ? lastClose : undefined;
	const entryLabel =
		side === 'long' || side === 'short' ? 'last close at Z extreme' : undefined;

	const targetPrice =
		status === 'clear' && side === 'long'
			? sma + exitZ * sd
			: status === 'clear' && side === 'short'
				? sma - exitZ * sd
				: undefined;
	const targetLabel =
		side === 'long' || side === 'short'
			? `Z return to ${side === 'long' ? '+' : '−'}${exitZ}`
			: undefined;

	let invalidationPrice: number | undefined;
	let invalidationLabel: string | undefined;
	if (status === 'clear' && atr != null && entryPrice != null) {
		const stopDistance = stopAtrMultiple * atr;
		if (side === 'long') {
			invalidationPrice = entryPrice - stopDistance;
			invalidationLabel = `${stopAtrMultiple}× ATR below entry`;
			if (lastClose < invalidationPrice) {
				invalidated = true;
			}
		} else if (side === 'short') {
			invalidationPrice = entryPrice + stopDistance;
			invalidationLabel = `${stopAtrMultiple}× ATR above entry`;
			if (lastClose > invalidationPrice) {
				invalidated = true;
			}
		}
	}

	if (invalidated) {
		status = 'unclear';
		unclearReason =
			side === 'long'
				? 'Invalidated: price already through ATR stop below entry.'
				: 'Invalidated: price already through ATR stop above entry.';
		conditionalNote = unclearReason;
	}

	return {
		status,
		source: 'z_score',
		lastClose,
		z,
		sma,
		sd,
		period,
		entryZ,
		exitZ,
		stopAtrMultiple,
		atrFilter,
		...(atr != null ? {atrAtLastBar: atr} : {}),
		...(atrContracting != null ? {atrContracting} : {}),
		entryOffsetMode: 'bounce',
		entryOffsetPct: desk.entryOffsetPct,
		invalidationOffsetPct: desk.invalidationOffsetPct,
		setupPurposeCode: 'zs-fade',
		invalidated,
		side,
		conditionalNote,
		confidence,
		...(entryPrice != null && entryLabel ? {entryPrice, entryLabel} : {}),
		...(targetPrice != null && targetLabel ? {targetPrice, targetLabel} : {}),
		...(invalidationPrice != null && invalidationLabel
			? {invalidationPrice, invalidationLabel}
			: {}),
		...(unclearReason ? {unclearReason} : {}),
	};
}

export function zScoreTradeIdeaContextFromSetup(setup: ZScoreTradeSetup): ZScoreTradeIdeaContext {
	return {
		period: setup.period,
		z: setup.z,
		sma: setup.sma,
		sd: setup.sd,
		entryZ: setup.entryZ,
		exitZ: setup.exitZ,
		stopAtrMultiple: setup.stopAtrMultiple,
		atrFilter: setup.atrFilter,
		setupPurposeCode: setup.setupPurposeCode,
		invalidated: setup.invalidated,
		entryOffsetPct: setup.entryOffsetPct,
		invalidationOffsetPct: setup.invalidationOffsetPct,
		...(setup.atrAtLastBar != null ? {atrAtLastBar: setup.atrAtLastBar} : {}),
	};
}

export function normalizeZScoreTradeSetup(setup: ZScoreTradeSetup) {
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
				? {price: setup.entryPrice, label: setup.entryLabel ?? 'Z-score entry'}
				: undefined,
		...(setup.targetPrice != null && isFiniteTradePrice(setup.targetPrice)
			? {target: {price: setup.targetPrice, label: setup.targetLabel ?? 'Z-exit target'}}
			: {}),
		...(setup.invalidationPrice != null && isFiniteTradePrice(setup.invalidationPrice)
			? {
					invalidation: {
						price: setup.invalidationPrice,
						label: setup.invalidationLabel ?? 'ATR stop',
					},
				}
			: {}),
		unclearReason: setup.unclearReason,
	};
}
