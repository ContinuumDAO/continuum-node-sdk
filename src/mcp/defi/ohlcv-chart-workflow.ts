import {getToolsForProtocol} from './catalog-adapter.js';

/** First fetch_ohlcv tool for a protocol, if any. */
export function defiProtocolFetchOhlcvToolName(protocolId: string): string | undefined {
	return getToolsForProtocol(protocolId).find(t => t.name.includes('fetch_ohlcv'))?.name;
}

/** Load-only path after fetch_ohlcv — cron / prefetch; no chart unless operator asks later. */
export function defiOhlcvFetchOnlyWorkflowReminder(protocolId: string, fetchTool: string): string {
	return [
		`Load-only OHLCV for ${protocolId} (cron / prefetch — no chart unless operator asks later):`,
		`0. Call get_defi_protocol_fetch_options — pick chainId (protocol.fetch.chain.set UI or ask operator).`,
		`1. Call ${fetchTool} with chainId + JSON numbers for lookbackDays / lookbackHours.`,
		'2. Summarize meta.ohlcvSummary (high, low, lastClose, barCount) and meta.sessionBind from the slim fetch response — STOP.',
		'3. Do NOT call prepare_chart_from_rows unless the operator explicitly asks to chart / plot / draw.',
		'4. Later chart (same session): prepare_chart_from_rows({ title, ohlcvDigest }) from meta.sessionBind — no re-fetch.',
		'When analysis is requested on follow-up: analyze_* with { title, ohlcvDigest } — not the full candle JSON.',
	].join('\n');
}

/** Analysis-only path after fetch_ohlcv — no chart envelope. */
export function defiOhlcvAnalysisWorkflowReminder(protocolId: string, fetchTool: string): string {
	return [
		`Analysis-only OHLCV for ${protocolId} (interpret / analyze — no chart required):`,
		`0. Call get_defi_protocol_fetch_options — pick chainId (protocol.fetch.chain.set UI or ask operator).`,
		`1. Call ${fetchTool} with chainId for candle rows (or reuse bound session via meta.sessionBind).`,
		'2. Call continuum__list_chart_analysis_options when the analysis type is unclear.',
		'3. Call matching continuum__analyze_* with full fetch JSON as toolResult on first call, or { title, ohlcvDigest } on follow-ups.',
		'4. Summarize { analysis, meta } in prose. Do NOT call prepare_chart_from_rows unless the operator asked to draw a chart.',
		'Skills: chart-analysis-menu (initialLoad), chart_analysis_docs. Orchestration analysis sub-agents must stop here.',
	].join('\n');
}

/** Chart/plot path after fetch_ohlcv — only when operator asked to chart. */
export function defiOhlcvChartWorkflowReminder(protocolId: string, fetchTool: string): string {
	return [
		`Chart/plot OHLCV for ${protocolId} (operator asked to chart / graph / plot / draw):`,
		`0. Call get_defi_protocol_fetch_options({ protocolId: "${protocolId}" }) — pick chainId (UI protocol.fetch.chain.set or ask operator). Required when multiple chains exist.`,
		`1. Call ${fetchTool} with chainId + JSON numbers for lookbackDays / lookbackHours (e.g. lookbackDays: 30 — not "30"), or reuse bound session via meta.sessionBind.`,
		'2. Same agent turn — call continuum__prepare_chart_from_rows with the **full fetch object** as toolResult (not a JSON string; never truncate candles), or { title, ohlcvDigest } when fetch is already bound.',
		'Do NOT use fetch_market_snapshot for chart history — it returns ~48 recent bars only.',
		'Fetching candles does not render a chart. The UI only draws continuum/chart/v1 from prepare_chart_from_rows — not assistant markdown.',
		'Skills: chart-defaults, chart-periods, chart_docs.',
	].join('\n');
}

/** Default after load_defi_protocol — fetch/load + analysis lanes only (chart lane is separate chartWorkflow). */
export function defiOhlcvWorkflowReminder(protocolId: string, fetchTool: string): string {
	return [
		defiOhlcvFetchOnlyWorkflowReminder(protocolId, fetchTool),
		'',
		defiOhlcvAnalysisWorkflowReminder(protocolId, fetchTool),
	].join('\n');
}
