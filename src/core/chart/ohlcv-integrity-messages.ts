export const OHLCV_TRUNCATION_MYTH =
	'Do NOT switch to a coarser interval, shorten lookbackDays, or truncate candles for MCP/context/payload size or high chat context usage. ' +
	'169 hourly bars (~7d) is tiny — context pressure is not a chart-builder limit. ' +
	'Pass the full fetch toolResult unchanged for whatever interval and lookback the operator requested. ' +
	'Chart display downsamples via maxPoints only; meta.loadStatus.barCount is the loaded window and may exceed meta.loadStatus.displayBarCount. ' +
	'Never substitute a coarser interval or shorter window when prepare succeeds.';

export const ANALYSIS_FOLLOWUP_SAME_FETCH =
	'After charting, run analyze_* / apply_* with `{ title, ohlcvDigest }` from meta.sessionBind — do not re-fetch or re-paste fetch JSON unless the operator changed symbol, interval, or lookback.';

/** When chart/analysis tools are called without OHLCV data and no session fetch to bind. */
export const CHART_MISSING_OHLCV_DATA_REASON =
	'No OHLCV data in this request and no bound fetch in this session. ' +
	'Run the provider OHLCV fetch once, then use `{ title, ohlcvDigest }` from meta.sessionBind on chart/analyze/apply follow-ups. ' +
	'Do **not** auto-load market-data servers without the operator’s choice. ' +
	'Activate the `chart` bundle when plotting; see skill **chart-ohlcv-sources**.';
