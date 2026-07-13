import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	addEnvironmentVariable,
	listEnvironmentVariables,
	removeEnvironmentVariable,
} from '../core/agent/environment-variables.js';
import {
	AddEnvironmentVariableInputSchema,
	AgentEnvironmentVariableUpsertResultSchema,
	ListEnvironmentVariablesMcpDataSchema,
	RemoveEnvironmentVariableInputSchema,
	SelectedSigningKeySchema,
} from '../schemas/extended.js';
import {camelToSnake, sdkResultToCallToolResult, wrapSdk} from './tool-utils.js';

const ADD_ENVIRONMENT_VARIABLE_OUTPUT_SCHEMA = z
	.object({
		variable: AgentEnvironmentVariableUpsertResultSchema,
		selectedSigningKey: SelectedSigningKeySchema.optional(),
		signingMessage: z.string(),
	})
	.strict();

function toEnvironmentVariableSummaries(
	variables: Array<{
		name: string;
		value: string;
		updatedAt?: string;
		sensitive?: boolean;
	}>,
): z.infer<typeof ListEnvironmentVariablesMcpDataSchema> {
	return {
		variables: variables.map(v => ({
			name: v.name,
			configured: v.value.trim().length > 0,
			...(v.sensitive !== undefined ? {sensitive: v.sensitive} : {}),
			...(v.updatedAt ? {updatedAt: v.updatedAt} : {}),
		})),
	};
}

export function registerAgentEnvironmentVariableTools(
	server: McpServer,
	config: NodeSdkConfig,
): void {
	server.registerTool(
		camelToSnake('listEnvironmentVariables'),
		{
			description:
				'List agent Variables on this node (GET /listEnvironmentVariables). Returns each name and whether a non-empty value is configured — never returns secret values. Use before DeFi tools that need UNISWAP_API_KEY, THE_GRAPH_API_KEY (Uniswap V4 OHLCV), or MCP server apiKeyEnvVar secrets.',
			inputSchema: z.object({}).strict(),
			outputSchema: ListEnvironmentVariablesMcpDataSchema,
		},
		async () => {
			const result = await listEnvironmentVariables(config);
			if (!result.ok) {
				return sdkResultToCallToolResult(result);
			}
			const payload = toEnvironmentVariableSummaries(result.data.variables);
			return {
				content: [{type: 'text' as const, text: JSON.stringify(payload)}],
				structuredContent: payload,
			};
		},
	);

	server.registerTool(
		camelToSnake('addEnvironmentVariable'),
		{
			description:
				'Add or update one agent Variable on this node (POST /addEnvironmentVariable, management-signed with preferred Ed25519 signer). Use for MCP server secrets referenced by apiKeyEnvVar or envVars before enabling initialLoad. The tool response never includes the secret value — only the normalized name.',
			inputSchema: AddEnvironmentVariableInputSchema,
			outputSchema: ADD_ENVIRONMENT_VARIABLE_OUTPUT_SCHEMA,
		},
		async (input: z.infer<typeof AddEnvironmentVariableInputSchema>) =>
			wrapSdk(addEnvironmentVariable(config, input)),
	);

	server.registerTool(
		camelToSnake('removeEnvironmentVariable'),
		{
			description:
				'Remove one agent Variable on this node (POST /removeEnvironmentVariable, management-signed).',
			inputSchema: RemoveEnvironmentVariableInputSchema,
			outputSchema: z
				.object({
					message: z.string(),
					selectedSigningKey: SelectedSigningKeySchema.optional(),
					signingMessage: z.string(),
				})
				.strict(),
		},
		async (input: z.infer<typeof RemoveEnvironmentVariableInputSchema>) =>
			wrapSdk(removeEnvironmentVariable(config, input)),
	);
}
