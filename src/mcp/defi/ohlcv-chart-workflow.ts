import {getToolsForProtocol} from './catalog-adapter.js';

/** First fetch_ohlcv tool for a protocol, if any. */
export function defiProtocolFetchOhlcvToolName(protocolId: string): string | undefined {
	return getToolsForProtocol(protocolId).find(t => t.name.includes('fetch_ohlcv'))?.name;
}

/** Analysis-only path after fetch_ohlcv — no chart envelope. */
export function defiOhlcvAnalysisWorkflowReminder(protocolId: string, fetchTool: string): string {
	return [
		`Analysis-only OHLCV for ${protocolId} (interpret / analyze — no chart):`,
		`1. Call ${fetchTool} for candle rows.`,
		'2. Call continuum__list_chart_analysis_options when the analysis type is unclear.',
		'3. Call matching continuum__analyze_* with the full fetch JSON as toolResult.',
		'4. Summarize { analysis, meta } in prose. Do NOT call prepare_chart_from_rows or prepare_chart.',
		'Skills: chart-analysis-menu (initialLoad), chart_analysis_docs. Orchestration analysis sub-agents must stop here.',
	].join('\n');
}

/** Chart/plot path after fetch_ohlcv. */
export function defiOhlcvChartWorkflowReminder(protocolId: string, fetchTool: string): string {
	return [
		`Chart/plot OHLCV for ${protocolId} (operator asked to chart / graph / plot / draw):`,
		`1. Call ${fetchTool} with JSON numbers for lookbackDays / lookbackHours / chainId (e.g. lookbackDays: 30 — not "30").`,
		'2. Same agent turn — call continuum__prepare_chart_from_rows with the **full fetch object** as toolResult (not a JSON string; never truncate candles).',
		'Do NOT use fetch_market_snapshot for chart history — it returns ~48 recent bars only.',
		'Fetching candles does not render a chart. The UI only draws continuum/chart/v1 from prepare_chart_from_rows — not assistant markdown.',
		'Skills: chart-defaults, chart-periods, chart_docs.',
	].join('\n');
}

/** Both lanes — injected on load_defi_protocol when the protocol exposes fetch_ohlcv. */
export function defiOhlcvWorkflowReminder(protocolId: string, fetchTool: string): string {
	return [
		defiOhlcvAnalysisWorkflowReminder(protocolId, fetchTool),
		'',
		defiOhlcvChartWorkflowReminder(protocolId, fetchTool),
	].join('\n');
}
