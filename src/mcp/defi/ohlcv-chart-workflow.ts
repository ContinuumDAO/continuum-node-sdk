import {getToolsForProtocol} from './catalog-adapter.js';

/** First fetch_ohlcv tool for a protocol, if any. */
export function defiProtocolFetchOhlcvToolName(protocolId: string): string | undefined {
	return getToolsForProtocol(protocolId).find(t => t.name.includes('fetch_ohlcv'))?.name;
}

/** Injected on load_defi_protocol so dynamic protocol load carries chart rules in the same tool result. */
export function defiOhlcvChartWorkflowReminder(protocolId: string, fetchTool: string): string {
	return [
		`Charting ${protocolId} OHLCV (required when the operator asks to chart/graph/plot):`,
		`1. Call ${fetchTool} for candle rows.`,
		'2. Same agent turn — call continuum__prepare_chart_from_rows with the full fetch JSON as toolResult and a descriptive title (asset + interval + window).',
		'Fetching candles does not render a chart. The UI only draws continuum/chart/v1 from the prepare_chart_from_rows MCP result — not assistant markdown.',
		'Also see node skills chart-defaults and chart-periods (initialLoad). Full protocol detail: get_defi_protocol_skill.',
	].join('\n');
}
