import type {NodeSdkConfig} from '../../config/schema.js';
import {
	buildManagementQueryPath,
	managementGet,
	managementPost,
} from '../../api/management-api.js';
import {
	AGENT_MCP_API_PATHS,
	AddMcpServerFromCatalogInputSchema,
	AddMcpServerInputSchema,
	AgentMcpRuntimeSpecSchema,
	AgentMcpServerRowSchema,
	AgentMcpTransportSchema,
	GetMcpServerQuerySchema,
	ListMcpServersDataSchema,
	RemoveMcpServerInputSchema,
	SetMcpServerFlagsInputSchema,
	type AddMcpServerFromCatalogInput,
	type AddMcpServerInput,
	type ManagementSigningMethod,
	type SetMcpServerFlagsInput,
	DEFAULT_MANAGEMENT_SIGNING,
} from '../../schemas/extended.js';
import type {SdkResult} from '../result.js';
import {
	buildManagementPostRequest,
	managementSign,
	toSelectedSigner,
	type BuiltManagementPostRequest,
} from '../management-signer.js';
import {z} from 'zod';

export type AgentMcpServerRow = z.infer<typeof AgentMcpServerRowSchema>;
export type ListMcpServersData = z.infer<typeof ListMcpServersDataSchema>;

const MCP_SERVER_ID_RE = /^[a-z][a-z0-9_-]*$/;

export function normalizeAgentMcpServerId(raw: string): string {
	return raw
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_-]/g, '-')
		.replace(/^-+/, '')
		.replace(/-+/g, '-');
}

export function validateAgentMcpServerId(id: string): string | null {
	const normalized = normalizeAgentMcpServerId(id);
	if (!normalized) {
		return 'MCP server id is required.';
	}
	if (normalized.length > 64) {
		return 'MCP server id must be at most 64 characters.';
	}
	if (!MCP_SERVER_ID_RE.test(normalized)) {
		return 'MCP server id must start with a-z and use only a-z, 0-9, hyphen, and underscore.';
	}
	return null;
}

function parseTransport(
	raw: unknown,
	command?: string,
): z.infer<typeof AgentMcpTransportSchema> {
	const t = String(raw ?? '').trim().toLowerCase();
	if (t === 'stdio' || command) {
		return 'stdio';
	}
	return 'http';
}

function parseMcpServerRow(raw: unknown): AgentMcpServerRow | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return null;
	}
	const o = raw as Record<string, unknown>;
	const id = String(o.id ?? o.Id ?? '').trim();
	if (!id) {
		return null;
	}
	const command = String(o.command ?? o.Command ?? '').trim() || undefined;
	const argsRaw = o.args ?? o.Args;
	const args = Array.isArray(argsRaw)
		? argsRaw.map(a => String(a).trim()).filter(Boolean)
		: undefined;
	const sourceRaw = String(o.source ?? o.Source ?? 'user').trim().toLowerCase();
	const source =
		sourceRaw === 'default'
			? 'default'
			: sourceRaw === 'catalog'
				? 'catalog'
				: 'user';
	const envVarsRaw = o.envVars ?? o.EnvVars;
	const envVars = Array.isArray(envVarsRaw)
		? envVarsRaw.map((v: unknown) => String(v).trim()).filter(Boolean)
		: undefined;
	const runtimeRaw = o.runtime ?? o.Runtime;
	const runtimeParsed = AgentMcpRuntimeSpecSchema.safeParse(runtimeRaw);
	const runtime = runtimeParsed.success ? runtimeParsed.data : undefined;
	const setupUrlRaw = String(o.setupUrl ?? o.SetupUrl ?? '').trim();
	const parsed = AgentMcpServerRowSchema.safeParse({
		id,
		displayName: String(o.displayName ?? o.DisplayName ?? id).trim(),
		transport: parseTransport(o.transport ?? o.Transport, command),
		url: String(o.url ?? o.URL ?? '').trim() || undefined,
		command,
		args: args?.length ? args : undefined,
		envVars: envVars?.length ? envVars : undefined,
		useUserFolder: Boolean(o.useUserFolder ?? o.UseUserFolder),
		runtime,
		setupUrl: setupUrlRaw || undefined,
		apiKeyEnvVar: String(o.apiKeyEnvVar ?? o.APIKeyEnvVar ?? '').trim() || undefined,
		apiKeyHeader: String(o.apiKeyHeader ?? o.APIKeyHeader ?? '').trim() || undefined,
		apiKeyPresent: Boolean(o.apiKeyPresent ?? o.APIKeyPresent),
		apiKeyMasked: String(o.apiKeyMasked ?? o.APIKeyMasked ?? '').trim() || undefined,
		envConfigured: Boolean(o.envConfigured ?? o.EnvConfigured),
		initialLoad: Boolean(o.initialLoad ?? o.InitialLoad),
		aiReady: Boolean(o.aiReady ?? o.AiReady),
		builtin: Boolean(o.builtin ?? o.Builtin),
		source,
		removable: Boolean(o.removable ?? o.Removable),
		updatedAt: String(o.updatedAt ?? o.UpdatedAt ?? '').trim() || undefined,
	});
	return parsed.success ? parsed.data : null;
}

