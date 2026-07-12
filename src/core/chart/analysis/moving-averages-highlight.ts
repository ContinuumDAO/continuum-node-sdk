import type {MovingAveragesTradeSetup} from './trade-setups/moving-averages-trade-setup.js';
import {maPairLabel} from './trade-setups/moving-averages-trade-setup.js';

export type MovingAveragesHighlight = {
	summary: string;
	tradeSummary: string;
	fastMa: number;
	slowMa: number;
	fastPeriod: number;
	slowPeriod: number;
	maType: 'sma' | 'ema';
	strategy: 'crossover' | 'proximity_retest';
	crossoverLabel: 'golden_cross' | 'death_cross' | 'none';
	proximityType: 'slow_ma_retest_bullish' | 'slow_ma_retest_bearish' | 'none';
	crossoverState: 'bullish' | 'bearish' | 'none';
	barsSinceCrossover: number | null;
	side: 'long' | 'short' | 'neutral';
	status: 'clear' | 'unclear';
	confidence: number;
	conditionalNote: string;
	chartDrawingHint?: string;
	unclearReason?: string;
};

function sideLabel(side: MovingAveragesHighlight['side']): string {
	if (side === 'long') {
		return 'Long';
	}
	if (side === 'short') {
		return 'Short';
	}
	return 'Neutral';
}

function strategyLabel(strategy: MovingAveragesHighlight['strategy']): string {
	return strategy === 'crossover' ? 'crossover' : 'proximity + retest at slow MA';
}

function crossoverPart(setup: MovingAveragesTradeSetup | null): string {
	if (!setup) {
		return 'No crossover';
	}
	if (setup.crossoverState === 'bullish') {
		const age =
			setup.barsSinceCrossover != null && setup.barsSinceCrossover > 0
				? ` ${setup.barsSinceCrossover} bars ago`
				: setup.barsSinceCrossover === 0
					? ' on current bar'
					: '';
		return `Golden cross${age}`;
	}
	if (setup.crossoverState === 'bearish') {
		const age =
			setup.barsSinceCrossover != null && setup.barsSinceCrossover > 0
				? ` ${setup.barsSinceCrossover} bars ago`
				: setup.barsSinceCrossover === 0
					? ' on current bar'
					: '';
		return `Death cross${age}`;
	}
	if (setup.strategy === 'proximity_retest') {
		return setup.proximityType === 'slow_ma_retest_bullish'
			? 'Bullish regime'
			: setup.proximityType === 'slow_ma_retest_bearish'
				? 'Bearish regime'
				: 'Neutral regime';
	}
	return 'No recent crossover';
}

export function buildMovingAveragesHighlight(input: {
	fastMa: number;
	slowMa: number;
	fastPeriod: number;
	slowPeriod: number;
	maType: 'sma' | 'ema';
	setup: MovingAveragesTradeSetup | null;
}): MovingAveragesHighlight {
	const setup = input.setup;
	const side = setup?.side ?? 'neutral';
	const status = setup?.status ?? 'unclear';
	const confidence = setup?.confidence ?? 0.35;
	const strategy = setup?.strategy ?? 'proximity_retest';
	const conditionalNote =
		setup?.conditionalNote ??
		'Moving averages — wait for crossover or slow MA retest within proximity.';
	const statusPart = status === 'clear' ? 'Clear' : 'Unclear';
	const pair = maPairLabel(input.maType, input.fastPeriod, input.slowPeriod);
	const cross = crossoverPart(setup);
	const summary = `${pair} · fast ${input.fastMa.toFixed(2)} / slow ${input.slowMa.toFixed(2)} · ${cross}. ${sideLabel(side)} — ${statusPart} (${strategyLabel(strategy)}). Confidence ${confidence.toFixed(2)}.`;
	const chartDrawingHint =
		'When a chart is already prepared, merge two overlay items `{ type: "sma"|"ema", sourceSeriesId, period }` for fast and slow periods into prepareReplay.overlays and call prepare_chart_from_rows with the same OHLCV session.';

	return {
		summary,
		tradeSummary: setup?.tradeSummary ?? summary,
		fastMa: input.fastMa,
		slowMa: input.slowMa,
		fastPeriod: input.fastPeriod,
		slowPeriod: input.slowPeriod,
		maType: input.maType,
		strategy,
		crossoverLabel: setup?.crossoverLabel ?? 'none',
		proximityType: setup?.proximityType ?? 'none',
		crossoverState: setup?.crossoverState ?? 'none',
		barsSinceCrossover: setup?.barsSinceCrossover ?? null,
		side,
		status,
		confidence,
		conditionalNote,
		chartDrawingHint,
		...(setup?.unclearReason ? {unclearReason: setup.unclearReason} : {}),
	};
}
