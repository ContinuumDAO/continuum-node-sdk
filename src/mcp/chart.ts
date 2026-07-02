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
import {camelToSnake, sdkResultToCallToolResult} from './tool-utils.js';

export function registerChartTools(server: McpServer): void {
	server.registerTool(
		camelToSnake('prepareChartFromRows'),
		{
			description:
				'Build a continuum/chart/v1 payload from OHLCV rows returned by any price fetch tool ' +
				'(CoinGecko execute, ctm_*_fetch_ohlcv, exchange APIs, etc.). ' +
				'REQUIRED: pass `rows` (bar array) OR `toolResult` (full prior MCP JSON with a `result`/`data` array). ' +
				'Never call with `{}`. Preferred after a successful OHLCV fetch in the same turn. ' +
				'Adds default EMA(50), RSI(14), and volume pane when enough bars are present.',
			inputSchema: PrepareChartFromRowsInputSchema,
			outputSchema: PrepareChartFromRowsOutputSchema,
		},
		async (input) => sdkResultToCallToolResult(prepareChartFromRows(input)),
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
