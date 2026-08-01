import type { McpServer } from "@modelcontextprotocol/server";
import type {NodeSdkConfig} from '../config/schema.js';
import {assertAgentChartDataFetchAllowed} from '../core/agent/agent-chart-data-access-assert.js';
import {isAgentChartDataFetchTool} from '../core/agent/agent-chart-data-access.js';
import {sdkResultToCallToolResult} from './tool-utils.js';

/** Block OHLCV / time-series fetch MCP tools until preferred KeyGen billing month is active. */
export function installAgentChartDataAccessGate(
	server: McpServer,
	nodeConfig: NodeSdkConfig,
): void {
	const originalRegister = server.registerTool.bind(server);

	server.registerTool = ((name: string, toolConfig: unknown, handler: unknown) => {
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

		return (originalRegister as (...args: unknown[]) => unknown)(
			name,
			toolConfig,
			wrappedHandler,
		);
	}) as typeof server.registerTool;
}
