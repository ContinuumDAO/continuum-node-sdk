import { McpServer } from "@modelcontextprotocol/server";
import type {NodeSdkConfig} from '../../config/schema.js';
import {
	ArkhamApiRequestInputSchema,
	ArkhamApiRequestOutputSchema,
	ListArkhamApiPathsInputSchema,
	ListArkhamApiPathsOutputSchema,
	arkhamApiRequest,
	listArkhamApiPaths,
	missingArkhamApiKeyReason,
	resolveArkhamApiKey,
} from '../../core/arkham-intel/index.js';
import {registerMcpMarkdownResource} from '../mcp-resources.js';
import {sdkResultToCallToolResult} from '../tool-utils.js';

export function registerArkhamIntelTools(
	server: McpServer,
	config: NodeSdkConfig,
): void {
	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		'list_arkham_api_paths',
		{
			description:
				'List documented Arkham Intel REST paths (method + path + short description). Use these with arkham_api_request. Full reference: https://arkm.com/llms.txt. No API key. WebSocket is omitted.',
			inputSchema: ListArkhamApiPathsInputSchema,
			outputSchema: ListArkhamApiPathsOutputSchema,
		},
		async () => sdkResultToCallToolResult({ok: true, data: listArkhamApiPaths()}),
	);

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		'arkham_api_request',
		{
			description:
				'Call the official Arkham Intel REST API (https://api.arkm.com). Requires Variable ARKHAM_API_KEY (header API-Key). Args: method (GET/POST/PUT/DELETE, default GET), path (e.g. /intelligence/address/{address}), optional query_params and JSON body. Use list_arkham_api_paths or https://arkm.com/llms.txt for endpoints. /transfers is billed per row — keep limits tight. Not WebSocket. Not an OHLCV chart source.',
			inputSchema: ArkhamApiRequestInputSchema,
			outputSchema: ArkhamApiRequestOutputSchema,
		},
		async input => {
			const apiKey = await resolveArkhamApiKey(config);
			if (!apiKey) {
				return sdkResultToCallToolResult({
					ok: false,
					reason: missingArkhamApiKeyReason(),
				});
			}
			return sdkResultToCallToolResult(await arkhamApiRequest(input, {apiKey}));
		},
	);
}

export function registerArkhamIntelResources(server: McpServer): void {
	registerMcpMarkdownResource(
		server,
		'arkham_intel_docs',
		'arkham-intel.md',
		'Official Arkham Intel REST API: arkham_api_request plus documented paths. Requires ARKHAM_API_KEY.',
	);
}

export function createArkhamIntelMcpServer(config: NodeSdkConfig): McpServer {
	const server = new McpServer(
		{
			name: 'arkham-intel-mcp',
			version: '1.0.0',
		},
		{
			capabilities: {
				tools: {},
			},
		},
	);

	registerArkhamIntelTools(server, config);
	registerArkhamIntelResources(server);

	return server;
}
