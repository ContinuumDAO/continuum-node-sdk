import type { McpServer } from "@modelcontextprotocol/server";
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	addMcpServer,
	addMcpServerFromCatalog,
	getMcpServer,
	listMcpServers,
	removeMcpServer,
	setMcpServerFlags,
} from '../core/agent/mcp-servers.js';
import {resolveCoinMarketCapMcpServer} from '../core/coinmarketcap/mcp-server-choice.js';
import {
	AddMcpServerFromCatalogInputSchema,
	AddMcpServerInputSchema,
	AgentMcpServerRowSchema,
	GetMcpServerQuerySchema,
	ListMcpServersInputSchema,
	ListMcpServersResultSchema,
	RemoveMcpServerInputSchema,
	SetMcpServerFlagsInputSchema,
	SelectedSigningKeySchema,
} from '../schemas/extended.js';
import {camelToSnake, wrapSdk} from './tool-utils.js';

const ADD_MCP_SERVER_OUTPUT_SCHEMA = z
	.object({
		server: AgentMcpServerRowSchema,
		selectedSigningKey: SelectedSigningKeySchema.optional(),
		signingMessage: z.string(),
	})
	.strict();

const REMOVE_MCP_SERVER_OUTPUT_SCHEMA = z
	.object({
		message: z.string(),
		selectedSigningKey: SelectedSigningKeySchema.optional(),
		signingMessage: z.string(),
	})
	.strict();

const SET_MCP_SERVER_FLAGS_OUTPUT_SCHEMA = z
	.object({
		server: AgentMcpServerRowSchema,
		selectedSigningKey: SelectedSigningKeySchema.optional(),
		signingMessage: z.string(),
	})
	.strict();

const RESOLVE_COINMARKETCAP_MCP_SERVER_OUTPUT_SCHEMA = z
	.object({
		serverId: z.string().nullable(),
		variant: z.enum(['pro', 'public', 'none']),
		apiKeyConfigured: z.boolean(),
		proActive: z.boolean(),
		publicActive: z.boolean(),
		rationale: z.string(),
		agentLoadMcpServer: z.object({serverId: z.string()}).nullable(),
	})
	.strict();

export function registerAgentMcpServerTools(
	server: McpServer,
	config: NodeSdkConfig,
): void {
	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		camelToSnake('listMcpServers'),
		{
			description:
				'List MCP servers on this node (GET /listMcpServers). Default scope active: slim activeServers only (ids, flags, env hints) — use for "what is loaded/active". scope catalog: repository templates not yet on this node (add_mcp_server_from_catalog). Trust this tool output; do not read MCP_servers.json or grep user_folder. For OHLCV sources only use list_ohlcv_sources. For CoinMarketCap call resolve_coinmarketcap_mcp_server first.',
			inputSchema: ListMcpServersInputSchema,
			outputSchema: ListMcpServersResultSchema,
		},
		async (input: z.infer<typeof ListMcpServersInputSchema>) =>
			wrapSdk(listMcpServers(config, input)),
	);

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		camelToSnake('resolveCoinmarketcapMcpServer'),
		{
			description:
				'When the operator asks for CoinMarketCap data, call this before agent_load_mcp_server. Prefer coinmarketcap-public for DEX klines and get_crypto_ohlcv_historical (Pro key in Variables on the same server). Catalog coinmarketcap is optional for TA/news only — not for Uniswap pool charts. Use agentLoadMcpServer.serverId with agent_load_mcp_server.',
			inputSchema: z.object({}).strict(),
			outputSchema: RESOLVE_COINMARKETCAP_MCP_SERVER_OUTPUT_SCHEMA,
		},
		async () => wrapSdk(resolveCoinMarketCapMcpServer(config)),
	);

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		camelToSnake('getMcpServer'),
		{
			description: 'Get one MCP server by id (GET /getMcpServer).',
			inputSchema: GetMcpServerQuerySchema,
			outputSchema: AgentMcpServerRowSchema,
		},
		async (query: z.infer<typeof GetMcpServerQuerySchema>) =>
			wrapSdk(getMcpServer(config, query)),
	);

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		camelToSnake('addMcpServer'),
		{
			description:
				'Add or update a user MCP server (POST /addMcpServer, management-signed). For repository templates use add_mcp_server_from_catalog (POST /addMcpServerFromCatalog) after list_mcp_servers availableCatalog. Custom servers: HTTP needs url; STDIO needs command. Secrets via apiKeyEnvVar/envVars + add_environment_variable only — never inline apiKey.',
			inputSchema: AddMcpServerInputSchema,
			outputSchema: ADD_MCP_SERVER_OUTPUT_SCHEMA,
		},
		async (input: z.infer<typeof AddMcpServerInputSchema>) =>
			wrapSdk(addMcpServer(config, input)),
	);

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		camelToSnake('addMcpServerFromCatalog'),
		{
			description:
				'Activate one MCP server from the repository catalog (POST /addMcpServerFromCatalog, management-signed). Use list_mcp_servers availableCatalog for ids; set Variables for apiKeyEnvVar/envVars before initialLoad. Copies full row from bind-mounted agent_llm_config.defaults/MCP_servers.json.',
			inputSchema: AddMcpServerFromCatalogInputSchema,
			outputSchema: ADD_MCP_SERVER_OUTPUT_SCHEMA,
		},
		async (input: z.infer<typeof AddMcpServerFromCatalogInputSchema>) =>
			wrapSdk(addMcpServerFromCatalog(config, input)),
	);

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		camelToSnake('removeMcpServer'),
		{
			description:
				'Remove a user MCP server by id (POST /removeMcpServer). Default/built-in servers cannot be removed.',
			inputSchema: RemoveMcpServerInputSchema,
			outputSchema: REMOVE_MCP_SERVER_OUTPUT_SCHEMA,
		},
		async (input: z.infer<typeof RemoveMcpServerInputSchema>) =>
			wrapSdk(removeMcpServer(config, input)),
	);

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		camelToSnake('setMcpServerFlags'),
		{
			description:
				'Update initialLoad and/or aiReady flags on an MCP server (POST /setMcpServerFlags, management-signed). At least one flag required.',
			inputSchema: SetMcpServerFlagsInputSchema,
			outputSchema: SET_MCP_SERVER_FLAGS_OUTPUT_SCHEMA,
		},
		async (input: z.infer<typeof SetMcpServerFlagsInputSchema>) =>
			wrapSdk(setMcpServerFlags(config, input)),
	);
}
