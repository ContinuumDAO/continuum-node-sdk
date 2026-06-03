import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	addMcpServer,
	getMcpServer,
	listBundledMcpServerTemplates,
	listMcpServers,
	removeMcpServer,
} from '../core/agent/mcp-servers.js';
import {
	AddMcpServerInputSchema,
	AgentMcpServerRowSchema,
	GetMcpServerQuerySchema,
	ListBundledMcpServerTemplatesDataSchema,
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

export function registerAgentMcpServerTools(
	server: McpServer,
	config: NodeSdkConfig,
): void {
	server.registerTool(
		camelToSnake('listMcpServers'),
		{
			description:
				'List MCP servers configured on this node (GET /listMcpServers): built-in defaults, user-added servers, and addableTemplates from the bundled catalog not yet present. Use addableTemplates to suggest add_mcp_server; check envConfigured and apiKeyEnvVar before enabling initialLoad.',
			inputSchema: z.object({}).strict(),
			outputSchema: ListMcpServersDataSchema,
		},
		async () => wrapSdk(listMcpServers(config)),
	);

	server.registerTool(
		camelToSnake('listBundledMcpServerTemplates'),
		{
			description:
				'List bundled optional MCP server templates shipped with mpc-config (same catalog as MCP_servers.json). Use with list_mcp_servers to find templates not yet on the node, then add_mcp_server.',
			inputSchema: z.object({}).strict(),
			outputSchema: ListBundledMcpServerTemplatesDataSchema,
		},
		async () => wrapSdk(Promise.resolve(listBundledMcpServerTemplates())),
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
				'Add or update a user MCP server (POST /addMcpServer, management-signed with preferred Ed25519 signer). Cannot use ids reserved by default servers (e.g. continuum). Prefer copying fields from list_mcp_servers addableTemplates or list_bundled_mcp_server_templates. Never pass inline apiKey — use apiKeyEnvVar (HTTP or optional STDIO) or envVars (STDIO) and set values via the node Variables store before initialLoad when required.',
			inputSchema: AddMcpServerInputSchema,
			outputSchema: ADD_MCP_SERVER_OUTPUT_SCHEMA,
		},
		async (input: z.infer<typeof AddMcpServerInputSchema>) =>
			wrapSdk(addMcpServer(config, input)),
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
