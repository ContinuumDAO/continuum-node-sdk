export type VpnProfile = 'split' | 'full';

export const VPN_OBFUSCATION_PROTOCOLS = [
	'shadowsocks',
	'wg_obfuscator',
	'lwo',
	'udp2raw',
] as const;
export type VpnObfuscationProtocol = (typeof VPN_OBFUSCATION_PROTOCOLS)[number];
export type VpnObfuscation = 'none' | VpnObfuscationProtocol;

export type VpnConnectSource = 'admin' | 'egress';

export const VPN_DOWNLOAD_WG_FULL = 'cont-full.conf';
export const VPN_DOWNLOAD_WG_SPLIT = 'cont-split.conf';
export const VPN_DOWNLOAD_WG_EGRESS = 'cont-egress.conf';
export const VPN_DOWNLOAD_SS_LOCAL = 'cont-ss.json';
export const VPN_DOWNLOAD_SS_EGRESS = 'cont-egss.json';
export const VPN_DOWNLOAD_WG_OBFUSC = 'cont-wgo.conf';
export const VPN_DOWNLOAD_LWO_CLIENT = 'cont-lwo.json';
export const VPN_DOWNLOAD_UDP2RAW = 'cont-u2r.sh';

export type VpnStatusData = {
	available: boolean;
	installed: boolean;
	active: boolean;
	listenPort: number;
	serverAddress: string;
	vpnNetworkCidr: string;
	endpointHost: string;
	profiles: VpnProfile[];
	clientConfigured: boolean;
	profile?: VpnProfile | '';
	obfuscation?: VpnObfuscation;
	obfuscationAvailable?: boolean;
	availableObfuscations?: VpnObfuscationProtocol[];
	shadowsocksListenPort?: number;
	shadowsocksMethod?: string;
	wgObfuscatorListenPort?: number;
	directWireGuardBlocked?: boolean;
	managementViaVpn?: string;
	message?: string;
	lastError?: string;
	hostProfile?: string;
	vpnBillingRegistered?: boolean;
	vpnBillingMonthActive?: boolean;
	vpnBillingMonthUTC?: number;
};

export type VpnClientBundle = {
	profile?: VpnProfile;
	obfuscation?: VpnObfuscation;
	configText?: string;
	wireGuardConfigText?: string;
	transportConfigText?: string;
	transportFilename?: string;
	transportBinary?: string;
	shadowsocksLocalConfigText?: string;
	shadowsocksUri?: string;
	setupInstructions?: string;
	filename?: string;
	shadowsocksLocalFilename?: string;
	localTunnelPort?: number;
};

export type VpnTransportBundle = {
	text: string;
	filename: string;
	binary?: string;
};

export type VpnSetEnabledResult = {
	message?: string;
	profile?: VpnProfile;
	obfuscation?: VpnObfuscation;
	pendingVpnWritten?: boolean;
	pendingVpnFileError?: string;
	transportError?: string;
};

export type VpnEgressStatusData = {
	available: boolean;
	active: boolean;
	sharingEnabled: boolean;
	listenPort: number;
	vpnNetworkCidr: string;
	endpointHost: string;
	obfuscation: VpnObfuscation;
	countryCode: string;
	defaultRateLimitMbps: number;
	shadowsocksListenPort?: number;
	wgObfuscatorListenPort?: number;
	udp2rawListenPort?: number;
	availableObfuscations?: VpnObfuscationProtocol[];
	peerCount?: number;
	message?: string;
	lastError?: string;
	vpnBillingRegistered?: boolean;
	vpnBillingMonthActive?: boolean;
	vpnBillingMonthUTC?: number;
};

export type VpnEgressExitPeer = {
	address: string;
	publicKey: string;
	countryCode?: string;
	obfuscation?: VpnObfuscation;
	endpointHost?: string;
	listenPort?: number;
	defaultRateLimitMbps?: number;
	shadowsocksListenPort?: number;
	wgObfuscatorListenPort?: number;
	udp2rawListenPort?: number;
	vpnBillingRegistered?: boolean;
	vpnBillingMonthActive?: boolean;
	vpnBillingMonthUTC?: number;
};

function parseVpnObfuscationProtocol(raw: unknown): VpnObfuscationProtocol | null {
	const v = String(raw ?? '')
		.trim()
		.toLowerCase()
		.replace(/-/g, '_');
	if (v === 'shadowsocks') return 'shadowsocks';
	if (v === 'wg_obfuscator' || v === 'wgobfuscator') return 'wg_obfuscator';
	if (v === 'lwo') return 'lwo';
	if (v === 'udp2raw') return 'udp2raw';
	return null;
}

