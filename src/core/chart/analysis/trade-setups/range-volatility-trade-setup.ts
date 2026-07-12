import type {TradeSetupSide, TradeSetupStatus} from './shared.js';
import {isFiniteTradePrice} from './shared.js';

export type RangeVolatilityTradeSetup = {
	status: TradeSetupStatus;
	source: 'range_volatility';
	lastClose: number;
	rangeHigh: number;
	rangeLow: number;
	rangePct: number;
	atr: number | null;
	atrPct: number | null;
	compression: 'compressing' | 'expanding' | 'stable';
	rangePosition: number;
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

function rangePosition(close: number, low: number, high: number): number {
	const span = high - low;
	if (!Number.isFinite(span) || span <= 0) {
		return 0.5;
	}
	return Math.max(0, Math.min(1, (close - low) / span));
}

export function buildRangeVolatilityTradeSetup(input: {
	lastClose: number;
	rangeHigh: number;
	rangeLow: number;
	rangePct: number;
	atr: number | null;
	atrPct: number | null;
	compression: 'compressing' | 'expanding' | 'stable';
}): RangeVolatilityTradeSetup | null {
	const close = input.lastClose;
	const low = input.rangeLow;
	const high = input.rangeHigh;
	if (!isFiniteTradePrice(close) || !isFiniteTradePrice(low) || !isFiniteTradePrice(high) || high <= low) {
		return null;
	}
	const pos = rangePosition(close, low, high);
	let side: TradeSetupSide = 'neutral';
	let status: TradeSetupStatus = 'unclear';
	let confidence = 0.35;
	let conditionalNote =
		'Range/volatility is neutral — wait for a clearer compression breakout or range-bound fade.';
	let unclearReason =
		'Volatility regime does not support a directional entry without additional structure confirmation.';

	if (input.compression === 'compressing') {
		conditionalNote =
			'Volatility is compressing — coiled range; wait for expansion breakout before entry.';
		unclearReason = 'Compression phase — no breakout entry until range expands with direction.';
	} else if (input.compression === 'expanding') {
		if (pos >= 0.72) {
			side = 'long';
			conditionalNote =
				'Expanding volatility with price in upper range — conditional long at last close (breakout continuation).';
			confidence = 0.48;
			if (pos >= 0.82) {
				status = 'clear';
				unclearReason = '';
			}
		} else if (pos <= 0.28) {
			side = 'short';
			conditionalNote =
				'Expanding volatility with price in lower range — conditional short at last close (breakdown continuation).';
			confidence = 0.48;
			if (pos <= 0.18) {
				status = 'clear';
				unclearReason = '';
			}
		} else {
			conditionalNote =
				'Volatility expanding but price is mid-range — direction unclear until range edge break.';
		}
	} else if (pos >= 0.88) {
		side = 'short';
		conditionalNote =
			'Stable range with price at upper bound — fade short toward range mid (range-trade conditional).';
		confidence = 0.42;
	} else if (pos <= 0.12) {
		side = 'long';
		conditionalNote =
			'Stable range with price at lower bound — fade long toward range mid (range-trade conditional).';
		confidence = 0.42;
	}

	const entryPrice = status === 'clear' && side !== 'neutral' ? close : undefined;
	const targetPrice =
		status === 'clear' && side === 'long' ? low + (high - low) * 0.55 : status === 'clear' && side === 'short' ? low + (high - low) * 0.45 : undefined;
	const invalidationPrice =
		status === 'clear' && side === 'long' ? low : status === 'clear' && side === 'short' ? high : undefined;

	return {
		status,
		source: 'range_volatility',
		lastClose: close,
		rangeHigh: high,
		rangeLow: low,
		rangePct: input.rangePct,
		atr: input.atr,
		atrPct: input.atrPct,
		compression: input.compression,
		rangePosition: pos,
		side,
		...(entryPrice != null ? {entryPrice, entryLabel: 'last close (conditional)'} : {}),
		...(targetPrice != null ? {targetPrice, targetLabel: 'range mid'} : {}),
		...(invalidationPrice != null
			? {
					invalidationPrice,
					invalidationLabel: side === 'long' ? 'range low' : 'range high',
				}
			: {}),
		conditionalNote,
		confidence,
		...(unclearReason ? {unclearReason} : {}),
	};
}

export function normalizeRangeVolatilityTradeSetup(setup: RangeVolatilityTradeSetup) {
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
				? {price: setup.entryPrice, label: setup.entryLabel ?? 'last close (conditional)'}
				: undefined,
		...(setup.targetPrice != null && isFiniteTradePrice(setup.targetPrice)
			? {target: {price: setup.targetPrice, label: setup.targetLabel ?? 'range mid'}}
			: {}),
		...(setup.invalidationPrice != null && isFiniteTradePrice(setup.invalidationPrice)
			? {
					invalidation: {
						price: setup.invalidationPrice,
						label: setup.invalidationLabel ?? 'range bound',
					},
				}
			: {}),
		unclearReason: setup.unclearReason,
	};
}
