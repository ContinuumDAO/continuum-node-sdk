import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	assertAgentChartDataFetchAllowed,
	isAgentChartDataFetchTool,
} from '../core/agent/agent-chart-data-access.js';
import {sdkResultToCallToolResult} from './tool-utils.js';

/** Block OHLCV / time-series fetch MCP tools until preferred KeyGen billing month is active. */
export function installAgentChartDataAccessGate(
	server: McpServer,
	nodeConfig: NodeSdkConfig,
): void {
	const originalRegister = server.registerTool.bind(server);

	server.registerTool = ((name, toolConfig, handler) => {
		const wrappedHandler = async (rawInput: unknown, extra: unknown) => {
			if (isAgentChartDataFetchTool(name)) {
				const gate = await assertAgentChartDataFetchAllowed(nodeConfig);
				if (!gate.ok) {
					return sdkResultToCallToolResult(gate);
				}
			}
			return (handler as (input: unknown, extra: unknown) => Promise<unknown>)(
				rawInput,
				extra,
			);
		};

		return originalRegister(name, toolConfig, wrappedHandler as typeof handler);
	}) as typeof server.registerTool;
}
