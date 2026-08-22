import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	signedMessageForConfigUpdateImplement,
	buildConfigUpdateImplementPostBody,
} from '../api/config-update.js';
import {managementGet, managementPost} from '../api/management-api.js';
import type {SdkResult} from './result.js';
import {
	DEFAULT_MANAGEMENT_SIGNING,
	DEFAULT_PEER_MANAGEMENT_HTTP_PORT,
	GetMqttTlsPublicKeyDataSchema,
	Ipv4Schema,
	MaintenanceRestartGateDataSchema,
	NODE_CONFIG_API_PATHS,
	SetConfiguredNodesDataSchema,
	SetConfiguredNodesInputSchema,
	SetMqttTlsKeyDataSchema,
	SetMqttTlsKeyInputSchema,
	type ManagementSigningMethod,
} from '../schemas/extended.js';
import {
	buildManagementPostRequest,
	managementSign,
	toSelectedSigner,
	type BuiltManagementPostRequest,
} from './management-signer.js';

const MQTT_CA_CERT_MAX_BYTES = 512 * 1024;

export {DEFAULT_PEER_MANAGEMENT_HTTP_PORT};

export function isValidIpv4(host: string): boolean {
	return Ipv4Schema.safeParse(host.trim()).success;
}

export function isUnsetRelayPlaceholderAddress(address: string): boolean {
	return extractIpv4Host(address) === '0.0.0.0';
}

export function extractIpv4Host(addr: string): string {
	const s = addr.trim();
	if (!s) {
		return '';
	}
	try {
		const u = new URL(s.includes('://') ? s : `http://${s}`);
		return u.hostname;
	} catch {
		const colon = s.lastIndexOf(':');
		if (colon > 0) {
			return s.slice(0, colon).trim();
		}
		return s;
	}
}

/** IPv4 plus port for POST /configUpdatePlan `nodeAddresses` / `MSQTTRelayIP`. */
export function peerAddressForConfigWrite(
	ipv4: string,
	port: number = DEFAULT_PEER_MANAGEMENT_HTTP_PORT,
): string {
	const ip = ipv4.trim();
	const p = port > 0 ? port : DEFAULT_PEER_MANAGEMENT_HTTP_PORT;
	return `${ip}:${p}`;
}

function assertMqttCaCertPem(pem: string): SdkResult<string> {
	const trimmed = pem.trim();
	if (!trimmed.includes('-----BEGIN CERTIFICATE-----')) {
		return {ok: false, reason: 'caCertPem must be a PEM-encoded CERTIFICATE'};
	}
	if (new TextEncoder().encode(trimmed).length > MQTT_CA_CERT_MAX_BYTES) {
		return {ok: false, reason: 'caCertPem exceeds max size (512 KiB)'};
	}
	return {ok: true, data: trimmed};
}

function normalizePeerIpv4List(peers: readonly string[]): SdkResult<string[]> {
	const list = peers.map(p => p.trim()).filter(Boolean);
	if (list.length === 0) {
		return {ok: false, reason: 'peers must contain at least one IPv4 address.'};
	}
	const bad = list.filter(ip => !isValidIpv4(ip));
	if (bad.length > 0) {
		return {ok: false, reason: `Invalid IPv4 in peers: ${bad.join(', ')}`};
	}
	if (new Set(list).size !== list.length) {
		return {ok: false, reason: 'Each peer IPv4 address must appear only once.'};
	}
	if (list[0] === '0.0.0.0') {
		return {
			ok: false,
			reason:
				'First peer is the relay; 0.0.0.0 is the unset placeholder. Set a real public relay IPv4.',
		};
	}
	return {ok: true, data: list};
}

