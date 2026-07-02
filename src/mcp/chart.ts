import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {prepareChart} from '../core/chart/prepare.js';
import {
	PrepareChartInputSchema,
	PrepareChartOutputSchema,
} from '../core/chart/schemas.js';
import {camelToSnake, sdkResultToCallToolResult} from './tool-utils.js';

export function registerChartTools(server: McpServer): void {
	server.registerTool(
		camelToSnake('prepareChart'),
		{
			description:
				'Build a continuum/chart/v1 payload for the agent chat UI (lightweight-charts). ' +
				'Supports candlestick, line, area, histogram series plus overlays: sma, ema, bollinger, fibonacci ' +
				'(main pane) and rsi, macd, stochasticrsi (separate oscillator panes below price). ' +
				'Need ~30+ bars for MACD/Stoch RSI. Times: Unix seconds, ms, or YYYY-MM-DD.',
			inputSchema: PrepareChartInputSchema,
			outputSchema: PrepareChartOutputSchema,
		},
		async (input) => sdkResultToCallToolResult(prepareChart(input)),
	);
}