function parseMcpServerRows(raw: unknown): AgentMcpServerRow[] {
	if (!Array.isArray(raw)) {
		return [];
	}
	const out: AgentMcpServerRow[] = [];
	for (const item of raw) {
		const row = parseMcpServerRow(item);
		if (row) {
			out.push(row);
		}
	}
	return out;
}

/** Map GET /listMcpServers availableCatalog rows to add_mcp_server-shaped templates. */
function catalogRowsToAddableTemplates(
	rows: AgentMcpServerRow[],
): AddMcpServerInput[] {
	const out: AddMcpServerInput[] = [];
	for (const row of rows) {
		if (row.transport === 'http') {
			if (!row.url?.trim()) {
				continue;
			}
			out.push({
				id: row.id,
				displayName: row.displayName,
				transport: 'http',
				url: row.url,
				apiKeyEnvVar: row.apiKeyEnvVar,
				apiKeyHeader: row.apiKeyHeader,
				initialLoad: row.initialLoad,
				aiReady: row.aiReady,
			});
			continue;
		}
		if (!row.command?.trim()) {
			continue;
		}
		out.push({
			id: row.id,
			displayName: row.displayName,
			transport: 'stdio',
			command: row.command,
			args: row.args,
			apiKeyEnvVar: row.apiKeyEnvVar,
			envVars: row.envVars,
			useUserFolder: row.useUserFolder,
			runtime: row.runtime,
			initialLoad: row.initialLoad,
			aiReady: row.aiReady,
		});
	}
	return out;
}

/** POST /addMcpServer body. Prefer apiKeyEnvVar / envVars (Variables); never inline apiKey — agent must not see secret values. */
function buildAddMcpServerBodyFields(
	input: AddMcpServerInput,
): Record<string, unknown> {
	const id = normalizeAgentMcpServerId(input.id);
	const body: Record<string, unknown> = {
		id,
		displayName: input.displayName.trim(),
		transport: input.transport,
		initialLoad: input.initialLoad ?? false,
	};
	if (input.aiReady) {
		body.aiReady = true;
	}
	if (input.transport === 'stdio') {
		body.command = input.command.trim();
		if (input.args?.length) {
			body.args = input.args.map(a => a.trim()).filter(Boolean);
		}
		if (input.envVars?.length) {
			body.envVars = input.envVars.map(v => v.trim()).filter(Boolean);
		}
		if (input.apiKeyEnvVar?.trim()) {
			body.apiKeyEnvVar = input.apiKeyEnvVar.trim();
		}
		if (input.useUserFolder) {
			body.useUserFolder = true;
		}
		if (input.runtime) {
			body.runtime = input.runtime;
		}
	} else {
		body.url = input.url.trim();
		if (input.apiKeyEnvVar?.trim()) {
			body.apiKeyEnvVar = input.apiKeyEnvVar.trim();
		}
		if (input.apiKeyHeader?.trim()) {
			body.apiKeyHeader = input.apiKeyHeader.trim();
		}
	}
	return body;
}

