import type {DivergenceKind, DivergenceOscillator, DivergencePrimary} from '../divergence/types.js';
import {kindLabel} from '../divergence/detect.js';
import type {EntryProximityMode} from './pattern-limit-entry.js';
import type {TradeSetupSide, TradeSetupStatus} from './shared.js';
import {isFiniteTradePrice} from './shared.js';
import {entryProximityAtrFromOhlcvRows} from './entry-proximity-atr.js';
import {tradeDeskConfig} from './trade-desk-defaults.js';

export type DivergenceTradeSetup = {
	status: TradeSetupStatus;
	source: 'divergence';
	setupPurposeCode: 'div';
	primaryKind: DivergenceKind | null;
	oscillator: DivergenceOscillator | null;
	lastClose: number;
	side: TradeSetupSide;
	entryPrice?: number;
	entryLabel?: string;
	targetPrice?: number;
	targetLabel?: string;
	invalidationPrice?: number;
	invalidationLabel?: string;
	entryOffsetPct: number;
	invalidationOffsetPct: number;
	invalidationOffsetMode?: EntryProximityMode;
	atrAtLastBar?: number;
	conditionalNote: string;
	confidence: number;
	unclearReason?: string;
};

/** Minimum |p1−p2| / lastClose × 100 for a clear trade (filters micro-wiggle pivots). */
export const DIVERGENCE_MIN_SWING_PCT = 0.5;

export function pivotStructureLevels(input: {
	side: 'long' | 'short';
	p1Price: number;
	p2Price: number;
	lastClose: number;
}): {
	entryPrice: number;
	entryLabel: string;
	targetPrice: number;
	targetLabel: string;
	invalidationPrice: number;
	invalidationLabel: string;
	swingPct: number;
} | null {
	const {side, p1Price, p2Price, lastClose} = input;
	if (![p1Price, p2Price, lastClose].every(isFiniteTradePrice)) {
		return null;
	}
	const range = Math.abs(p1Price - p2Price);
	if (!(range > 0) || !(lastClose > 0)) {
		return null;
	}
	const swingPct = (range / lastClose) * 100;
	if (side === 'long') {
		const invalidationPrice = Math.min(p1Price, p2Price);
		// Project swing size from entry so the target stays ahead of last close when
		// price has already moved past the classic p2±range measured move.
		const targetPrice = lastClose + range;
		return {
			entryPrice: lastClose,
			entryLabel: 'last close (divergence)',
			targetPrice,
			targetLabel: 'measured move (swing size from entry)',
			invalidationPrice,
			invalidationLabel: 'below divergence swing low',
			swingPct,
		};
	}
	const invalidationPrice = Math.max(p1Price, p2Price);
	const targetPrice = lastClose - range;
	return {
		entryPrice: lastClose,
		entryLabel: 'last close (divergence)',
		targetPrice,
		targetLabel: 'measured move (swing size from entry)',
		invalidationPrice,
		invalidationLabel: 'above divergence swing high',
		swingPct,
	};
}

/** Target/invalidation must sit on the correct side of entry for the trade direction. */
export function divergenceLevelsActionable(input: {
	side: 'long' | 'short';
	entryPrice: number;
	targetPrice: number;
	invalidationPrice: number;
	swingPct: number;
	minSwingPct?: number;
}): {ok: true} | {ok: false; reason: string} {
	const minSwing = input.minSwingPct ?? DIVERGENCE_MIN_SWING_PCT;
	if (!(input.swingPct >= minSwing)) {
		return {
			ok: false,
			reason: `Divergence swing too small (${input.swingPct.toFixed(2)}% < ${minSwing}% of price) for a clear entry.`,
		};
	}
	if (input.side === 'long') {
		if (!(input.targetPrice > input.entryPrice)) {
			return {
				ok: false,
				reason: 'Target is not above last close for a long divergence setup.',
			};
		}
		if (!(input.invalidationPrice < input.entryPrice)) {
			return {
				ok: false,
				reason:
					'Price is at or below the divergence swing low — bullish bias remains, but invalidation is already spent.',
			};
		}
		return {ok: true};
	}
	if (!(input.targetPrice < input.entryPrice)) {
		return {
			ok: false,
			reason: 'Target is not below last close for a short divergence setup.',
		};
	}
	if (!(input.invalidationPrice > input.entryPrice)) {
		return {
			ok: false,
			reason:
				'Price is at or above the divergence swing high — bearish bias remains, but invalidation is already spent.',
		};
	}
	return {ok: true};
}

