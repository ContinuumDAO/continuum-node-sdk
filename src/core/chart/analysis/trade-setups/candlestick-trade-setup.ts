import type {TradeSetupSide, TradeSetupStatus} from './shared.js';
import {isFiniteTradePrice} from './shared.js';
import {entryProximityUnclearReason, passesEntryProximityGate} from './trade-entry-gates.js';

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
	entryPrice: number;
	entryLabel: string;
	unclearReason?: string;
};

type CandlestickHit = {
	id: string;
	name: string;
	confidence: number;
	barIndex: number;
	direction: 'bullish' | 'bearish' | 'neutral';
};

function sideFromRecommendation(
	recommendation: 'buy' | 'sell' | 'hold',
	direction?: 'bullish' | 'bearish' | 'neutral',
): TradeSetupSide {
	if (recommendation === 'buy') {
		return 'long';
	}
	if (recommendation === 'sell') {
		return 'short';
	}
	if (direction === 'bullish') {
		return 'long';
	}
	if (direction === 'bearish') {
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
	minConfidence?: number;
	entryProximityPct?: number;
}): CandlestickTradeSetup | null {
	const minConfidence = input.minConfidence ?? 0.45;
	const primaryHit =
		input.patterns.find(p => p.id === input.primaryPattern?.id) ??
		input.patterns.sort((a, b) => b.confidence - a.confidence)[0];
	if (!primaryHit && input.recommendation === 'hold') {
		return null;
	}
	const patternId = primaryHit?.id ?? input.primaryPattern?.id ?? 'none';
	const patternName = primaryHit?.name ?? input.primaryPattern?.name ?? 'candlestick signal';
	const confidence = primaryHit?.confidence ?? input.recommendationConfidence;
	const side = sideFromRecommendation(input.recommendation, primaryHit?.direction);
	const entryPrice = input.focusBarClose;
	let status: TradeSetupStatus = 'clear';
	let unclearReason: string | undefined;
	if (input.recommendation === 'hold' || side === 'neutral') {
		status = 'unclear';
		unclearReason = 'Candlestick recommendation is hold or neutral — no directional trade setup.';
	} else if (confidence < minConfidence) {
		status = 'unclear';
		unclearReason = `Candlestick confidence ${confidence.toFixed(2)} is below threshold ${minConfidence.toFixed(2)}.`;
	} else if (!isFiniteTradePrice(entryPrice)) {
		status = 'unclear';
		unclearReason = 'No valid entry price from focus bar close.';
	} else if (
		!passesEntryProximityGate({
			lastClose: input.lastClose,
			entryPrice,
			entryProximityPct: input.entryProximityPct,
		})
	) {
		status = 'unclear';
		unclearReason = entryProximityUnclearReason(input.entryProximityPct);
	}
	return {
		status,
		source: 'primary_candlestick',
		patternId,
		patternName,
		signal: input.recommendation,
		confidence,
		barIndex: input.focusBarIndex,
		barClose: entryPrice,
		lastClose: input.lastClose,
		side,
		entryPrice,
		entryLabel: 'focus bar close',
		...(unclearReason ? {unclearReason} : {}),
	};
}

export function normalizeCandlestickTradeSetup(setup: CandlestickTradeSetup) {
	return {
		status: setup.status,
		side: setup.side,
		confidence: setup.confidence,
		lastClose: setup.lastClose,
		entry: isFiniteTradePrice(setup.entryPrice)
			? {price: setup.entryPrice, label: setup.entryLabel}
			: undefined,
		unclearReason: setup.unclearReason,
	};
}
