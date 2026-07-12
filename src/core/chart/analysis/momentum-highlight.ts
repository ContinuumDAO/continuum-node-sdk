import type {MomentumTradeSetup} from './trade-setups/momentum-trade-setup.js';

export type MomentumHighlight = {
	summary: string;
	rsiPeriod: number;
	rsiValue: number | null;
	rsiZone: 'overbought' | 'oversold' | 'neutral';
	macd: number | null;
	macdSignal: number | null;
	macdHistogram: number | null;
	macdCrossover: 'bullish' | 'bearish' | 'none';
	side: 'long' | 'short' | 'neutral';
	status: 'clear' | 'unclear';
	confidence: number;
	conditionalNote: string;
	unclearReason?: string;
};

function rsiZoneLabel(zone: MomentumHighlight['rsiZone']): string {
	if (zone === 'overbought') {
		return 'overbought';
	}
	if (zone === 'oversold') {
		return 'oversold';
	}
	return 'neutral';
}

function crossoverLabel(crossover: MomentumHighlight['macdCrossover']): string {
	if (crossover === 'bullish') {
		return 'bullish crossover';
	}
	if (crossover === 'bearish') {
		return 'bearish crossover';
	}
	return 'no crossover';
}

function sideLabel(side: MomentumHighlight['side']): string {
	if (side === 'long') {
		return 'Long';
	}
	if (side === 'short') {
		return 'Short';
	}
	return 'Neutral';
}

function formatOptional(value: number | null, digits = 2): string {
	return value != null && Number.isFinite(value) ? value.toFixed(digits) : 'n/a';
}

export function buildMomentumHighlight(input: {
	rsi: {period: number; value: number | null; zone: 'overbought' | 'oversold' | 'neutral'};
	macd: {
		macd: number | null;
		signal: number | null;
		histogram: number | null;
		crossover: 'bullish' | 'bearish' | 'none';
	};
	setup: MomentumTradeSetup | null;
}): MomentumHighlight {
	const setup = input.setup;
	const side = setup?.side ?? 'neutral';
	const status = setup?.status ?? 'unclear';
	const confidence = setup?.confidence ?? 0.35;
	const conditionalNote =
		setup?.conditionalNote ?? 'Momentum is neutral — no conditional entry.';
	const rsiPart =
		input.rsi.value != null
			? `RSI(${input.rsi.period}) ${input.rsi.value.toFixed(1)} — ${rsiZoneLabel(input.rsi.zone)}`
			: `RSI(${input.rsi.period}) unavailable`;
	const macdPart = `MACD ${formatOptional(input.macd.macd)} / signal ${formatOptional(input.macd.signal)} (${crossoverLabel(input.macd.crossover)})`;
	const biasPart = `${sideLabel(side)} bias — ${status}`;
	const summary = `${rsiPart}. ${macdPart}. ${biasPart}. ${conditionalNote}`;

	return {
		summary,
		rsiPeriod: input.rsi.period,
		rsiValue: input.rsi.value,
		rsiZone: input.rsi.zone,
		macd: input.macd.macd,
		macdSignal: input.macd.signal,
		macdHistogram: input.macd.histogram,
		macdCrossover: input.macd.crossover,
		side,
		status,
		confidence,
		conditionalNote,
		...(setup?.unclearReason ? {unclearReason: setup.unclearReason} : {}),
	};
}