export function buildDivergenceTradeSetup(input: {
	lastClose: number;
	primary: DivergencePrimary | null;
	bars?: Record<string, unknown>[];
	entryOffsetPct?: number;
	invalidationOffsetPct?: number;
	invalidationOffsetMode?: EntryProximityMode;
	entryProximityAtrPeriod?: number;
}): DivergenceTradeSetup | null {
	const close = input.lastClose;
	if (!isFiniteTradePrice(close)) {
		return null;
	}
	const desk = tradeDeskConfig({
		entryOffsetPct: input.entryOffsetPct,
		invalidationOffsetPct: input.invalidationOffsetPct,
		invalidationOffsetMode: input.invalidationOffsetMode,
		entryProximityAtrPeriod: input.entryProximityAtrPeriod,
	});
	const atrAtLastBar = input.bars?.length
		? entryProximityAtrFromOhlcvRows(input.bars, desk.entryProximityAtrPeriod)
		: null;
	const deskFields = {
		entryOffsetPct: desk.entryOffsetPct,
		invalidationOffsetPct: desk.invalidationOffsetPct,
		invalidationOffsetMode: desk.invalidationOffsetMode,
		...(atrAtLastBar != null ? {atrAtLastBar} : {}),
	};

	if (!input.primary) {
		return {
			status: 'unclear',
			source: 'divergence',
			setupPurposeCode: 'div',
			primaryKind: null,
			oscillator: null,
			lastClose: close,
			side: 'neutral',
			...deskFields,
			conditionalNote: 'No RSI/Stochastic RSI divergence detected — no trade bias.',
			confidence: 0.35,
			unclearReason: 'No primary divergence pattern on the session OHLCV.',
		};
	}

	const primary = input.primary;
	const levels = pivotStructureLevels({
		side: primary.side,
		p1Price: primary.p1.value,
		p2Price: primary.p2.value,
		lastClose: close,
	});
	const confidence = primary.confidence;
	const oscLabel = primary.oscillator === 'rsi' ? 'RSI' : 'Stochastic RSI';
	const note = `${kindLabel(primary.kind)} ${oscLabel} divergence — supports ${primary.side} (confidence ${confidence.toFixed(2)}).`;

	let status: TradeSetupStatus = 'unclear';
	let unclearReason =
		levels == null
			? 'Could not form pivot-structure entry/target/invalidation from primary pivots.'
			: confidence < 0.45
				? 'Primary divergence confidence below clear threshold.'
				: '';
	if (levels != null && confidence >= 0.45) {
		const actionable = divergenceLevelsActionable({
			side: primary.side,
			entryPrice: levels.entryPrice,
			targetPrice: levels.targetPrice,
			invalidationPrice: levels.invalidationPrice,
			swingPct: levels.swingPct,
		});
		if (actionable.ok) {
			status = 'clear';
			unclearReason = '';
		} else {
			unclearReason = actionable.reason;
		}
	}

	return {
		status,
		source: 'divergence',
		setupPurposeCode: 'div',
		primaryKind: primary.kind,
		oscillator: primary.oscillator,
		lastClose: close,
		side: primary.side,
		...(levels && status === 'clear'
			? {
					entryPrice: levels.entryPrice,
					entryLabel: levels.entryLabel,
					targetPrice: levels.targetPrice,
					targetLabel: levels.targetLabel,
					invalidationPrice: levels.invalidationPrice,
					invalidationLabel: levels.invalidationLabel,
				}
			: {}),
		...deskFields,
		conditionalNote: note,
		confidence,
		...(unclearReason ? {unclearReason} : {}),
	};
}

export function normalizeDivergenceTradeSetup(setup: DivergenceTradeSetup) {
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
				? {price: setup.entryPrice, label: setup.entryLabel ?? 'last close (divergence)'}
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
