export const OHLCV_TRUNCATION_MYTH =
	'Do NOT switch interval or truncate candles for MCP context size. Pass the full fetch toolResult unchanged; chart/analysis downsample for display via maxPoints only.';

export const ANALYSIS_FOLLOWUP_SAME_FETCH =
	'After charting, run analyze_* on the SAME unmodified fetch toolResult — do not re-fetch for analysis-only follow-ups unless the operator changed symbol, interval, or lookback.';
