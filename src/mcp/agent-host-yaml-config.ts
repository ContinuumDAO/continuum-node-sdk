import type {McpServer} from '@modelcontextprotocol/server';
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	getHostYamlConfig,
	resetHostYamlFromDefaults,
	upsertHostYamlConfig,
} from '../core/agent/host-yaml-config.js';
import {
	GetHostYamlConfigQuerySchema,
	HostYamlConfigDetailSchema,
	ResetHostYamlFromDefaultsInputSchema,
	SelectedSigningKeySchema,
	UpsertHostYamlConfigInputSchema,
} from '../schemas/extended.js';
import {camelToSnake, wrapSdk} from './tool-utils.js';

const HOST_YAML_MUTATION_OUTPUT_SCHEMA = z
	.object({
		config: HostYamlConfigDetailSchema,
		selectedSigningKey: SelectedSigningKeySchema.optional(),
		signingMessage: z.string(),
	})
	.strict();

export function registerAgentHostYamlConfigTools(
	server: McpServer,
	config: NodeSdkConfig,
): void {
	server.registerTool(
		camelToSnake('getHostYamlConfig'),
		{
			description:
				'Get one host YAML file by kind (GET /getHostYamlConfig). Kinds: trade-desk, orchestration-plan, agent-intent-rules, cron-trade, continuum-dao-vote-policy. Returns content, defaultContent, upgradeAvailable, userModified, and sidecar metadata (same upgrade model as bundled skills).',
			inputSchema: GetHostYamlConfigQuerySchema,
			outputSchema: HostYamlConfigDetailSchema,
		},
		async (query: z.infer<typeof GetHostYamlConfigQuerySchema>) =>
			wrapSdk(getHostYamlConfig(config, query)),
	);

	server.registerTool(
		camelToSnake('upsertHostYamlConfig'),
		{
			description:
				'Write host YAML after node validation (POST /upsertHostYamlConfig, management-signed). Preserves submitted bytes. Use get_host_yaml_config first; when upgradeAvailable is true, back up content then reset_host_yaml_from_defaults before re-applying edits.',
			inputSchema: UpsertHostYamlConfigInputSchema,
			outputSchema: HOST_YAML_MUTATION_OUTPUT_SCHEMA,
		},
		async (input: z.infer<typeof UpsertHostYamlConfigInputSchema>) =>
			wrapSdk(upsertHostYamlConfig(config, input)),
	);

	server.registerTool(
		camelToSnake('resetHostYamlFromDefaults'),
		{
			description:
				'Install or reset one host YAML file from agent_llm_config.defaults/ (POST /resetHostYamlFromDefaults, management-signed). Writes {filename}.meta.json sidecar. Overwrites operator content for that kind — re-apply custom edits via upsert_host_yaml_config afterward.',
			inputSchema: ResetHostYamlFromDefaultsInputSchema,
			outputSchema: HOST_YAML_MUTATION_OUTPUT_SCHEMA,
		},
		async (input: z.infer<typeof ResetHostYamlFromDefaultsInputSchema>) =>
			wrapSdk(resetHostYamlFromDefaults(config, input)),
	);
}
