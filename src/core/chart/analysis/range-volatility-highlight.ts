import type {RangeVolatilityTradeSetup} from './trade-setups/range-volatility-trade-setup.js';

export type RangeVolatilityHighlight = {
	summary: string;
	rangeHigh: number;
	rangeLow: number;
	rangePct: number;
	atr: number | null;
	atrPct: number | null;
	compression: 'compressing' | 'expanding' | 'stable';
	recentRangePct: number;
	priorRangePct: number;
	rangePosition: number;
	side: 'long' | 'short' | 'neutral';
	status: 'clear' | 'unclear';
	confidence: number;
	conditionalNote: string;
	chartDrawingHint?: string;
	unclearReason?: string;
};

function compressionLabel(compression: RangeVolatilityHighlight['compression']): string {
	if (compression === 'compressing') {
		return 'compressing';
	}
	if (compression === 'expanding') {
		return 'expanding';
	}
	return 'stable';
}

function sideLabel(side: RangeVolatilityHighlight['side']): string {
	if (side === 'long') {
		return 'Long';
	}
	if (side === 'short') {
		return 'Short';
	}
	return 'Neutral';
}

export function buildRangeVolatilityHighlight(input: {
	rangeHigh: number;
	rangeLow: number;
	rangePct: number;
	atr: number | null;
	atrPct: number | null;
	recentRangePct: number;
	priorRangePct: number;
	compression: 'compressing' | 'expanding' | 'stable';
	setup: RangeVolatilityTradeSetup | null;
}): RangeVolatilityHighlight {
	const setup = input.setup;
	const side = setup?.side ?? 'neutral';
	const status = setup?.status ?? 'unclear';
	const confidence = setup?.confidence ?? 0.35;
	const rangePosition = setup?.rangePosition ?? 0.5;
	const conditionalNote =
		setup?.conditionalNote ??
		'Range/volatility is neutral — wait for compression breakout or range-edge fade.';
	const atrPart =
		input.atrPct != null
			? `ATR ~${input.atrPct.toFixed(2)}% of price`
			: input.atr != null
				? `ATR ${input.atr.toFixed(2)}`
				: 'ATR n/a';
	const summary = `${compressionLabel(input.compression)} volatility · range ${input.rangePct.toFixed(1)}% (${input.rangeLow.toFixed(2)}–${input.rangeHigh.toFixed(2)}) · ${atrPart}. ${sideLabel(side)} — ${status}. ${conditionalNote}`;
	const chartDrawingHint =
		'Optional chart overlay: on a prepared chart, apply horizontal levels at rangeHigh and rangeLow from this analysis (no dedicated draw button — analysis does not update the chart by itself).';

	return {
		summary,
		rangeHigh: input.rangeHigh,
		rangeLow: input.rangeLow,
		rangePct: input.rangePct,
		atr: input.atr,
		atrPct: input.atrPct,
		compression: input.compression,
		recentRangePct: input.recentRangePct,
		priorRangePct: input.priorRangePct,
		rangePosition,
		side,
		status,
		confidence,
		conditionalNote,
		chartDrawingHint,
		...(setup?.unclearReason ? {unclearReason: setup.unclearReason} : {}),
	};
}
