import type {NodeSdkConfig} from '../../config/schema.js';
import {
	buildManagementQueryPath,
	managementGet,
	managementPost,
} from '../../api/management-api.js';
import {
	AGENT_SKILLS_API_PATHS,
	AddSkillInputSchema,
	AgentSkillDetailSchema,
	AgentSkillFormatSchema,
	DEFAULT_MANAGEMENT_SIGNING,
	GetSkillQuerySchema,
	ListSkillsDataSchema,
	RemoveSkillInputSchema,
	ResetSkillsFromDefaultsResultSchema,
	type AddSkillInput,
	type ManagementSigningMethod,
} from '../../schemas/extended.js';
import type {SdkResult} from '../result.js';
import {
	buildManagementPostRequest,
	managementSign,
	toSelectedSigner,
	type BuiltManagementPostRequest,
} from '../management-signer.js';
import {z} from 'zod';

export type AgentSkillDetail = z.infer<typeof AgentSkillDetailSchema>;
export type AgentSkillFormat = z.infer<typeof AgentSkillFormatSchema>;

const SKILL_NAME_RE = /^[a-z][a-z0-9_-]*$/;
const SKILL_MAX_CONTENT_BYTES = 512_000;

export function normalizeSkillName(raw: string): string {
	return raw
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_-]/g, '-')
		.replace(/^-+/, '')
		.replace(/-+/g, '-');
}

export function validateSkillName(name: string): string | null {
	const normalized = normalizeSkillName(name);
	if (!normalized) {
		return 'Skill name is required.';
	}
	if (normalized.length > 64) {
		return 'Skill name must be at most 64 characters.';
	}
	if (!SKILL_NAME_RE.test(normalized)) {
		return 'Skill name must start with a-z and use only a-z, 0-9, hyphen, and underscore.';
	}
	return null;
}

function normalizeSkillFormat(raw: unknown): AgentSkillFormat {
	const format = String(raw ?? 'md')
		.trim()
		.toLowerCase();
	if (format === 'txt' || format === 'text') {
		return 'txt';
	}
	return 'md';
}

function validateSkillContent(content: string): string | null {
	if (!content.trim()) {
		return 'Skill content is required.';
	}
	const bytes = new TextEncoder().encode(content).length;
	if (bytes > SKILL_MAX_CONTENT_BYTES) {
		return `Skill content exceeds maximum size (${SKILL_MAX_CONTENT_BYTES} bytes).`;
	}
	return null;
}

function parseSkillDetail(raw: unknown): AgentSkillDetail | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return null;
	}
	const o = raw as Record<string, unknown>;
	const parsed = AgentSkillDetailSchema.safeParse({
		name: String(o.name ?? o.Name ?? '').trim(),
		content: String(o.content ?? o.Content ?? ''),
		initialLoad: Boolean(o.initialLoad ?? o.InitialLoad),
		format: normalizeSkillFormat(o.format ?? o.Format),
		updatedAt: String(o.updatedAt ?? o.UpdatedAt ?? '').trim() || undefined,
	});
	return parsed.success && parsed.data.name ? parsed.data : null;
}

function buildAddSkillBodyFields(input: AddSkillInput): Record<string, unknown> {
	const fields: Record<string, unknown> = {
		name: normalizeSkillName(input.name),
		content: input.content,
		initialLoad: input.initialLoad,
	};
	if (input.format != null) {
		fields.format = input.format;
	}
	return fields;
}

/** GET /listSkills — agent skill names only (no file content). */
export async function listSkills(
	config: NodeSdkConfig,
): Promise<SdkResult<z.infer<typeof ListSkillsDataSchema>>> {
	const result = await managementGet<unknown>(config, AGENT_SKILLS_API_PATHS.list);
	if (!result.ok) {
		return result;
	}
	const data =
		result.data && typeof result.data === 'object' && !Array.isArray(result.data)
			? (result.data as Record<string, unknown>)
			: {};
	const namesRaw = data.names ?? data.Names;
	const names = Array.isArray(namesRaw)
		? namesRaw.map(n => String(n).trim()).filter(Boolean)
		: [];
	const parsed = ListSkillsDataSchema.safeParse({names});
	if (!parsed.success) {
		return {ok: false, reason: 'Skill list response failed validation.'};
	}
	return {ok: true, data: parsed.data};
}

/** GET /getSkill — one skill file by name. */
export async function getSkill(
	config: NodeSdkConfig,
	query: z.infer<typeof GetSkillQuerySchema>,
): Promise<SdkResult<AgentSkillDetail>> {
	const parsedQuery = GetSkillQuerySchema.safeParse(query);
	if (!parsedQuery.success) {
		return {ok: false, reason: 'Invalid skill name.'};
	}
	const nameErr = validateSkillName(parsedQuery.data.name);
	if (nameErr) {
		return {ok: false, reason: nameErr};
	}
	const name = normalizeSkillName(parsedQuery.data.name);
	const path = buildManagementQueryPath(AGENT_SKILLS_API_PATHS.get, {name});
	const result = await managementGet<unknown>(config, path);
	if (!result.ok) {
		return result;
	}
	const skill = parseSkillDetail(result.data);
	if (!skill) {
		return {ok: false, reason: 'Skill response failed validation.'};
	}
	return {ok: true, data: skill};
}