/** GET /listMcpServers — active servers plus availableCatalog from mpc-config agent_llm_config.defaults/MCP_servers.json. */
export async function listMcpServers(
	config: NodeSdkConfig,
): Promise<SdkResult<ListMcpServersData>> {
	const result = await managementGet<unknown>(config, AGENT_MCP_API_PATHS.list);
	if (!result.ok) {
		return result;
	}
	const data =
		result.data && typeof result.data === 'object' && !Array.isArray(result.data)
			? (result.data as Record<string, unknown>)
			: {};
	const defaultServers = parseMcpServerRows(
		data.defaultServers ?? data.DefaultServers,
	);
	const userServers = parseMcpServerRows(data.userServers ?? data.UserServers);
	const activeServers = parseMcpServerRows(
		data.activeServers ?? data.ActiveServers,
	);
	const availableCatalog = parseMcpServerRows(
		data.availableCatalog ?? data.AvailableCatalog,
	);
	const servers = parseMcpServerRows(data.servers ?? data.Servers);
	const merged =
		activeServers.length > 0
			? activeServers
			: servers.length > 0
				? servers
				: [...defaultServers, ...userServers];
	const payload = {
		activeServers: activeServers.length > 0 ? activeServers : merged,
		availableCatalog,
		defaultServers,
		userServers,
		servers: merged,
		addableTemplates: catalogRowsToAddableTemplates(availableCatalog),
	};
	const parsed = ListMcpServersDataSchema.safeParse(payload);
	if (!parsed.success) {
		return {ok: false, reason: 'MCP server list response failed validation.'};
	}
	return {ok: true, data: parsed.data};
}

/** GET /getMcpServer?id= */
export async function getMcpServer(
	config: NodeSdkConfig,
	query: z.infer<typeof GetMcpServerQuerySchema>,
): Promise<SdkResult<AgentMcpServerRow>> {
	const parsedQuery = GetMcpServerQuerySchema.safeParse(query);
	if (!parsedQuery.success) {
		return {ok: false, reason: 'Invalid MCP server id.'};
	}
	const idErr = validateAgentMcpServerId(parsedQuery.data.id);
	if (idErr) {
		return {ok: false, reason: idErr};
	}
	const id = normalizeAgentMcpServerId(parsedQuery.data.id);
	const path = buildManagementQueryPath(AGENT_MCP_API_PATHS.get, {id});
	const result = await managementGet<unknown>(config, path);
	if (!result.ok) {
		return result;
	}
	const row = parseMcpServerRow(result.data);
	if (!row) {
		return {ok: false, reason: 'MCP server response failed validation.'};
	}
	return {ok: true, data: row};
}

export async function buildAddMcpServer(
	config: NodeSdkConfig,
	input: AddMcpServerInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = AddMcpServerInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid add MCP server input.'};
	}
	const idErr = validateAgentMcpServerId(parsed.data.id);
	if (idErr) {
		return {ok: false, reason: idErr};
	}
	if (normalizeAgentMcpServerId(parsed.data.id) === 'continuum') {
		return {
			ok: false,
			reason: 'id "continuum" is reserved for the builtin MCP server.',
		};
	}
	return buildManagementPostRequest(
		config,
		{
			path: AGENT_MCP_API_PATHS.add,
			buildRequestFields: () => buildAddMcpServerBodyFields(parsed.data),
		},
		signing,
	);
}

export async function addMcpServer(
	config: NodeSdkConfig,
	input: AddMcpServerInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		server: AgentMcpServerRow;
		selectedSigningKey?: ReturnType<typeof toSelectedSigner>;
		signingMessage: string;
	}>
> {
	const built = await buildAddMcpServer(config, input, signing);
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
	const row = parseMcpServerRow(posted.data);
	if (!row) {
		return {ok: false, reason: 'Add MCP server response failed validation.'};
	}
	return {
		ok: true,
		data: {
			server: row,
			selectedSigningKey: built.data.selectedSigningKey
				? toSelectedSigner(built.data.selectedSigningKey)
				: undefined,
			signingMessage: built.data.canonicalJson,
		},
	};
}