/** GET /getMSQTTKey — MQTT broker TLS CA PEM (relay export). */
export async function getMqttTlsPublicKey(
	config: NodeSdkConfig,
): Promise<SdkResult<z.infer<typeof GetMqttTlsPublicKeyDataSchema>>> {
	const result = await managementGet<unknown>(
		config,
		NODE_CONFIG_API_PATHS.getMqttKey,
	);
	if (!result.ok) {
		return result;
	}
	const parsed = GetMqttTlsPublicKeyDataSchema.safeParse(result.data);
	if (!parsed.success) {
		return {ok: false, reason: 'GET /getMSQTTKey response failed validation.'};
	}
	return {ok: true, data: parsed.data};
}

export async function buildSetMqttTlsKey(
	config: NodeSdkConfig,
	input: z.infer<typeof SetMqttTlsKeyInputSchema>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = SetMqttTlsKeyInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid set MQTT TLS key input.'};
	}
	const pem = assertMqttCaCertPem(parsed.data.caCertPem);
	if (!pem.ok) {
		return pem;
	}
	return buildManagementPostRequest(
		config,
		{
			path: NODE_CONFIG_API_PATHS.postMqttKey,
			buildRequestFields: () => ({caCertPem: pem.data}),
		},
		signing,
	);
}

/** POST /postMSQTTKey — write MQTT broker CA PEM (sign caCertPem bytes, not JSON). */
export async function setMqttTlsKey(
	config: NodeSdkConfig,
	input: z.infer<typeof SetMqttTlsKeyInputSchema>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<
		z.infer<typeof SetMqttTlsKeyDataSchema> & {
			selectedSigningKey?: ReturnType<typeof toSelectedSigner>;
			signingMessage: string;
		}
	>
> {
	const built = await buildSetMqttTlsKey(config, input, signing);
	if (!built.ok) {
		return built;
	}
	const pem = String(built.data.unsignedBody['caCertPem'] ?? '');
	const signed = await managementSign(
		config,
		signing,
		built.data.unsignedBody,
		{messageToSign: pem},
	);
	if (!signed.ok) {
		return signed;
	}
	const posted = await managementPost<{path?: string; message?: string}>(
		config,
		built.data.path,
		signed.data,
	);
	if (!posted.ok) {
		return posted;
	}
	const data = SetMqttTlsKeyDataSchema.safeParse({
		path: String(posted.data.path ?? ''),
		message: String(posted.data.message ?? 'MQTT broker CA PEM written'),
		restartRequired: true,
	});
	if (!data.success) {
		return {ok: false, reason: 'POST /postMSQTTKey response failed validation.'};
	}
	return {
		ok: true,
		data: {
			...data.data,
			selectedSigningKey: built.data.selectedSigningKey
				? toSelectedSigner(built.data.selectedSigningKey)
				: undefined,
			signingMessage: pem,
		},
	};
}

export async function buildSetConfiguredNodes(
	config: NodeSdkConfig,
	input: z.infer<typeof SetConfiguredNodesInputSchema>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = SetConfiguredNodesInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid set configured nodes input.'};
	}
	const peers = normalizePeerIpv4List(parsed.data.peers);
	if (!peers.ok) {
		return peers;
	}
	const port =
		parsed.data.managementHttpPort ?? DEFAULT_PEER_MANAGEMENT_HTTP_PORT;
	const nodeAddresses = peers.data.map(ip =>
		peerAddressForConfigWrite(ip, port),
	);
	const relayIp = nodeAddresses[0];
	if (!relayIp) {
		return {ok: false, reason: 'peers must contain a relay IPv4 (first slot).'};
	}
	return buildManagementPostRequest(
		config,
		{
			path: NODE_CONFIG_API_PATHS.configUpdatePlan,
			buildRequestFields: () => ({
				MSQTTRelayIP: relayIp,
				nodeAddresses,
				managementHttpPort: port,
			}),
		},
		signing,
	);
}

type ConfigUpdatePlanData = {
	plannedYaml?: string;
	plannedShaMessage?: string;
	configsPath?: string;
};

type ConfigUpdateImplementData = {
	message?: string;
	configsPath?: string;
	backupPath?: string;
	composeWarning?: string;
};

/**
 * POST /configUpdatePlan then POST /configUpdateImplement.
 * First IPv4 is the relay (every collaborator must share it). Restart the node after apply.
 */
