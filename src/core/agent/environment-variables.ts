import {
	buildManagementQueryPath,
	managementGet,
} from '../../api/management-api.js';
import type {NodeSdkConfig} from '../../config/schema.js';
import {
	AGENT_ENVIRONMENT_API_PATHS,
	AgentEnvironmentVariableSchema,
	GetEnvironmentVariableQuerySchema,
	ListEnvironmentVariablesDataSchema,
} from '../../schemas/extended.js';
import type {SdkResult} from '../result.js';
import {z} from 'zod';

export type AgentEnvironmentVariable = z.infer<
	typeof AgentEnvironmentVariableSchema
>;

function normalizeEnvironmentVariableName(name: string): string {
	return name.trim().toUpperCase();
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

	const name = normalizeEnvironmentVariableName(parsedQuery.data.name);
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