export async function buildAddMcpServerFromCatalog(
	config: NodeSdkConfig,
	input: AddMcpServerFromCatalogInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = AddMcpServerFromCatalogInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid add MCP server from catalog input.'};
	}
	const idErr = validateAgentMcpServerId(parsed.data.id);
	if (idErr) {
		return {ok: false, reason: idErr};
	}
	if (normalizeAgentMcpServerId(parsed.data.id) === 'continuum') {
		return {
			ok: false,
			reason: 'id "continuum" is reserved for the builtin MCP server.',
		};
	}
	return buildManagementPostRequest(
		config,
		{
			path: AGENT_MCP_API_PATHS.addFromCatalog,
			buildRequestFields: () => ({
				id: normalizeAgentMcpServerId(parsed.data.id),
				...(parsed.data.initialLoad !== undefined
					? {initialLoad: parsed.data.initialLoad}
					: {}),
				...(parsed.data.aiReady !== undefined ? {aiReady: parsed.data.aiReady} : {}),
			}),
		},
		signing,
	);
}

export async function addMcpServerFromCatalog(
	config: NodeSdkConfig,
	input: AddMcpServerFromCatalogInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		server: AgentMcpServerRow;
		selectedSigningKey?: ReturnType<typeof toSelectedSigner>;
		signingMessage: string;
	}>
> {
	const built = await buildAddMcpServerFromCatalog(config, input, signing);
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
	const row = parseMcpServerRow(posted.data);
	if (!row) {
		return {
			ok: false,
			reason: 'Add MCP server from catalog response failed validation.',
		};
	}
	return {
		ok: true,
		data: {
			server: row,
			selectedSigningKey: built.data.selectedSigningKey
				? toSelectedSigner(built.data.selectedSigningKey)
				: undefined,
			signingMessage: built.data.canonicalJson,
		},
	};
}

export async function buildRemoveMcpServer(
	config: NodeSdkConfig,
	input: z.infer<typeof RemoveMcpServerInputSchema>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = RemoveMcpServerInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid remove MCP server input.'};
	}
	const idErr = validateAgentMcpServerId(parsed.data.id);
	if (idErr) {
		return {ok: false, reason: idErr};
	}
	return buildManagementPostRequest(
		config,
		{
			path: AGENT_MCP_API_PATHS.remove,
			buildRequestFields: () => ({
				id: normalizeAgentMcpServerId(parsed.data.id),
			}),
		},
		signing,
	);
}

export async function removeMcpServer(
	config: NodeSdkConfig,
	input: z.infer<typeof RemoveMcpServerInputSchema>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		message: string;
		selectedSigningKey?: ReturnType<typeof toSelectedSigner>;
		signingMessage: string;
	}>
> {
	const built = await buildRemoveMcpServer(config, input, signing);
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
					: 'MCP server removed',
			selectedSigningKey: built.data.selectedSigningKey
				? toSelectedSigner(built.data.selectedSigningKey)
				: undefined,
			signingMessage: built.data.canonicalJson,
		},
	};
}

export async function buildSetMcpServerFlags(
	config: NodeSdkConfig,
	input: SetMcpServerFlagsInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = SetMcpServerFlagsInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid set MCP server flags input.'};
	}
	const idErr = validateAgentMcpServerId(parsed.data.id);
	if (idErr) {
		return {ok: false, reason: idErr};
	}
	return buildManagementPostRequest(
		config,
		{
			path: AGENT_MCP_API_PATHS.setFlags,
			buildRequestFields: () => ({
				id: normalizeAgentMcpServerId(parsed.data.id),
				...(parsed.data.initialLoad !== undefined
					? {initialLoad: parsed.data.initialLoad}
					: {}),
				...(parsed.data.aiReady !== undefined ? {aiReady: parsed.data.aiReady} : {}),
			}),
		},
		signing,
	);
}

/** POST /setMcpServerFlags */
export async function setMcpServerFlags(
	config: NodeSdkConfig,
	input: SetMcpServerFlagsInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		server: AgentMcpServerRow;
		selectedSigningKey?: ReturnType<typeof toSelectedSigner>;
		signingMessage: string;
	}>
> {
	const built = await buildSetMcpServerFlags(config, input, signing);
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
	const row = parseMcpServerRow(posted.data);
	if (!row) {
		return {ok: false, reason: 'Set MCP server flags response failed validation.'};
	}
	return {
		ok: true,
		data: {
			server: row,
			selectedSigningKey: built.data.selectedSigningKey
				? toSelectedSigner(built.data.selectedSigningKey)
				: undefined,
			signingMessage: built.data.canonicalJson,
		},
	};
}
