import type {NodeSdkConfig} from '../../config/schema.js';
import {
	DEFAULT_MANAGEMENT_SIGNING,
	type ManagementSigningMethod,
} from '../../schemas/extended.js';
import type {SdkResult} from '../result.js';
import {toSelectedSigner} from '../management-signer.js';
import {saveVpnClientBundleToUserFolder} from './vpn-files.js';
import {
	isVpnObfuscated,
	parseVpnClientConfigPayload,
	parseVpnSetEnabledPayload,
	parseVpnStatusPayload,
	type VpnObfuscation,
	type VpnProfile,
	type VpnSetEnabledResult,
	type VpnStatusData,
} from './vpn-parse.js';
import {
	DownloadVpnAdminClientConfigInputSchema,
	SetVpnEnabledInputSchema,
} from './schemas.js';
import {getManagementRecord, postSignedManagementRequest} from './vpn-signed.js';

function normalizeProfile(raw?: VpnProfile): VpnProfile {
	return raw === 'split' ? 'split' : 'full';
}

function buildSetEnabledFields(input: {
	enabled: boolean;
	profile: VpnProfile;
	obfuscation?: VpnObfuscation;
}): Record<string, unknown> {
	const fields: Record<string, unknown> = {
		enabled: input.enabled,
		profile: input.profile,
	};
	if (input.enabled) {
		fields.obfuscation = input.obfuscation ?? 'none';
	}
	return fields;
}

function buildClientConfigFields(input: {
	profile: VpnProfile;
	obfuscation?: VpnObfuscation;
}): Record<string, unknown> {
	const fields: Record<string, unknown> = {profile: input.profile};
	if (input.obfuscation && isVpnObfuscated(input.obfuscation)) {
		fields.obfuscation = input.obfuscation;
	}
	return fields;
}

export async function getVpnStatus(config: NodeSdkConfig): Promise<SdkResult<VpnStatusData>> {
	const result = await getManagementRecord(config, '/vpn/status');
	if (!result.ok) return result;
	return {ok: true, data: parseVpnStatusPayload(result.data)};
}

export async function setVpnEnabled(
	config: NodeSdkConfig,
	input: unknown,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		result: VpnSetEnabledResult;
		selectedSigningKey?: ReturnType<typeof toSelectedSigner>;
		signingMessage: string;
	}>
> {
	const parsed = SetVpnEnabledInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid set VPN enabled input.'};
	}

	const profile = normalizeProfile(parsed.data.profile);
	const posted = await postSignedManagementRequest(
		config,
		'/vpn/setEnabled',
		() =>
			buildSetEnabledFields({
				enabled: parsed.data.enabled,
				profile,
				obfuscation: parsed.data.obfuscation,
			}),
		signing,
	);
	if (!posted.ok) return posted;

	return {
		ok: true,
		data: {
			result: parseVpnSetEnabledPayload(posted.data.data),
			selectedSigningKey: posted.data.selectedSigningKey,
			signingMessage: posted.data.signingMessage,
		},
	};
}

export async function downloadVpnAdminClientConfig(
	config: NodeSdkConfig,
	input: unknown,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		userFolder: string;
		wireGuardPath: string;
		transportPath?: string;
		wireGuardFilename: string;
		transportFilename?: string;
		setupInstructions?: string;
		selectedSigningKey?: ReturnType<typeof toSelectedSigner>;
		signingMessage: string;
	}>
> {
	const parsed = DownloadVpnAdminClientConfigInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid download VPN admin client config input.'};
	}

	const profile = normalizeProfile(parsed.data.profile);
	const posted = await postSignedManagementRequest(
		config,
		'/vpn/clientConfig',
		() =>
			buildClientConfigFields({
				profile,
				obfuscation: parsed.data.obfuscation,
			}),
		signing,
	);
	if (!posted.ok) return posted;

	try {
		const bundle = parseVpnClientConfigPayload(posted.data.data);
		const saved = await saveVpnClientBundleToUserFolder(bundle, 'admin', {
			userFolder: parsed.data.userFolder,
			profile,
		});
		return {
			ok: true,
			data: {
				...saved,
				selectedSigningKey: posted.data.selectedSigningKey,
				signingMessage: posted.data.signingMessage,
			},
		};
	} catch (error) {
		return {
			ok: false,
			reason: error instanceof Error ? error.message : 'Failed to save VPN client config.',
		};
	}
}
