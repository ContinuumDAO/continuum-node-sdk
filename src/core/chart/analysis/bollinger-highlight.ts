import type {BollingerTradeSetup} from './trade-setups/bollinger-trade-setup.js';

export type BollingerHighlight = {
	summary: string;
	upper: number;
	middle: number;
	lower: number;
	bandWidth: number;
	percentB: number;
	period: number;
	stdDev: number;
	side: 'long' | 'short' | 'neutral';
	status: 'clear' | 'unclear';
	invalidated: boolean;
	confidence: number;
	conditionalNote: string;
	chartDrawingHint?: string;
	unclearReason?: string;
};

function sideLabel(side: BollingerHighlight['side']): string {
	if (side === 'long') {
		return 'Long';
	}
	if (side === 'short') {
		return 'Short';
	}
	return 'Neutral';
}

export function buildBollingerHighlight(input: {
	upper: number;
	middle: number;
	lower: number;
	bandWidth: number;
	percentB: number;
	period: number;
	stdDev: number;
	setup: BollingerTradeSetup | null;
}): BollingerHighlight {
	const setup = input.setup;
	const side = setup?.side ?? 'neutral';
	const status = setup?.status ?? 'unclear';
	const invalidated = setup?.invalidated ?? false;
	const confidence = setup?.confidence ?? 0.4;
	const conditionalNote =
		setup?.conditionalNote ??
		'Bollinger bands — wait for price to reach an outer band for a fade entry.';
	const statusPart = invalidated ? 'Invalid' : status === 'clear' ? 'Clear' : 'Unclear';
	const summary = `BB(${input.period}, ${input.stdDev}) · ${input.lower.toFixed(2)}–${input.upper.toFixed(2)} · %B ${(input.percentB * 100).toFixed(1)}. ${sideLabel(side)} — ${statusPart}. ${conditionalNote}`;
	const chartDrawingHint =
		'When a chart is already prepared, merge `{ type: "bollinger", sourceSeriesId, period, stdDev }` into prepareReplay.overlays and call prepare_chart_from_rows with the same OHLCV session.';

	return {
		summary,
		upper: input.upper,
		middle: input.middle,
		lower: input.lower,
		bandWidth: input.bandWidth,
		percentB: input.percentB,
		period: input.period,
		stdDev: input.stdDev,
		side,
		status,
		invalidated,
		confidence,
		conditionalNote,
		chartDrawingHint,
		...(setup?.unclearReason ? {unclearReason: setup.unclearReason} : {}),
	};
}