export async function buildAddSkill(
	config: NodeSdkConfig,
	input: AddSkillInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = AddSkillInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid add skill input.'};
	}
	const nameErr = validateSkillName(parsed.data.name);
	if (nameErr) {
		return {ok: false, reason: nameErr};
	}
	const contentErr = validateSkillContent(parsed.data.content);
	if (contentErr) {
		return {ok: false, reason: contentErr};
	}
	return buildManagementPostRequest(
		config,
		{
			path: AGENT_SKILLS_API_PATHS.add,
			buildRequestFields: () => buildAddSkillBodyFields(parsed.data),
		},
		signing,
	);
}

export async function addSkill(
	config: NodeSdkConfig,
	input: AddSkillInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		skill: AgentSkillDetail;
		selectedSigningKey?: ReturnType<typeof toSelectedSigner>;
		signingMessage: string;
	}>
> {
	const built = await buildAddSkill(config, input, signing);
	if (!built.ok) {
		return built;
	}
	const signed = await managementSign(config, signing, built.data.unsignedBody);
	if (!signed.ok) {
		return signed;
	}
	const posted = await managementPost<unknown>(
		config,
		built.data.path,
		signed.data,
	);
	if (!posted.ok) {
		return posted;
	}
	const skill = parseSkillDetail(posted.data);
	if (!skill) {
		return {ok: false, reason: 'Add skill response failed validation.'};
	}
	return {
		ok: true,
		data: {
			skill,
			selectedSigningKey: built.data.selectedSigningKey
				? toSelectedSigner(built.data.selectedSigningKey)
				: undefined,
			signingMessage: built.data.canonicalJson,
		},
	};
}

export async function buildRemoveSkill(
	config: NodeSdkConfig,
	input: z.infer<typeof RemoveSkillInputSchema>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = RemoveSkillInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid remove skill input.'};
	}
	const nameErr = validateSkillName(parsed.data.name);
	if (nameErr) {
		return {ok: false, reason: nameErr};
	}
	return buildManagementPostRequest(
		config,
		{
			path: AGENT_SKILLS_API_PATHS.remove,
			buildRequestFields: () => ({
				name: normalizeSkillName(parsed.data.name),
			}),
		},
		signing,
	);
}

export async function removeSkill(
	config: NodeSdkConfig,
	input: z.infer<typeof RemoveSkillInputSchema>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		message: string;
		selectedSigningKey?: ReturnType<typeof toSelectedSigner>;
		signingMessage: string;
	}>
> {
	const built = await buildRemoveSkill(config, input, signing);
	if (!built.ok) {
		return built;
	}
	const signed = await managementSign(config, signing, built.data.unsignedBody);
	if (!signed.ok) {
		return signed;
	}
	const posted = await managementPost<string>(
		config,
		built.data.path,
		signed.data,
	);
	if (!posted.ok) {
		return posted;
	}
	return {
		ok: true,
		data: {
			message:
				typeof posted.data === 'string' && posted.data.trim()
					? posted.data
					: 'Skill removed',
			selectedSigningKey: built.data.selectedSigningKey
				? toSelectedSigner(built.data.selectedSigningKey)
				: undefined,
			signingMessage: built.data.canonicalJson,
		},
	};
}

export async function buildResetSkillsFromDefaults(
	config: NodeSdkConfig,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	return buildManagementPostRequest(
		config,
		{
			path: AGENT_SKILLS_API_PATHS.resetFromDefaults,
			buildRequestFields: () => ({}),
		},
		signing,
	);
}

export async function resetSkillsFromDefaults(
	config: NodeSdkConfig,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		skillCount: number;
		selectedSigningKey?: ReturnType<typeof toSelectedSigner>;
		signingMessage: string;
	}>
> {
	const built = await buildResetSkillsFromDefaults(config, signing);
	if (!built.ok) {
		return built;
	}
	const signed = await managementSign(config, signing, built.data.unsignedBody);
	if (!signed.ok) {
		return signed;
	}
	const posted = await managementPost<unknown>(
		config,
		built.data.path,
		signed.data,
	);
	if (!posted.ok) {
		return posted;
	}
	const raw =
		posted.data && typeof posted.data === 'object' && !Array.isArray(posted.data)
			? (posted.data as Record<string, unknown>)
			: {};
	const parsed = ResetSkillsFromDefaultsResultSchema.safeParse({
		skillCount: raw.skillCount ?? raw.SkillCount,
	});
	if (!parsed.success) {
		return {ok: false, reason: 'Reset skills response failed validation.'};
	}
	return {
		ok: true,
		data: {
			skillCount: parsed.data.skillCount,
			selectedSigningKey: built.data.selectedSigningKey
				? toSelectedSigner(built.data.selectedSigningKey)
				: undefined,
			signingMessage: built.data.canonicalJson,
		},
	};
}