export function parseVpnObfuscation(raw: unknown): VpnObfuscation {
	return parseVpnObfuscationProtocol(raw) ?? 'none';
}

export function isVpnObfuscated(obfuscation?: VpnObfuscation | string): boolean {
	const v = String(obfuscation ?? 'none')
		.trim()
		.toLowerCase()
		.replace(/-/g, '_');
	return v !== '' && v !== 'none';
}

function parseAvailableObfuscations(raw: unknown): VpnObfuscationProtocol[] {
	if (!Array.isArray(raw)) return [];
	const out: VpnObfuscationProtocol[] = [];
	for (const item of raw) {
		const parsed = parseVpnObfuscationProtocol(item);
		if (parsed && !out.includes(parsed)) out.push(parsed);
	}
	return out;
}

function parseVpnBillingSummaryFields(data: Record<string, unknown>) {
	const registeredRaw = data.vpnBillingRegistered ?? data.VpnBillingRegistered;
	const monthActiveRaw = data.vpnBillingMonthActive ?? data.VpnBillingMonthActive;
	const monthUtcRaw = data.vpnBillingMonthUTC ?? data.VpnBillingMonthUTC;
	return {
		vpnBillingRegistered: typeof registeredRaw === 'boolean' ? registeredRaw : undefined,
		vpnBillingMonthActive: typeof monthActiveRaw === 'boolean' ? monthActiveRaw : undefined,
		vpnBillingMonthUTC:
			monthUtcRaw != null && String(monthUtcRaw).trim() !== ''
				? Number(monthUtcRaw)
				: undefined,
	};
}

export function parseVpnStatusPayload(data: Record<string, unknown>): VpnStatusData {
	const profilesRaw = data.profiles ?? data.Profiles;
	const profiles: VpnProfile[] = Array.isArray(profilesRaw)
		? profilesRaw
				.map(p => String(p).toLowerCase())
				.filter((p): p is VpnProfile => p === 'split' || p === 'full')
		: ['full', 'split'];
	const profileRaw = String(data.profile ?? data.Profile ?? '').toLowerCase();
	const ssPortRaw = data.shadowsocksListenPort ?? data.ShadowsocksListenPort;
	const woPortRaw = data.wgObfuscatorListenPort ?? data.WgObfuscatorListenPort;
	const availableObfuscations = parseAvailableObfuscations(
		data.availableObfuscations ?? data.AvailableObfuscations,
	);
	return {
		available: Boolean(data.available ?? data.Available),
		installed: Boolean(data.installed ?? data.Installed ?? data.available ?? data.Available),
		active: Boolean(data.active ?? data.Active),
		listenPort: Number(data.listenPort ?? data.ListenPort ?? 51820),
		serverAddress: String(data.serverAddress ?? data.ServerAddress ?? ''),
		vpnNetworkCidr: String(data.vpnNetworkCidr ?? data.VpnNetworkCidr ?? ''),
		endpointHost: String(data.endpointHost ?? data.EndpointHost ?? ''),
		profiles: profiles.length ? profiles : ['full', 'split'],
		clientConfigured: Boolean(data.clientConfigured ?? data.ClientConfigured),
		profile: profileRaw === 'split' || profileRaw === 'full' ? profileRaw : '',
		obfuscation: parseVpnObfuscation(data.obfuscation ?? data.Obfuscation),
		obfuscationAvailable: Boolean(
			data.obfuscationAvailable ??
				data.ObfuscationAvailable ??
				availableObfuscations.length > 0,
		),
		availableObfuscations,
		shadowsocksListenPort:
			ssPortRaw != null && String(ssPortRaw).trim() !== '' ? Number(ssPortRaw) : undefined,
		shadowsocksMethod:
			String(data.shadowsocksMethod ?? data.ShadowsocksMethod ?? '').trim() || undefined,
		wgObfuscatorListenPort:
			woPortRaw != null && String(woPortRaw).trim() !== '' ? Number(woPortRaw) : undefined,
		directWireGuardBlocked: Boolean(
			data.directWireGuardBlocked ?? data.DirectWireGuardBlocked,
		),
		managementViaVpn: String(data.managementViaVpn ?? data.ManagementViaVpn ?? ''),
		message: String(data.message ?? data.Message ?? '').trim() || undefined,
		lastError: String(data.lastError ?? data.LastError ?? '').trim() || undefined,
		hostProfile: String(data.hostProfile ?? data.HostProfile ?? '').trim() || undefined,
		...parseVpnBillingSummaryFields(data),
	};
}

