import type {ZScoreTradeSetup} from './trade-setups/z-score-trade-setup.js';

export type ZScoreHighlight = {
	summary: string;
	z: number;
	sma: number;
	sd: number;
	period: number;
	entryZ: number;
	exitZ: number;
	stopAtrMultiple: number;
	side: 'long' | 'short' | 'neutral';
	status: 'clear' | 'unclear';
	invalidated: boolean;
	confidence: number;
	conditionalNote: string;
	chartDrawingHint?: string;
	unclearReason?: string;
};

function sideLabel(side: ZScoreHighlight['side']): string {
	if (side === 'long') {
		return 'Long';
	}
	if (side === 'short') {
		return 'Short';
	}
	return 'Neutral';
}

export function buildZScoreHighlight(input: {
	z: number;
	sma: number;
	sd: number;
	period: number;
	entryZ: number;
	exitZ: number;
	stopAtrMultiple: number;
	setup: ZScoreTradeSetup | null;
}): ZScoreHighlight {
	const setup = input.setup;
	const side = setup?.side ?? 'neutral';
	const status = setup?.status ?? 'unclear';
	const invalidated = setup?.invalidated ?? false;
	const confidence = setup?.confidence ?? 0.4;
	const conditionalNote =
		setup?.conditionalNote ??
		'Z-score mean reversion — wait for |Z| ≥ entry threshold.';
	const statusPart = invalidated ? 'Invalid' : status === 'clear' ? 'Clear' : 'Unclear';
	const summary = `Z(${input.period})=${input.z.toFixed(2)} · SMA ${input.sma.toFixed(2)} · SD ${input.sd.toFixed(2)}. Entry |Z|≥${input.entryZ}, exit Z=${input.exitZ}, stop ${input.stopAtrMultiple}×ATR. ${sideLabel(side)} — ${statusPart}. ${conditionalNote}`;
	const chartDrawingHint =
		'When a chart is already prepared, merge `{ type: "zscore", sourceSeriesId, period, entryZ, exitZ }` into prepareReplay.overlays and call prepare_chart_from_rows with the same OHLCV session.';

	return {
		summary,
		z: input.z,
		sma: input.sma,
		sd: input.sd,
		period: input.period,
		entryZ: input.entryZ,
		exitZ: input.exitZ,
		stopAtrMultiple: input.stopAtrMultiple,
		side,
		status,
		invalidated,
		confidence,
		conditionalNote,
		chartDrawingHint,
		...(setup?.unclearReason ? {unclearReason: setup.unclearReason} : {}),
	};
}
