import type { McpServer } from "@modelcontextprotocol/server";
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	addSkill,
	addSkillFromCatalog,
	getSkill,
	listSkills,
	removeSkill,
	resetSkillFromDefaults,
	resetSkillsFromDefaults,
} from '../core/agent/skills.js';
import {
	AddSkillFromCatalogInputSchema,
	AddSkillInputSchema,
	AgentSkillDetailSchema,
	GetSkillQuerySchema,
	ListSkillsDataSchema,
	RemoveSkillInputSchema,
	ResetSkillFromDefaultsInputSchema,
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
	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		camelToSnake('listSkills'),
		{
			description:
				'List agent skills on this node (GET /listSkills): names, availableCatalog (repo defaults not installed), and defaultsSync (upgradeAvailable / userModified per bundled skill). Use availableCatalog with add_skill_from_catalog; use reset_skill_from_defaults for one-skill upgrade.',
			inputSchema: z.object({}).strict(),
			outputSchema: ListSkillsDataSchema,
		},
		async () => wrapSdk(listSkills(config)),
	);

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		camelToSnake('getSkill'),
		{
			description:
				'Get one agent skill by name (GET /getSkill): content, initialLoad, format, and bundled-default sync fields (defaultContent, upgradeAvailable, userModified, appliedAt). Compare content to defaultContent before reset_skill_from_defaults.',
			inputSchema: GetSkillQuerySchema,
			outputSchema: AgentSkillDetailSchema,
		},
		async (query: z.infer<typeof GetSkillQuerySchema>) =>
			wrapSdk(getSkill(config, query)),
	);

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
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

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		camelToSnake('addSkillFromCatalog'),
		{
			description:
				'Activate one bundled skill from the repository catalog (POST /addSkillFromCatalog, management-signed). Use list_skills availableCatalog for names. Prefer over add_skill for repo defaults; use reset_skill_from_defaults for one bundled skill upgrade or reset_skills_from_defaults for all defaults.',
			inputSchema: AddSkillFromCatalogInputSchema,
			outputSchema: ADD_SKILL_OUTPUT_SCHEMA,
		},
		async (input: z.infer<typeof AddSkillFromCatalogInputSchema>) =>
			wrapSdk(addSkillFromCatalog(config, input)),
	);

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
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

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
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

	server.registerTool(
		camelToSnake('resetSkillFromDefaults'),
		{
			description:
				'Reset one bundled default skill from agent_llm_config.defaults/Skills/ (POST /resetSkillFromDefaults, management-signed). Writes SKILL.md.meta.json sidecar. Overwrites that skill file; custom (non-catalog) skills are unchanged. Prefer when defaultsSync or get_skill shows upgradeAvailable for a single name.',
			inputSchema: ResetSkillFromDefaultsInputSchema,
			outputSchema: ADD_SKILL_OUTPUT_SCHEMA,
		},
		async (input: z.infer<typeof ResetSkillFromDefaultsInputSchema>) =>
			wrapSdk(resetSkillFromDefaults(config, input)),
	);
}