export function parseVpnClientConfigPayload(data: Record<string, unknown>): VpnClientBundle {
	const profileRaw = String(data.profile ?? data.Profile ?? '').toLowerCase();
	return {
		profile: profileRaw === 'split' || profileRaw === 'full' ? profileRaw : undefined,
		obfuscation: parseVpnObfuscation(data.obfuscation ?? data.Obfuscation),
		configText: String(data.configText ?? data.ConfigText ?? '').trim() || undefined,
		wireGuardConfigText:
			String(data.wireGuardConfigText ?? data.WireGuardConfigText ?? '').trim() || undefined,
		transportConfigText:
			String(data.transportConfigText ?? data.TransportConfigText ?? '').trim() || undefined,
		transportFilename:
			String(data.transportFilename ?? data.TransportFilename ?? '').trim() || undefined,
		transportBinary:
			String(data.transportBinary ?? data.TransportBinary ?? '').trim() || undefined,
		shadowsocksLocalConfigText:
			String(data.shadowsocksLocalConfigText ?? data.ShadowsocksLocalConfigText ?? '').trim() ||
			undefined,
		shadowsocksUri: String(data.shadowsocksUri ?? data.ShadowsocksUri ?? '').trim() || undefined,
		setupInstructions:
			String(data.setupInstructions ?? data.SetupInstructions ?? '').trim() || undefined,
		filename: String(data.filename ?? data.Filename ?? '').trim() || undefined,
		shadowsocksLocalFilename:
			String(data.shadowsocksLocalFilename ?? data.ShadowsocksLocalFilename ?? '').trim() ||
			undefined,
		localTunnelPort:
			data.localTunnelPort != null || data.LocalTunnelPort != null
				? Number(data.localTunnelPort ?? data.LocalTunnelPort)
				: undefined,
	};
}

export function parseVpnSetEnabledPayload(data: Record<string, unknown>): VpnSetEnabledResult {
	const profileRaw = String(data.profile ?? data.Profile ?? '').toLowerCase();
	const transportErr =
		String(
			data.transportError ??
				data.TransportError ??
				data.shadowsocksError ??
				data.ShadowsocksError ??
				'',
		).trim() || undefined;
	return {
		message: String(data.message ?? data.Message ?? '').trim() || undefined,
		profile:
			profileRaw === 'split' || profileRaw === 'full' ? (profileRaw as VpnProfile) : undefined,
		obfuscation: parseVpnObfuscation(data.obfuscation ?? data.Obfuscation),
		pendingVpnWritten: Boolean(data.pendingVpnWritten ?? data.PendingVpnWritten),
		pendingVpnFileError:
			String(data.pendingVpnFileError ?? data.PendingVpnFileError ?? '').trim() || undefined,
		transportError: transportErr,
	};
}

export function parseVpnEgressStatusPayload(data: Record<string, unknown>): VpnEgressStatusData {
	const availableObfuscations = parseAvailableObfuscations(
		data.availableObfuscations ?? data.AvailableObfuscations,
	);
	const ssPortRaw = data.shadowsocksListenPort ?? data.ShadowsocksListenPort;
	const woPortRaw = data.wgObfuscatorListenPort ?? data.WgObfuscatorListenPort;
	const u2PortRaw = data.udp2rawListenPort ?? data.Udp2rawListenPort;
	return {
		available: Boolean(data.available ?? data.Available),
		active: Boolean(data.active ?? data.Active),
		sharingEnabled: Boolean(data.sharingEnabled ?? data.SharingEnabled),
		listenPort: Number(data.listenPort ?? data.ListenPort ?? 51821),
		vpnNetworkCidr: String(data.vpnNetworkCidr ?? data.VpnNetworkCidr ?? ''),
		endpointHost: String(data.endpointHost ?? data.EndpointHost ?? ''),
		obfuscation: parseVpnObfuscation(data.obfuscation ?? data.Obfuscation),
		countryCode: String(data.countryCode ?? data.CountryCode ?? '').trim(),
		defaultRateLimitMbps: Number(data.defaultRateLimitMbps ?? data.DefaultRateLimitMbps ?? 0),
		shadowsocksListenPort:
			ssPortRaw != null && String(ssPortRaw).trim() !== '' ? Number(ssPortRaw) : undefined,
		wgObfuscatorListenPort:
			woPortRaw != null && String(woPortRaw).trim() !== '' ? Number(woPortRaw) : undefined,
		udp2rawListenPort:
			u2PortRaw != null && String(u2PortRaw).trim() !== '' ? Number(u2PortRaw) : undefined,
		availableObfuscations,
		peerCount:
			data.peerCount != null || data.PeerCount != null
				? Number(data.peerCount ?? data.PeerCount)
				: undefined,
		message: String(data.message ?? data.Message ?? '').trim() || undefined,
		lastError: String(data.lastError ?? data.LastError ?? '').trim() || undefined,
		...parseVpnBillingSummaryFields(data),
	};
}

