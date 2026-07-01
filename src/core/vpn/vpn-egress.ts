import type {NodeSdkConfig} from '../../config/schema.js';
import {
	DEFAULT_MANAGEMENT_SIGNING,
	type ManagementSigningMethod,
} from '../../schemas/extended.js';
import type {SdkResult} from '../result.js';
import {toSelectedSigner} from '../management-signer.js';
import {saveVpnClientBundleToUserFolder} from './vpn-files.js';
import {
	parseVpnClientConfigPayload,
	parseVpnEgressExitsPayload,
	parseVpnEgressStatusPayload,
	type VpnEgressExitPeer,
	type VpnEgressStatusData,
	type VpnObfuscation,
} from './vpn-parse.js';
import {
	DownloadVpnEgressClientConfigInputSchema,
	RevokeVpnEgressPeerInputSchema,
	SetVpnEgressSharingInputSchema,
} from './schemas.js';
import {getManagementRecord, postSignedManagementRequest} from './vpn-signed.js';

export async function getVpnEgressStatus(
	config: NodeSdkConfig,
): Promise<SdkResult<VpnEgressStatusData>> {
	const result = await getManagementRecord(config, '/vpn/egress/status');
	if (!result.ok) return result;
	return {ok: true, data: parseVpnEgressStatusPayload(result.data)};
}

export async function listVpnEgressExits(
	config: NodeSdkConfig,
): Promise<SdkResult<{exits: VpnEgressExitPeer[]}>> {
	const result = await getManagementRecord(config, '/vpn/egress/availableExits');
	if (!result.ok) return result;
	return {ok: true, data: {exits: parseVpnEgressExitsPayload(result.data)}};
}

export async function setVpnEgressSharing(
	config: NodeSdkConfig,
	input: unknown,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		result: Record<string, unknown>;
		selectedSigningKey?: ReturnType<typeof toSelectedSigner>;
		signingMessage: string;
	}>
> {
	const parsed = SetVpnEgressSharingInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid set VPN egress sharing input.'};
	}

	const posted = await postSignedManagementRequest(
		config,
		'/vpn/egress/setSharing',
		() => ({
			enabled: parsed.data.enabled,
			obfuscation: parsed.data.obfuscation ?? 'none',
			defaultRateLimitMbps: parsed.data.defaultRateLimitMbps ?? 0,
		}),
		signing,
	);
	if (!posted.ok) return posted;

	return {
		ok: true,
		data: {
			result: posted.data.data,
			selectedSigningKey: posted.data.selectedSigningKey,
			signingMessage: posted.data.signingMessage,
		},
	};
}

export async function revokeVpnEgressPeer(
	config: NodeSdkConfig,
	input: unknown,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		result: Record<string, unknown>;
		selectedSigningKey?: ReturnType<typeof toSelectedSigner>;
		signingMessage: string;
	}>
> {
	const parsed = RevokeVpnEgressPeerInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid revoke VPN egress peer input.'};
	}

	const consumerNodeKey = parsed.data.consumerNodeKey.trim().toLowerCase();
	const posted = await postSignedManagementRequest(
		config,
		'/vpn/egress/revokePeer',
		() => ({consumerNodeKey}),
		signing,
	);
	if (!posted.ok) return posted;

	return {
		ok: true,
		data: {
			result: posted.data.data,
			selectedSigningKey: posted.data.selectedSigningKey,
			signingMessage: posted.data.signingMessage,
		},
	};
}

export async function downloadVpnEgressClientConfig(
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
	const parsed = DownloadVpnEgressClientConfigInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid download VPN egress client config input.'};
	}

	const targetAddress = parsed.data.targetAddress.trim();
	const obfuscation = (parsed.data.obfuscation ?? 'none') as VpnObfuscation;

	const posted = await postSignedManagementRequest(
		config,
		'/vpn/egress/requestClientConfig',
		() => ({
			targetAddress,
			obfuscation,
		}),
		signing,
	);
	if (!posted.ok) return posted;

	try {
		const bundle = parseVpnClientConfigPayload(posted.data.data);
		const saved = await saveVpnClientBundleToUserFolder(bundle, 'egress', {
			userFolder: parsed.data.userFolder,
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
			reason: error instanceof Error ? error.message : 'Failed to save egress client config.',
		};
	}
}
