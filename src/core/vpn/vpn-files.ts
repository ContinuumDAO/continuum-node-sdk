import {promises as fs} from 'node:fs';
import path from 'node:path';
import {resolveUserFolderPath} from '../../config/paths.js';
import type {
	VpnClientBundle,
	VpnConnectSource,
	VpnProfile,
} from './vpn-parse.js';
import {
	resolveTransportBundle,
	vpnDownloadWireGuardFilename,
	wireGuardConfigTextFromBundle,
} from './vpn-parse.js';

export type SavedVpnClientFiles = {
	userFolder: string;
	wireGuardPath: string;
	transportPath?: string;
	wireGuardFilename: string;
	transportFilename?: string;
	setupInstructions?: string;
};

export async function saveVpnClientBundleToUserFolder(
	bundle: VpnClientBundle,
	source: VpnConnectSource,
	options: {
		userFolder?: string;
		profile?: VpnProfile;
	} = {},
): Promise<SavedVpnClientFiles> {
	const configText = wireGuardConfigTextFromBundle(bundle);
	if (!configText) {
		throw new Error('Empty VPN client config.');
	}

	const userFolder = resolveUserFolderPath(options.userFolder);
	await fs.mkdir(userFolder, {recursive: true});

	const profile = bundle.profile ?? options.profile;
	const wireGuardFilename =
		bundle.filename?.trim() ||
		vpnDownloadWireGuardFilename(source === 'egress' ? 'egress' : profile);
	const wireGuardPath = path.join(userFolder, wireGuardFilename);
	await fs.writeFile(wireGuardPath, configText, {mode: 0o644});

	const transport = resolveTransportBundle(bundle, source);
	let transportPath: string | undefined;
	if (transport) {
		transportPath = path.join(userFolder, transport.filename);
		await fs.writeFile(transportPath, transport.text, {mode: 0o644});
	}

	return {
		userFolder,
		wireGuardPath,
		transportPath,
		wireGuardFilename,
		transportFilename: transport?.filename,
		setupInstructions: bundle.setupInstructions,
	};
}
