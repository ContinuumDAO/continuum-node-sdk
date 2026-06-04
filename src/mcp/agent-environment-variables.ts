import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {addEnvironmentVariable} from '../core/agent/environment-variables.js';
import {
	AddEnvironmentVariableInputSchema,
	AgentEnvironmentVariableUpsertResultSchema,
	SelectedSigningKeySchema,
} from '../schemas/extended.js';
import {camelToSnake, wrapSdk} from './tool-utils.js';

const ADD_ENVIRONMENT_VARIABLE_OUTPUT_SCHEMA = z
	.object({
		variable: AgentEnvironmentVariableUpsertResultSchema,
		selectedSigningKey: SelectedSigningKeySchema.optional(),
		signingMessage: z.string(),
	})
	.strict();

export function registerAgentEnvironmentVariableTools(
	server: McpServer,
	config: NodeSdkConfig,
): void {
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
}
