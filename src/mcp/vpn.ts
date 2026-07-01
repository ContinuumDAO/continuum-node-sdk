import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {getVpnStatus, setVpnEnabled, downloadVpnAdminClientConfig} from '../core/vpn/vpn-admin.js';
import {
	getVpnEgressStatus,
	listVpnEgressExits,
	setVpnEgressSharing,
	revokeVpnEgressPeer,
	downloadVpnEgressClientConfig,
} from '../core/vpn/vpn-egress.js';
import type {VpnEgressStatusData, VpnStatusData} from '../core/vpn/vpn-parse.js';
import {
	DownloadVpnAdminClientConfigInputSchema,
	DownloadVpnEgressClientConfigInputSchema,
	ListVpnEgressExitsOutputSchema,
	RevokeVpnEgressPeerInputSchema,
	SetVpnEgressSharingInputSchema,
	SetVpnEnabledInputSchema,
	VpnDownloadOutputSchema,
	VpnEgressStatusSchema,
	VpnSignedActionOutputSchema,
	VpnStatusSchema,
} from '../core/vpn/schemas.js';
import {registerMcpMarkdownResource} from './mcp-resources.js';
import {camelToSnake, sdkResultToCallToolResult, wrapSdk} from './tool-utils.js';

function summarizeVpnStatus(status: VpnStatusData): z.infer<typeof VpnStatusSchema> {
	return {
		available: status.available,
		installed: status.installed,
		active: status.active,
		listenPort: status.listenPort,
		endpointHost: status.endpointHost,
		profiles: status.profiles,
		profile: status.profile,
		obfuscation: status.obfuscation,
		clientConfigured: status.clientConfigured,
		vpnBillingRegistered: status.vpnBillingRegistered,
		vpnBillingMonthActive: status.vpnBillingMonthActive,
		message: status.message,
		lastError: status.lastError,
	};
}

function summarizeVpnEgressStatus(
	status: VpnEgressStatusData,
): z.infer<typeof VpnEgressStatusSchema> {
	return {
		available: status.available,
		active: status.active,
		sharingEnabled: status.sharingEnabled,
		listenPort: status.listenPort,
		endpointHost: status.endpointHost,
		countryCode: status.countryCode,
		defaultRateLimitMbps: status.defaultRateLimitMbps,
		obfuscation: status.obfuscation,
		peerCount: status.peerCount,
		vpnBillingRegistered: status.vpnBillingRegistered,
		vpnBillingMonthActive: status.vpnBillingMonthActive,
		message: status.message,
		lastError: status.lastError,
	};
}

export function registerVpnTools(server: McpServer, config: NodeSdkConfig): void {
	server.registerTool(
		camelToSnake('getVpnStatus'),
		{
			description:
				'Read admin WireGuard VPN status for this node (GET /vpn/status): availability, active profile, obfuscation, billing summary.',
			inputSchema: z.object({}).strict(),
			outputSchema: VpnStatusSchema,
		},
		async () => {
			const result = await getVpnStatus(config);
			if (!result.ok) return sdkResultToCallToolResult(result);
			return sdkResultToCallToolResult({ok: true, data: summarizeVpnStatus(result.data)});
		},
	);

	server.registerTool(
		camelToSnake('setVpnEnabled'),
		{
			description:
				'Enable or disable admin WireGuard VPN on this node (POST /vpn/setEnabled, management-signed). When enabling, optional profile (split|full, default full) and obfuscation (none, shadowsocks, wg_obfuscator, lwo, udp2raw). Writes systemd pending file on the host.',
			inputSchema: SetVpnEnabledInputSchema,
			outputSchema: VpnSignedActionOutputSchema,
		},
		async input => {
			const result = await setVpnEnabled(config, input);
			if (!result.ok) return sdkResultToCallToolResult(result);
			return sdkResultToCallToolResult({
				ok: true,
				data: {
					result: result.data.result,
					selectedSigningKey: result.data.selectedSigningKey,
					signingMessage: result.data.signingMessage,
				},
			});
		},
	);

	server.registerTool(
		camelToSnake('downloadVpnAdminClientConfig'),
		{
			description:
				'Request admin VPN WireGuard client config (POST /vpn/clientConfig, management-signed) and save files under user_folder (default MPC_AUTH_USER_FOLDER=/app/user_folder). Returns saved paths for WireGuard and optional transport proxy config.',
			inputSchema: DownloadVpnAdminClientConfigInputSchema,
			outputSchema: VpnDownloadOutputSchema,
		},
		async input => wrapSdk(downloadVpnAdminClientConfig(config, input)),
	);

	server.registerTool(
		camelToSnake('getVpnEgressStatus'),
		{
			description:
				'Read egress VPN provider status on this node (GET /vpn/egress/status): sharing enabled, listen ports, billing summary.',
			inputSchema: z.object({}).strict(),
			outputSchema: VpnEgressStatusSchema,
		},
		async () => {
			const result = await getVpnEgressStatus(config);
			if (!result.ok) return sdkResultToCallToolResult(result);
			return sdkResultToCallToolResult({
				ok: true,
				data: summarizeVpnEgressStatus(result.data),
			});
		},
	);

	server.registerTool(
		camelToSnake('listVpnEgressExits'),
		{
			description:
				'List exit routes from other nodes available for consumer egress (GET /vpn/egress/availableExits). Use targetAddress from a row with download_vpn_egress_client_config.',
			inputSchema: z.object({}).strict(),
			outputSchema: ListVpnEgressExitsOutputSchema,
		},
		async () => wrapSdk(listVpnEgressExits(config)),
	);

	server.registerTool(
		camelToSnake('setVpnEgressSharing'),
		{
			description:
				'Apply egress sharing settings on this node (POST /vpn/egress/setSharing, management-signed). Controls whether peers can request egress configs, obfuscation transport, and default rate limit Mbps.',
			inputSchema: SetVpnEgressSharingInputSchema,
			outputSchema: VpnSignedActionOutputSchema,
		},
		async input => wrapSdk(setVpnEgressSharing(config, input)),
	);

	server.registerTool(
		camelToSnake('revokeVpnEgressPeer'),
		{
			description:
				'Revoke an issued egress peer by consumer node key (POST /vpn/egress/revokePeer, management-signed).',
			inputSchema: RevokeVpnEgressPeerInputSchema,
			outputSchema: VpnSignedActionOutputSchema,
		},
		async input => wrapSdk(revokeVpnEgressPeer(config, input)),
	);

	server.registerTool(
		camelToSnake('downloadVpnEgressClientConfig'),
		{
			description:
				'Request egress client config from a remote exit (POST /vpn/egress/requestClientConfig, management-signed) and save WireGuard (+ transport when obfuscated) files to user_folder. targetAddress is the exit peer HTTP address from list_vpn_egress_exits.',
			inputSchema: DownloadVpnEgressClientConfigInputSchema,
			outputSchema: VpnDownloadOutputSchema,
		},
		async input => wrapSdk(downloadVpnEgressClientConfig(config, input)),
	);
}

export function registerVpnResources(server: McpServer): void {
	registerMcpMarkdownResource(
		server,
		'vpn_docs',
		'vpn.md',
		'Admin VPN and peer egress: enable/disable, client configs, sharing, revoke.',
	);
}

export function createVpnMcpServer(config: NodeSdkConfig): McpServer {
	const server = new McpServer(
		{
			name: 'continuum-vpn-mcp',
			version: '1.0.0',
		},
		{
			capabilities: {
				tools: {},
			},
		},
	);

	registerVpnTools(server, config);
	registerVpnResources(server);

	return server;
}