export async function setConfiguredNodes(
	config: NodeSdkConfig,
	input: z.infer<typeof SetConfiguredNodesInputSchema>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<
		z.infer<typeof SetConfiguredNodesDataSchema> & {
			selectedSigningKey?: ReturnType<typeof toSelectedSigner>;
			signingMessage: string;
		}
	>
> {
	const builtPlan = await buildSetConfiguredNodes(config, input, signing);
	if (!builtPlan.ok) {
		return builtPlan;
	}
	const signedPlan = await managementSign(
		config,
		signing,
		builtPlan.data.unsignedBody,
	);
	if (!signedPlan.ok) {
		return signedPlan;
	}
	const planned = await managementPost<ConfigUpdatePlanData>(
		config,
		builtPlan.data.path,
		signedPlan.data,
	);
	if (!planned.ok) {
		return planned;
	}
	const plannedYaml = String(planned.data.plannedYaml ?? '').trim();
	if (!plannedYaml) {
		return {ok: false, reason: 'configUpdatePlan returned no plannedYaml.'};
	}
	const plannedShaMessage =
		String(planned.data.plannedShaMessage ?? '').trim() ||
		(await signedMessageForConfigUpdateImplement(plannedYaml));

	const builtImpl = await buildManagementPostRequest(
		config,
		{
			path: NODE_CONFIG_API_PATHS.configUpdateImplement,
			buildRequestFields: ctx =>
				buildConfigUpdateImplementPostBody(
					0,
					ctx.nodeKey,
					plannedYaml,
					plannedShaMessage,
				),
		},
		signing,
	);
	if (!builtImpl.ok) {
		return builtImpl;
	}
	const signedImpl = await managementSign(
		config,
		signing,
		builtImpl.data.unsignedBody,
		{messageToSign: plannedShaMessage},
	);
	if (!signedImpl.ok) {
		return signedImpl;
	}
	const implemented = await managementPost<ConfigUpdateImplementData>(
		config,
		builtImpl.data.path,
		signedImpl.data,
	);
	if (!implemented.ok) {
		return implemented;
	}
	const data = SetConfiguredNodesDataSchema.safeParse({
		message: String(
			implemented.data.message ??
				'configs.yaml updated; restart the node for changes to take effect',
		),
		...(implemented.data.configsPath
			? {configsPath: implemented.data.configsPath}
			: planned.data.configsPath
				? {configsPath: planned.data.configsPath}
				: {}),
		...(implemented.data.backupPath
			? {backupPath: implemented.data.backupPath}
			: {}),
		...(implemented.data.composeWarning
			? {composeWarning: implemented.data.composeWarning}
			: {}),
		restartRequired: true,
	});
	if (!data.success) {
		return {
			ok: false,
			reason: 'configUpdateImplement response failed validation.',
		};
	}
	return {
		ok: true,
		data: {
			...data.data,
			selectedSigningKey: builtImpl.data.selectedSigningKey
				? toSelectedSigner(builtImpl.data.selectedSigningKey)
				: builtPlan.data.selectedSigningKey
					? toSelectedSigner(builtPlan.data.selectedSigningKey)
					: undefined,
			signingMessage: plannedShaMessage,
		},
	};
}

/** GET /maintenance/restartGate — read-only; container restart is host `docker compose`. */
export async function getMaintenanceRestartGate(
	config: NodeSdkConfig,
): Promise<SdkResult<z.infer<typeof MaintenanceRestartGateDataSchema>>> {
	const result = await managementGet<unknown>(
		config,
		NODE_CONFIG_API_PATHS.restartGate,
	);
	if (!result.ok) {
		return result;
	}
	const parsed = MaintenanceRestartGateDataSchema.safeParse(result.data);
	if (!parsed.success) {
		return {
			ok: false,
			reason: 'GET /maintenance/restartGate response failed validation.',
		};
	}
	return {ok: true, data: parsed.data};
}
