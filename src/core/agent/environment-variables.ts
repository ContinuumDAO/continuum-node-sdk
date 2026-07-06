import {
	buildManagementQueryPath,
	managementGet,
	managementPost,
} from '../../api/management-api.js';
import type {NodeSdkConfig} from '../../config/schema.js';
import {
	AGENT_ENVIRONMENT_API_PATHS,
	AddEnvironmentVariableInputSchema,
	AgentEnvironmentVariableSchema,
	AgentEnvironmentVariableUpsertResultSchema,
	GetEnvironmentVariableQuerySchema,
	ListEnvironmentVariablesDataSchema,
	RemoveEnvironmentVariableInputSchema,
	DEFAULT_MANAGEMENT_SIGNING,
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

export type AgentEnvironmentVariable = z.infer<
	typeof AgentEnvironmentVariableSchema
>;

const ENVIRONMENT_VARIABLE_NAME_RE = /^[A-Z][A-Z0-9_]*$/;

export function normalizeAgentEnvironmentVariableName(raw: string): string {
	return raw.trim().toUpperCase();
}

export function validateAgentEnvironmentVariableName(name: string): string | null {
	const normalized = normalizeAgentEnvironmentVariableName(name);
	if (!normalized) {
		return 'Environment variable name is required.';
	}
	if (normalized.length > 128) {
		return 'Environment variable name must be at most 128 characters.';
	}
	if (!ENVIRONMENT_VARIABLE_NAME_RE.test(normalized)) {
		return 'Environment variable name must start with A-Z and contain only A-Z, 0-9, and underscore.';
	}
	return null;
}

function normalizeEnvironmentVariableRow(
	raw: unknown,
): AgentEnvironmentVariable | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return null;
	}
	const row = raw as Record<string, unknown>;
	const parsed = AgentEnvironmentVariableSchema.safeParse({
		name: String(row.name ?? row.Name ?? '').trim(),
		value: String(row.value ?? row.Value ?? ''),
		updatedAt:
			String(row.updatedAt ?? row.UpdatedAt ?? '').trim() || undefined,
		sensitive: Boolean(row.sensitive ?? row.Sensitive),
	});
	return parsed.success ? parsed.data : null;
}

function toUpsertResult(
	row: AgentEnvironmentVariable | null,
	fallbackName: string,
): z.infer<typeof AgentEnvironmentVariableUpsertResultSchema> | null {
	const name = row?.name ?? fallbackName;
	if (!name) {
		return null;
	}
	const parsed = AgentEnvironmentVariableUpsertResultSchema.safeParse({
		name,
		updatedAt: row?.updatedAt,
		sensitive: row?.sensitive,
	});
	return parsed.success ? parsed.data : null;
}

/** GET /getEnvironmentVariable — one agent env var stored on this node. */
export async function getEnvironmentVariable(
	config: NodeSdkConfig,
	query: z.infer<typeof GetEnvironmentVariableQuerySchema>,
): Promise<SdkResult<AgentEnvironmentVariable>> {
	const parsedQuery = GetEnvironmentVariableQuerySchema.safeParse(query);
	if (!parsedQuery.success) {
		return {ok: false, reason: 'Invalid environment variable name.'};
	}

	const nameErr = validateAgentEnvironmentVariableName(parsedQuery.data.name);
	if (nameErr) {
		return {ok: false, reason: nameErr};
	}

	const name = normalizeAgentEnvironmentVariableName(parsedQuery.data.name);
	const path = buildManagementQueryPath(AGENT_ENVIRONMENT_API_PATHS.get, {
		name,
	});
	const result = await managementGet<unknown>(config, path);
	if (!result.ok) {
		return result;
	}

	const row = normalizeEnvironmentVariableRow(result.data);
	if (!row) {
		return {
			ok: false,
			reason: 'Environment variable response failed validation.',
		};
	}
	return {ok: true, data: row};
}

