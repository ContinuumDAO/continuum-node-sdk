import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {addSkill, getSkill, listSkills, removeSkill, resetSkillsFromDefaults} from '../core/agent/skills.js';
import {
	AddSkillInputSchema,
	AgentSkillDetailSchema,
	GetSkillQuerySchema,
	ListSkillsDataSchema,
	RemoveSkillInputSchema,
	SelectedSigningKeySchema,
} from '../schemas/extended.js';
import {camelToSnake, wrapSdk} from './tool-utils.js';

const ADD_SKILL_OUTPUT_SCHEMA = z
	.object({
		skill: AgentSkillDetailSchema,
		selectedSigningKey: SelectedSigningKeySchema.optional(),
		signingMessage: z.string(),
	})
	.strict();

const REMOVE_SKILL_OUTPUT_SCHEMA = z
	.object({
		message: z.string(),
		selectedSigningKey: SelectedSigningKeySchema.optional(),
		signingMessage: z.string(),
	})
	.strict();

const RESET_SKILLS_OUTPUT_SCHEMA = z
	.object({
		skillCount: z.number().int().nonnegative(),
		selectedSigningKey: SelectedSigningKeySchema.optional(),
		signingMessage: z.string(),
	})
	.strict();

export function registerAgentSkillTools(
	server: McpServer,
	config: NodeSdkConfig,
): void {
	server.registerTool(
		camelToSnake('listSkills'),
		{
			description:
				'List agent skill names (GET /listSkills). Skills live under agent_llm_config/Skills/; content is not included.',
			inputSchema: z.object({}).strict(),
			outputSchema: ListSkillsDataSchema,
		},
		async () => wrapSdk(listSkills(config)),
	);

	server.registerTool(
		camelToSnake('getSkill'),
		{
			description:
				'Get one agent skill by name (GET /getSkill), including file content, initialLoad flag, and format (md or txt).',
			inputSchema: GetSkillQuerySchema,
			outputSchema: AgentSkillDetailSchema,
		},
		async (query: z.infer<typeof GetSkillQuerySchema>) =>
			wrapSdk(getSkill(config, query)),
	);

	server.registerTool(
		camelToSnake('addSkill'),
		{
			description:
				'Add or update an agent skill file (POST /addSkill, management-signed with preferred Ed25519 signer). Upserts skills.json manifest and the skill file. initialLoad true injects content as a system message at chat startup; false lets the agent load it via agent_load_skill. Max content 512 KiB.',
			inputSchema: AddSkillInputSchema,
			outputSchema: ADD_SKILL_OUTPUT_SCHEMA,
		},
		async (input: z.infer<typeof AddSkillInputSchema>) =>
			wrapSdk(addSkill(config, input)),
	);

	server.registerTool(
		camelToSnake('removeSkill'),
		{
			description:
				'Remove an agent skill by name (POST /removeSkill). Deletes the manifest entry and skill file.',
			inputSchema: RemoveSkillInputSchema,
			outputSchema: REMOVE_SKILL_OUTPUT_SCHEMA,
		},
		async (input: z.infer<typeof RemoveSkillInputSchema>) =>
			wrapSdk(removeSkill(config, input)),
	);

	server.registerTool(
		camelToSnake('resetSkillsFromDefaults'),
		{
			description:
				'Overwrite bundled default agent skills from agent_llm_config.defaults/Skills/ (POST /resetSkillsFromDefaults, management-signed). Updates default skill files and manifest entries; custom skills not in the defaults catalog are preserved.',
			inputSchema: z.object({}).strict(),
			outputSchema: RESET_SKILLS_OUTPUT_SCHEMA,
		},
		async () => wrapSdk(resetSkillsFromDefaults(config)),
	);
}
