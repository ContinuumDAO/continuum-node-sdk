import type {IchimokuTradeSetup} from './trade-setups/ichimoku-trade-setup.js';

export type IchimokuHighlight = {
	summary: string;
	conversion: number;
	base: number;
	cloudTop: number;
	cloudBottom: number;
	conversionPeriod: number;
	basePeriod: number;
	spanPeriod: number;
	displacement: number;
	tkState: 'bullish' | 'bearish' | 'flat';
	cloudPosition: 'above' | 'below' | 'inside';
	strategy: 'tk_cross' | 'cloud';
	side: 'long' | 'short' | 'neutral';
	status: 'clear' | 'unclear';
	confidence: number;
	conditionalNote: string;
	chartDrawingHint?: string;
	unclearReason?: string;
};

function sideLabel(side: IchimokuHighlight['side']): string {
	if (side === 'long') {
		return 'Long';
	}
	if (side === 'short') {
		return 'Short';
	}
	return 'Neutral';
}

export function buildIchimokuHighlight(input: {
	conversion: number;
	base: number;
	cloudTop: number;
	cloudBottom: number;
	conversionPeriod: number;
	basePeriod: number;
	spanPeriod: number;
	displacement: number;
	tkState: 'bullish' | 'bearish' | 'flat';
	cloudPosition: 'above' | 'below' | 'inside';
	strategy: 'tk_cross' | 'cloud';
	setup: IchimokuTradeSetup | null;
}): IchimokuHighlight {
	const setup = input.setup;
	const side = setup?.side ?? 'neutral';
	const status = setup?.status ?? 'unclear';
	const confidence = setup?.confidence ?? 0.4;
	const conditionalNote =
		setup?.conditionalNote ?? 'Ichimoku — wait for TK cross or cloud retest.';
	const statusPart = status === 'clear' ? 'Clear' : 'Unclear';
	const summary = `Ichimoku(${input.conversionPeriod}/${input.basePeriod}/${input.spanPeriod}) · TK ${input.tkState} · price ${input.cloudPosition} cloud ${input.cloudBottom.toFixed(2)}–${input.cloudTop.toFixed(2)} · ${input.strategy}. ${sideLabel(side)} — ${statusPart}. ${conditionalNote}`;
	const chartDrawingHint =
		'When a chart is already prepared, merge `{ type: "ichimoku", sourceSeriesId, conversionPeriod, basePeriod, spanPeriod, displacement }` into prepareReplay.overlays (params from trade-desk.yaml) and call prepare_chart_from_rows with the same OHLCV session.';

	return {
		summary,
		conversion: input.conversion,
		base: input.base,
		cloudTop: input.cloudTop,
		cloudBottom: input.cloudBottom,
		conversionPeriod: input.conversionPeriod,
		basePeriod: input.basePeriod,
		spanPeriod: input.spanPeriod,
		displacement: input.displacement,
		tkState: input.tkState,
		cloudPosition: input.cloudPosition,
		strategy: input.strategy,
		side,
		status,
		confidence,
		conditionalNote,
		chartDrawingHint,
		...(setup?.unclearReason ? {unclearReason: setup.unclearReason} : {}),
	};
}
