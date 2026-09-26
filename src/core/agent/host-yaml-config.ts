import type {NodeSdkConfig} from '../../config/schema.js';
import {
	buildManagementQueryPath,
	managementGet,
	managementPost,
} from '../../api/management-api.js';
import {
	AGENT_HOST_YAML_API_PATHS,
	GetHostYamlConfigQuerySchema,
	HostYamlConfigDetailSchema,
	ResetHostYamlFromDefaultsInputSchema,
	UpsertHostYamlConfigInputSchema,
	type HostYamlConfigDetail,
	type ResetHostYamlFromDefaultsInput,
	type UpsertHostYamlConfigInput,
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
import type {z} from 'zod';

function parseHostYamlConfigDetail(
	raw: unknown,
	fallbackKind: z.infer<typeof GetHostYamlConfigQuerySchema>['kind'],
): HostYamlConfigDetail | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return null;
	}
	const data = raw as Record<string, unknown>;
	const parsed = HostYamlConfigDetailSchema.safeParse({
		kind: String(data.kind ?? data.Kind ?? fallbackKind).trim(),
		content: String(data.content ?? data.Content ?? ''),
		configured: Boolean(data.configured ?? data.Configured),
		defaultContent: String(data.defaultContent ?? data.DefaultContent ?? ''),
		defaultsUpdatedAt: String(data.defaultsUpdatedAt ?? data.DefaultsUpdatedAt ?? '').trim(),
		installedUpdatedAt: String(data.installedUpdatedAt ?? data.InstalledUpdatedAt ?? '').trim(),
		appliedDefaultsHash: String(
			data.appliedDefaultsHash ?? data.AppliedDefaultsHash ?? '',
		).trim(),
		appliedAt: String(data.appliedAt ?? data.AppliedAt ?? '').trim(),
		upgradeAvailable: Boolean(data.upgradeAvailable ?? data.UpgradeAvailable),
		userModified: Boolean(data.userModified ?? data.UserModified),
		path: String(data.path ?? data.Path ?? '').trim(),
		filename: String(data.filename ?? data.Filename ?? '').trim(),
	});
	return parsed.success ? parsed.data : null;
}

/** GET /getHostYamlConfig — runtime or bundled-default preview for one host YAML kind. */
export async function getHostYamlConfig(
	config: NodeSdkConfig,
	query: z.infer<typeof GetHostYamlConfigQuerySchema>,
): Promise<SdkResult<HostYamlConfigDetail>> {
	const parsedQuery = GetHostYamlConfigQuerySchema.safeParse(query);
	if (!parsedQuery.success) {
		return {ok: false, reason: 'Invalid host YAML kind.'};
	}
	const path = buildManagementQueryPath(AGENT_HOST_YAML_API_PATHS.get, {
		kind: parsedQuery.data.kind,
	});
	const result = await managementGet<unknown>(config, path);
	if (!result.ok) {
		return result;
	}
	const detail = parseHostYamlConfigDetail(result.data, parsedQuery.data.kind);
	if (!detail) {
		return {ok: false, reason: 'Host YAML config response failed validation.'};
	}
	return {ok: true, data: detail};
}

export async function buildUpsertHostYamlConfig(
	config: NodeSdkConfig,
	input: UpsertHostYamlConfigInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = UpsertHostYamlConfigInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid upsert host YAML input.'};
	}
	return buildManagementPostRequest(
		config,
		{
			path: AGENT_HOST_YAML_API_PATHS.upsert,
			buildRequestFields: () => ({
				kind: parsed.data.kind,
				content: parsed.data.content,
			}),
		},
		signing,
	);
}

export async function upsertHostYamlConfig(
	config: NodeSdkConfig,
	input: UpsertHostYamlConfigInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		config: HostYamlConfigDetail;
		selectedSigningKey?: ReturnType<typeof toSelectedSigner>;
		signingMessage: string;
	}>
> {
	const built = await buildUpsertHostYamlConfig(config, input, signing);
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
	const configDetail = parseHostYamlConfigDetail(posted.data, input.kind);
	if (!configDetail) {
		return {ok: false, reason: 'Upsert host YAML response failed validation.'};
	}
	return {
		ok: true,
		data: {
			config: configDetail,
			selectedSigningKey: built.data.selectedSigningKey
				? toSelectedSigner(built.data.selectedSigningKey)
				: undefined,
			signingMessage: built.data.canonicalJson,
		},
	};
}

export async function buildResetHostYamlFromDefaults(
	config: NodeSdkConfig,
	input: ResetHostYamlFromDefaultsInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = ResetHostYamlFromDefaultsInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid reset host YAML input.'};
	}
	return buildManagementPostRequest(
		config,
		{
			path: AGENT_HOST_YAML_API_PATHS.resetFromDefaults,
			buildRequestFields: () => ({kind: parsed.data.kind}),
		},
		signing,
	);
}

export async function resetHostYamlFromDefaults(
	config: NodeSdkConfig,
	input: ResetHostYamlFromDefaultsInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		config: HostYamlConfigDetail;
		selectedSigningKey?: ReturnType<typeof toSelectedSigner>;
		signingMessage: string;
	}>
> {
	const built = await buildResetHostYamlFromDefaults(config, input, signing);
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
	const configDetail = parseHostYamlConfigDetail(posted.data, input.kind);
	if (!configDetail) {
		return {ok: false, reason: 'Reset host YAML response failed validation.'};
	}
	return {
		ok: true,
		data: {
			config: configDetail,
			selectedSigningKey: built.data.selectedSigningKey
				? toSelectedSigner(built.data.selectedSigningKey)
				: undefined,
			signingMessage: built.data.canonicalJson,
		},
	};
}
