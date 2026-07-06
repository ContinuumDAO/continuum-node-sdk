export const OHLCV_TRUNCATION_MYTH =
	'Do NOT switch to a coarser interval, shorten lookbackDays, or truncate candles for MCP/context/payload size or high chat context usage. ' +
	'169 hourly bars (~7d) is tiny — context pressure is not a chart-builder limit. ' +
	'Pass the full fetch toolResult unchanged for whatever interval and lookback the operator requested. ' +
	'Chart display downsamples via maxPoints only; meta.loadStatus.barCount is the loaded window and may exceed meta.loadStatus.displayBarCount. ' +
	'Never substitute a coarser interval or shorter window when prepare succeeds.';

export const ANALYSIS_FOLLOWUP_SAME_FETCH =
	'After charting, run analyze_* on the SAME unmodified fetch toolResult — do not re-fetch for analysis-only follow-ups unless the operator changed symbol, interval, or lookback.';
