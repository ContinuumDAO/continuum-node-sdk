import type {TradeSetupSide, TradeSetupStatus} from './shared.js';
import {isFiniteTradePrice} from './shared.js';

export type CandlestickTradeSetup = {
	status: TradeSetupStatus;
	source: 'primary_candlestick';
	patternId: string;
	patternName: string;
	signal: 'buy' | 'sell' | 'hold';
	confidence: number;
	barIndex: number;
	barClose: number;
	lastClose: number;
	side: TradeSetupSide;
	entryPrice?: number;
	entryLabel?: string;
	unclearReason?: string;
};

type CandlestickHit = {
	id: string;
	name: string;
	confidence: number;
	barIndex: number;
	direction: 'bullish' | 'bearish' | 'neutral';
};

type CandlestickBias = 'bullish' | 'bearish' | 'neutral';

function resolveCandlestickBias(
	recommendation: 'buy' | 'sell' | 'hold',
): CandlestickBias {
	if (recommendation === 'buy') {
		return 'bullish';
	}
	if (recommendation === 'sell') {
		return 'bearish';
	}
	return 'neutral';
}

function sideFromBias(bias: CandlestickBias): TradeSetupSide {
	if (bias === 'bullish') {
		return 'long';
	}
	if (bias === 'bearish') {
		return 'short';
	}
	return 'neutral';
}

export function buildCandlestickTradeSetup(input: {
	primaryPattern: {id: string; name: string} | null;
	patterns: CandlestickHit[];
	recommendation: 'buy' | 'sell' | 'hold';
	recommendationConfidence: number;
	focusBarIndex: number;
	focusBarClose: number;
	lastClose: number;
}): CandlestickTradeSetup {
	const primaryHit =
		input.patterns.find(p => p.id === input.primaryPattern?.id) ??
		input.patterns.sort((a, b) => b.confidence - a.confidence)[0];
	const patternId = primaryHit?.id ?? input.primaryPattern?.id ?? 'none';
	const patternName = primaryHit?.name ?? input.primaryPattern?.name ?? 'candlestick signal';
	const confidence = primaryHit?.confidence ?? input.recommendationConfidence;
	const bias = resolveCandlestickBias(input.recommendation);
	const side = sideFromBias(bias);
	let status: TradeSetupStatus = 'unclear';
	let unclearReason = 'Candlestick signal is neutral — no directional trade setup.';
	let entryPrice: number | undefined;
	let entryLabel: string | undefined;
	if (bias === 'bullish' && isFiniteTradePrice(input.lastClose)) {
		status = 'clear';
		unclearReason = '';
		entryPrice = input.lastClose;
		entryLabel = 'current price';
	} else if (bias === 'bearish' && isFiniteTradePrice(input.lastClose)) {
		status = 'clear';
		unclearReason = '';
		entryPrice = input.lastClose;
		entryLabel = 'current price';
	} else if (!isFiniteTradePrice(input.lastClose)) {
		unclearReason = 'No valid current price for candlestick entry.';
	}
	return {
		status,
		source: 'primary_candlestick',
		patternId,
		patternName,
		signal: input.recommendation,
		confidence,
		barIndex: input.focusBarIndex,
		barClose: input.focusBarClose,
		lastClose: input.lastClose,
		side,
		...(entryPrice != null && entryLabel != null ? {entryPrice, entryLabel} : {}),
		...(unclearReason ? {unclearReason} : {}),
	};
}

export function normalizeCandlestickTradeSetup(setup: CandlestickTradeSetup) {
	return {
		status: setup.status,
		side: setup.side,
		confidence: setup.confidence,
		lastClose: setup.lastClose,
		entry:
			setup.status === 'clear' && isFiniteTradePrice(setup.entryPrice)
				? {price: setup.entryPrice, label: setup.entryLabel}
				: undefined,
		unclearReason: setup.unclearReason,
	};
}