export function parseVpnEgressExitsPayload(data: Record<string, unknown>): VpnEgressExitPeer[] {
	const raw = data.exits ?? data.Exits;
	if (!Array.isArray(raw)) return [];
	const out: VpnEgressExitPeer[] = [];
	for (const item of raw) {
		if (!item || typeof item !== 'object') continue;
		const row = item as Record<string, unknown>;
		const address = String(row.address ?? row.Address ?? '').trim();
		const publicKey = String(row.publicKey ?? row.PublicKey ?? '').trim();
		if (!address || !publicKey) continue;
		out.push({
			address,
			publicKey,
			countryCode: String(row.countryCode ?? row.CountryCode ?? '').trim() || undefined,
			obfuscation: parseVpnObfuscation(row.obfuscation ?? row.Obfuscation),
			endpointHost: String(row.endpointHost ?? row.EndpointHost ?? '').trim() || undefined,
			listenPort: row.listenPort != null ? Number(row.listenPort ?? row.ListenPort) : undefined,
			defaultRateLimitMbps:
				row.defaultRateLimitMbps != null
					? Number(row.defaultRateLimitMbps ?? row.DefaultRateLimitMbps)
					: undefined,
			shadowsocksListenPort:
				row.shadowsocksListenPort != null
					? Number(row.shadowsocksListenPort ?? row.ShadowsocksListenPort)
					: undefined,
			wgObfuscatorListenPort:
				row.wgObfuscatorListenPort != null
					? Number(row.wgObfuscatorListenPort ?? row.WgObfuscatorListenPort)
					: undefined,
			udp2rawListenPort:
				row.udp2rawListenPort != null
					? Number(row.udp2rawListenPort ?? row.Udp2rawListenPort)
					: undefined,
			...parseVpnBillingSummaryFields(row),
		});
	}
	return out;
}

export function vpnDownloadWireGuardFilename(profile?: VpnProfile | 'egress' | ''): string {
	if (profile === 'split') return VPN_DOWNLOAD_WG_SPLIT;
	if (profile === 'egress') return VPN_DOWNLOAD_WG_EGRESS;
	return VPN_DOWNLOAD_WG_FULL;
}

export function vpnDownloadTransportFilename(
	obfuscation: VpnObfuscation,
	source: VpnConnectSource,
): string | undefined {
	switch (obfuscation) {
		case 'shadowsocks':
			return source === 'egress' ? VPN_DOWNLOAD_SS_EGRESS : VPN_DOWNLOAD_SS_LOCAL;
		case 'wg_obfuscator':
			return VPN_DOWNLOAD_WG_OBFUSC;
		case 'lwo':
			return VPN_DOWNLOAD_LWO_CLIENT;
		case 'udp2raw':
			return VPN_DOWNLOAD_UDP2RAW;
		default:
			return undefined;
	}
}

export function resolveTransportBundle(
	bundle: VpnClientBundle,
	source: VpnConnectSource = 'admin',
): VpnTransportBundle | undefined {
	const text = (bundle.transportConfigText ?? bundle.shadowsocksLocalConfigText ?? '').trim();
	if (!text) return undefined;
	const obfuscation = bundle.obfuscation ?? 'none';
	const filename =
		bundle.transportFilename?.trim() ||
		bundle.shadowsocksLocalFilename?.trim() ||
		vpnDownloadTransportFilename(obfuscation, source) ||
		'cont-transport.conf';
	return {text, filename};
}

export function wireGuardConfigTextFromBundle(bundle: VpnClientBundle): string {
	return (bundle.wireGuardConfigText ?? bundle.configText ?? '').trim();
}
