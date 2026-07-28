import type {DonchianTradeSetup} from './trade-setups/donchian-trade-setup.js';

export type DonchianHighlight = {
	summary: string;
	upper: number;
	middle: number;
	lower: number;
	priorUpper: number;
	priorLower: number;
	channelWidth: number;
	period: number;
	entryMode: 'retest' | 'immediate';
	side: 'long' | 'short' | 'neutral';
	status: 'clear' | 'unclear';
	invalidated: boolean;
	confidence: number;
	conditionalNote: string;
	chartDrawingHint?: string;
	unclearReason?: string;
};

function sideLabel(side: DonchianHighlight['side']): string {
	if (side === 'long') {
		return 'Long';
	}
	if (side === 'short') {
		return 'Short';
	}
	return 'Neutral';
}

export function buildDonchianHighlight(input: {
	upper: number;
	middle: number;
	lower: number;
	priorUpper: number;
	priorLower: number;
	channelWidth: number;
	period: number;
	entryMode: 'retest' | 'immediate';
	setup: DonchianTradeSetup | null;
}): DonchianHighlight {
	const setup = input.setup;
	const side = setup?.side ?? 'neutral';
	const status = setup?.status ?? 'unclear';
	const invalidated = setup?.invalidated ?? false;
	const confidence = setup?.confidence ?? 0.4;
	const conditionalNote =
		setup?.conditionalNote ??
		'Donchian channel — wait for breakout or retest of the broken band.';
	const statusPart = invalidated ? 'Invalid' : status === 'clear' ? 'Clear' : 'Unclear';
	const modePart = input.entryMode === 'retest' ? 'retest' : 'immediate';
	const summary = `DC(${input.period}) · ${input.lower.toFixed(2)}–${input.upper.toFixed(2)} · ${modePart}. ${sideLabel(side)} — ${statusPart}. ${conditionalNote}`;
	const chartDrawingHint =
		'When a chart is already prepared, merge `{ type: "donchian", sourceSeriesId, period }` into prepareReplay.overlays (period from trade-desk.yaml donchianPeriod) and call prepare_chart_from_rows with the same OHLCV session.';

	return {
		summary,
		upper: input.upper,
		middle: input.middle,
		lower: input.lower,
		priorUpper: input.priorUpper,
		priorLower: input.priorLower,
		channelWidth: input.channelWidth,
		period: input.period,
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
