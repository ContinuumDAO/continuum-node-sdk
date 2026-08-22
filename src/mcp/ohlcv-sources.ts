import type {McpServer} from '@modelcontextprotocol/server';
import {getProtocolModules} from '@continuumdao/ctm-mpc-defi/agent';
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {listMcpServers} from '../core/agent/mcp-servers.js';
import {
	ListOhlcvSourcesResultSchema,
	listOhlcvSources,
} from '../core/chart/ohlcv-sources.js';
import type {DefiProtocolContext} from './defi/context.js';
import {defiProtocolFetchOhlcvToolName} from './defi/ohlcv-chart-workflow.js';
import {sdkResultToCallToolResult} from './tool-utils.js';

function defiOhlcvProtocolSnapshots(): {protocolId: string; fetchTool: string}[] {
	const out: {protocolId: string; fetchTool: string}[] = [];
	for (const mod of getProtocolModules()) {
		const fetchTool = defiProtocolFetchOhlcvToolName(mod.id);
		if (!fetchTool) {
			continue;
		}
		out.push({protocolId: mod.id, fetchTool});
	}
	return out;
}

export function registerOhlcvSourceTools(
	server: McpServer,
	config: NodeSdkConfig,
	defiContext?: DefiProtocolContext,
): void {
	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		'list_ohlcv_sources',
		{
			description:
				'OHLCV data sources only (not the full MCP catalog). Returns active (on this node / loaded DeFi) and repository (catalog MCP not yet added, plus DeFi protocols that expose fetch_ohlcv). ' +
				'For every MCP server use list_mcp_servers. Do not auto-load — present this list and ask the operator which source to use. ' +
				'Then add_mcp_server_from_catalog and/or agent_load_mcp_server, or load_defi_protocol for DeFi venues.',
			inputSchema: z.object({}).strict(),
			outputSchema: ListOhlcvSourcesResultSchema,
		},
		async () => {
			const listed = await listMcpServers(config);
			const data = listOhlcvSources({
				activeServers: listed.ok ? (listed.data.activeServers ?? listed.data.servers) : [],
				availableCatalog: listed.ok ? (listed.data.availableCatalog ?? []) : [],
				loadedProtocolIds: defiContext?.getLoadedProtocols() ?? [],
				defiProtocols: defiOhlcvProtocolSnapshots(),
				...(listed.ok ? {} : {mcpListError: listed.reason}),
			});
			return sdkResultToCallToolResult({ok: true, data});
		},
	);
}
