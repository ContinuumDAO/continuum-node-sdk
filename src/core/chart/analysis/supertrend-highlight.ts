import type {SupertrendTradeSetup} from './trade-setups/supertrend-trade-setup.js';

export type SupertrendHighlight = {
	summary: string;
	supertrend: number;
	direction: number;
	period: number;
	multiplier: number;
	entryMode: 'flip' | 'retest';
	side: 'long' | 'short' | 'neutral';
	status: 'clear' | 'unclear';
	invalidated: boolean;
	confidence: number;
	conditionalNote: string;
	chartDrawingHint?: string;
	unclearReason?: string;
};

function sideLabel(side: SupertrendHighlight['side']): string {
	if (side === 'long') {
		return 'Long';
	}
	if (side === 'short') {
		return 'Short';
	}
	return 'Neutral';
}

export function buildSupertrendHighlight(input: {
	supertrend: number;
	direction: number;
	period: number;
	multiplier: number;
	entryMode: 'flip' | 'retest';
	setup: SupertrendTradeSetup | null;
}): SupertrendHighlight {
	const setup = input.setup;
	const side = setup?.side ?? 'neutral';
	const status = setup?.status ?? 'unclear';
	const invalidated = setup?.invalidated ?? false;
	const confidence = setup?.confidence ?? 0.4;
	const dirLabel = input.direction >= 0 ? 'bullish' : 'bearish';
	const conditionalNote =
		setup?.conditionalNote ?? 'Supertrend — wait for flip or trail retest.';
	const statusPart = invalidated ? 'Invalid' : status === 'clear' ? 'Clear' : 'Unclear';
	const summary = `ST(${input.period}, ${input.multiplier}) · ${input.supertrend.toFixed(2)} · ${dirLabel} · ${input.entryMode}. ${sideLabel(side)} — ${statusPart}. ${conditionalNote}`;
	const chartDrawingHint =
		'When a chart is already prepared, merge `{ type: "supertrend", sourceSeriesId, period, multiplier }` into prepareReplay.overlays (period/multiplier from trade-desk.yaml) and call prepare_chart_from_rows with the same OHLCV session.';

	return {
		summary,
		supertrend: input.supertrend,
		direction: input.direction >= 0 ? 1 : -1,
		period: input.period,
		multiplier: input.multiplier,
		entryMode: input.entryMode,
		side,
		status,
		invalidated,
		confidence,
		conditionalNote,
		chartDrawingHint,
		...(setup?.unclearReason ? {unclearReason: setup.unclearReason} : {}),
	};
}
