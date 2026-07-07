import type {TradeSetupSide, TradeSetupStatus} from './shared.js';
import {isFiniteTradePrice} from './shared.js';

export type MomentumTradeSetup = {
	status: TradeSetupStatus;
	source: 'rsi_macd';
	rsiPeriod: number;
	rsiValue: number | null;
	rsiZone: 'overbought' | 'oversold' | 'neutral';
	macdCrossover: 'bullish' | 'bearish' | 'none';
	lastClose: number;
	side: TradeSetupSide;
	entryPrice: number;
	entryLabel: string;
	conditionalNote: string;
	confidence: number;
	unclearReason?: string;
};

export function buildMomentumTradeSetup(input: {
	lastClose: number;
	rsi: {period: number; value: number | null; zone: 'overbought' | 'oversold' | 'neutral'};
	macd: {crossover: 'bullish' | 'bearish' | 'none'};
}): MomentumTradeSetup | null {
	const close = input.lastClose;
	if (!isFiniteTradePrice(close)) {
		return null;
	}
	let side: TradeSetupSide = 'neutral';
	let conditionalNote = 'Momentum is neutral — no conditional entry.';
	let confidence = 0.35;
	if (input.rsi.zone === 'oversold' && input.macd.crossover === 'bullish') {
		side = 'long';
		conditionalNote = 'Oversold RSI with bullish MACD crossover — conditional long entry at last close.';
		confidence = 0.5;
	} else if (input.rsi.zone === 'overbought' && input.macd.crossover === 'bearish') {
		side = 'short';
		conditionalNote = 'Overbought RSI with bearish MACD crossover — conditional short entry at last close.';
		confidence = 0.5;
	} else if (input.rsi.zone === 'oversold') {
		side = 'long';
		conditionalNote = 'Oversold RSI — partial long bias; MACD crossover not confirming.';
		confidence = 0.4;
	} else if (input.rsi.zone === 'overbought') {
		side = 'short';
		conditionalNote = 'Overbought RSI — partial short bias; MACD crossover not confirming.';
		confidence = 0.4;
	}

	let status: TradeSetupStatus = 'unclear';
	let unclearReason =
		'Momentum setups are conditional and usually partial — combine with price structure before trading.';
	if (side !== 'neutral' && confidence >= 0.45 && input.macd.crossover !== 'none') {
		status = 'clear';
		unclearReason = '';
	}

	return {
		status,
		source: 'rsi_macd',
		rsiPeriod: input.rsi.period,
		rsiValue: input.rsi.value,
		rsiZone: input.rsi.zone,
		macdCrossover: input.macd.crossover,
		lastClose: close,
		side,
		entryPrice: close,
		entryLabel: 'last close (conditional)',
		conditionalNote,
		confidence,
		...(unclearReason ? {unclearReason} : {}),
	};
}

export function normalizeMomentumTradeSetup(setup: MomentumTradeSetup) {
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
