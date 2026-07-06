export const OHLCV_TRUNCATION_MYTH =
	'Do NOT switch to a coarser interval, shorten lookbackDays, or truncate candles for MCP/context/payload size or high chat context usage. ' +
	'169 hourly bars (~7d) is tiny — context pressure is not a chart-builder limit. ' +
	'Pass the full fetch toolResult unchanged for whatever interval and lookback the operator requested. ' +
	'Chart display downsamples via maxPoints only; meta.loadStatus.barCount is the loaded window and may exceed meta.loadStatus.displayBarCount. ' +
	'Never substitute a coarser interval or shorter window when prepare succeeds.';

export const ANALYSIS_FOLLOWUP_SAME_FETCH =
	'After charting, run analyze_* on the SAME unmodified fetch toolResult — do not re-fetch for analysis-only follow-ups unless the operator changed symbol, interval, or lookback.';

/** When chart/analysis tools are called without OHLCV data and no session fetch to bind. */
export const CHART_MISSING_OHLCV_DATA_REASON =
	'No OHLCV data in this request and no prior fetch in this chat session. ' +
	'Ask the operator which data source to use (e.g. CoinGecko, CoinMarketCap public, Hyperliquid/GMX DeFi, or another catalog MCP), then `agent_load_mcp_server`, run that provider’s OHLCV fetch, and pass the **full fetch JSON** as `toolResult`. ' +
	'Do **not** auto-load CoinMarketCap, CoinGecko, or other market-data servers without the operator’s choice. ' +
	'Activate the `chart` bundle (`activate_tool_group`) when plotting; see skill **chart-ohlcv-sources**.';