/** GET /listEnvironmentVariables — all agent env vars stored on this node. */
export async function listEnvironmentVariables(
	config: NodeSdkConfig,
): Promise<SdkResult<{variables: AgentEnvironmentVariable[]}>> {
	const result = await managementGet<unknown>(
		config,
		AGENT_ENVIRONMENT_API_PATHS.list,
	);
	if (!result.ok) {
		return result;
	}

	const data =
		result.data && typeof result.data === 'object' && !Array.isArray(result.data)
			? (result.data as Record<string, unknown>)
			: {variables: result.data};
	const listRaw = data.variables ?? data.Variables;
	const variables: AgentEnvironmentVariable[] = [];
	if (Array.isArray(listRaw)) {
		for (const item of listRaw) {
			const row = normalizeEnvironmentVariableRow(item);
			if (row) {
				variables.push(row);
			}
		}
	}

	const parsed = ListEnvironmentVariablesDataSchema.safeParse({variables});
	if (!parsed.success) {
		return {
			ok: false,
			reason: 'Environment variable list response failed validation.',
		};
	}
	return {ok: true, data: parsed.data};
}

export async function buildAddEnvironmentVariable(
	config: NodeSdkConfig,
	input: z.infer<typeof AddEnvironmentVariableInputSchema>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = AddEnvironmentVariableInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid add environment variable input.'};
	}
	const nameErr = validateAgentEnvironmentVariableName(parsed.data.name);
	if (nameErr) {
		return {ok: false, reason: nameErr};
	}
	const name = normalizeAgentEnvironmentVariableName(parsed.data.name);
	return buildManagementPostRequest(
		config,
		{
			path: AGENT_ENVIRONMENT_API_PATHS.add,
			buildRequestFields: () => ({
				name,
				value: parsed.data.value,
			}),
		},
		signing,
	);
}

/** POST /addEnvironmentVariable — upsert one agent Variable (MCP output omits value). */
export async function addEnvironmentVariable(
	config: NodeSdkConfig,
	input: z.infer<typeof AddEnvironmentVariableInputSchema>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		variable: z.infer<typeof AgentEnvironmentVariableUpsertResultSchema>;
		selectedSigningKey?: ReturnType<typeof toSelectedSigner>;
		signingMessage: string;
	}>
> {
	const built = await buildAddEnvironmentVariable(config, input, signing);
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
	const row = normalizeEnvironmentVariableRow(posted.data);
	const name = normalizeAgentEnvironmentVariableName(
		AddEnvironmentVariableInputSchema.parse(input).name,
	);
	const variable = toUpsertResult(row, name);
	if (!variable) {
		return {
			ok: false,
			reason: 'Add environment variable response failed validation.',
		};
	}
	return {
		ok: true,
		data: {
			variable,
			selectedSigningKey: built.data.selectedSigningKey
				? toSelectedSigner(built.data.selectedSigningKey)
				: undefined,
			signingMessage: built.data.canonicalJson,
		},
	};
}

export async function buildRemoveEnvironmentVariable(
	config: NodeSdkConfig,
	input: z.infer<typeof RemoveEnvironmentVariableInputSchema>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = RemoveEnvironmentVariableInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid remove environment variable input.'};
	}
	const nameErr = validateAgentEnvironmentVariableName(parsed.data.name);
	if (nameErr) {
		return {ok: false, reason: nameErr};
	}
	const name = normalizeAgentEnvironmentVariableName(parsed.data.name);
	return buildManagementPostRequest(
		config,
		{
			path: AGENT_ENVIRONMENT_API_PATHS.remove,
			buildRequestFields: () => ({name}),
		},
		signing,
	);
}

/** POST /removeEnvironmentVariable */
export async function removeEnvironmentVariable(
	config: NodeSdkConfig,
	input: z.infer<typeof RemoveEnvironmentVariableInputSchema>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		message: string;
		selectedSigningKey?: ReturnType<typeof toSelectedSigner>;
		signingMessage: string;
	}>
> {
	const built = await buildRemoveEnvironmentVariable(config, input, signing);
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
	const message =
		typeof posted.data === 'string' && posted.data.trim()
			? posted.data
			: 'Environment variable removed';
	return {
		ok: true,
		data: {
			message,
			selectedSigningKey: built.data.selectedSigningKey
				? toSelectedSigner(built.data.selectedSigningKey)
				: undefined,
			signingMessage: built.data.canonicalJson,
		},
	};
}
