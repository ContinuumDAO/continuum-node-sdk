import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	addMcpServer,
	addMcpServerFromCatalog,
	getMcpServer,
	listMcpServers,
	removeMcpServer,
} from '../core/agent/mcp-servers.js';
import {resolveCoinMarketCapMcpServer} from '../core/coinmarketcap/mcp-server-choice.js';
import {
	AddMcpServerFromCatalogInputSchema,
	AddMcpServerInputSchema,
	AgentMcpServerRowSchema,
	GetMcpServerQuerySchema,
	ListMcpServersDataSchema,
	RemoveMcpServerInputSchema,
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
	server.registerTool(
		camelToSnake('listMcpServers'),
		{
			description:
				'List MCP servers on this node (GET /listMcpServers): active servers and availableCatalog from mpc-config agent_llm_config.defaults/MCP_servers.json (bind-mounted). Use availableCatalog / addableTemplates for add_mcp_server_from_catalog; check envConfigured before initialLoad. When the operator asks for CoinMarketCap, call resolve_coinmarketcap_mcp_server first to pick coinmarketcap (pro) vs coinmarketcap-public.',
			inputSchema: z.object({}).strict(),
			outputSchema: ListMcpServersDataSchema,
		},
		async () => wrapSdk(listMcpServers(config)),
	);

	server.registerTool(
		camelToSnake('resolveCoinmarketcapMcpServer'),
		{
			description:
				'When the operator asks for CoinMarketCap data, call this before agent_load_mcp_server. Checks COINMARKETCAP_API_KEY in Variables and which CMC servers are active: if the key is set and catalog coinmarketcap is active, returns serverId coinmarketcap (full pro MCP — prefer over coinmarketcap-public). Otherwise returns coinmarketcap-public when active. Use agentLoadMcpServer.serverId with agent_load_mcp_server for the current chat.',
			inputSchema: z.object({}).strict(),
			outputSchema: RESOLVE_COINMARKETCAP_MCP_SERVER_OUTPUT_SCHEMA,
		},
		async () => wrapSdk(resolveCoinMarketCapMcpServer(config)),
	);

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
}
