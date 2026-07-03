import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {prepareChart} from '../core/chart/prepare.js';
import {
	PrepareChartFromRowsInputSchema,
	PrepareChartFromRowsOutputSchema,
	prepareChartFromRows,
} from '../core/chart/prepare-from-rows.js';
import {
	PrepareChartInputSchema,
	PrepareChartOutputSchema,
} from '../core/chart/schemas.js';
import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import type {SdkResult} from '../core/result.js';
import {camelToSnake, sdkResultToCallToolResult} from './tool-utils.js';

function chartToolResult<T extends {meta?: {warnings?: string[]}}>(
	result: SdkResult<T>,
): CallToolResult {
	const toolResult = sdkResultToCallToolResult(result);
	if (!result.ok || !result.data.meta?.warnings?.length) {
		return toolResult;
	}
	const warningText = result.data.meta.warnings.join('\n');
	const first = toolResult.content[0];
	if (first?.type === 'text') {
		return {
			...toolResult,
			content: [{type: 'text', text: `${warningText}\n${first.text}`}],
		};
	}
	return toolResult;
}

export function registerChartTools(server: McpServer): void {
	server.registerTool(
		camelToSnake('prepareChartFromRows'),
		{
			description:
				'Build a continuum/chart/v1 payload from OHLCV rows returned by any price fetch tool ' +
				'(CoinGecko execute, ctm_*_fetch_ohlcv, exchange APIs, etc.). ' +
				'REQUIRED: `title` (what you fetched — asset, interval, window) plus `rows` OR `toolResult`. ' +
				'Fetch may return `{ title, label, result }`; chart metadata must match the data, not the user chat. ' +
				'Never `{}`. Adds default EMA(50), RSI(14), and volume pane when rows include volume.',
			inputSchema: PrepareChartFromRowsInputSchema,
			outputSchema: PrepareChartFromRowsOutputSchema,
		},
		async (input) => chartToolResult(prepareChartFromRows(input)),
	);

	server.registerTool(
		camelToSnake('prepareChart'),
		{
			description:
				'Advanced chart builder: multi-series candlestick/line/area/histogram plus overlays (sma, ema, bollinger, ' +
				'fibonacci, rsi, macd, stochasticrsi). For a single OHLCV feed after any fetch tool, prefer ' +
				'`prepare_chart_from_rows` with `rows` or `toolResult`. ' +
				'Shorthand: `bars`, `result`, `candles`, or `toolResult` from a prior fetch. Never `{}`.',
			inputSchema: PrepareChartInputSchema,
			outputSchema: PrepareChartOutputSchema,
		},
		async (input) => sdkResultToCallToolResult(prepareChart(input)),
	);
}
