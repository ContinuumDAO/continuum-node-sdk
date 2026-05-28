import fs from 'node:fs';
import path from 'node:path';
import {bootstrapKeyDir, expandHome, MANAGEMENT_KEYS_DIR} from './paths.js';

const BOOTSTRAP_SEED_FILE = 'ed25519_private.hex';

export type DiscoveredKey = {
	id: string;
	label: string;
	path: string;
	kind: 'bootstrap' | 'added';
};

export function discoverBootstrapKey(
	mpcConfigPath: string,
): DiscoveredKey | undefined {
	const dir = bootstrapKeyDir(mpcConfigPath);
	const seedPath = path.join(dir, BOOTSTRAP_SEED_FILE);

	if (fs.existsSync(seedPath)) {
		return {
			id: 'bootstrap',
			label: 'bootstrap (mpc-config)',
			path: seedPath,
			kind: 'bootstrap',
		};
	}

	if (!fs.existsSync(dir)) {
		return undefined;
	}

	const entries = fs.readdirSync(dir);
	const pemOrHex = entries.find(
		name =>
			name.includes('private') ||
			name.endsWith('.pem') ||
			name.endsWith('.hex'),
	);

	if (!pemOrHex) {
		return undefined;
	}

	const keyPath = path.join(dir, pemOrHex);
	return {
		id: 'bootstrap',
		label: `bootstrap (mpc-config / ${pemOrHex})`,
		path: keyPath,
		kind: 'bootstrap',
	};
}

/** Bootstrap seed symlinked into management_keys (mpc-config process_config.sh). */
export function discoverBootstrapKeyInManagementKeys(
	managementKeysDir = MANAGEMENT_KEYS_DIR,
): DiscoveredKey | undefined {
	const seedPath = path.join(managementKeysDir, BOOTSTRAP_SEED_FILE);
	if (!fs.existsSync(seedPath) || !fs.statSync(seedPath).isFile()) {
		return undefined;
	}

	return {
		id: 'bootstrap',
		label: 'bootstrap (management_keys)',
		path: seedPath,
		kind: 'bootstrap',
	};
}

export function discoverAddedKeys(
	managementKeysDir = MANAGEMENT_KEYS_DIR,
): DiscoveredKey[] {
	if (!fs.existsSync(managementKeysDir)) {
		return [];
	}

	const keys: DiscoveredKey[] = [];
	const pattern = /^added_key_(\d+)$/;

	for (const name of fs.readdirSync(managementKeysDir)) {
		const match = pattern.exec(name);
		if (!match || name.endsWith('.pub')) {
			continue;
		}

		const keyPath = path.join(managementKeysDir, name);
		if (!fs.statSync(keyPath).isFile()) {
			continue;
		}

		keys.push({
			id: name,
			label: `${name} (~/.mpa/management_keys)`,
			path: keyPath,
			kind: 'added',
		});
	}

	return keys.sort((a, b) =>
		a.id.localeCompare(b.id, undefined, {numeric: true}),
	);
}

export function discoverKeys(
	mpcConfigPath: string,
	options?: {managementKeysDir?: string},
): DiscoveredKey[] {
	const result: DiscoveredKey[] = [];
	const bootstrap =
		discoverBootstrapKey(mpcConfigPath) ??
		discoverBootstrapKeyInManagementKeys(options?.managementKeysDir);
	if (bootstrap) {
		result.push(bootstrap);
	}

	result.push(...discoverAddedKeys(options?.managementKeysDir));
	return result;
}

export function resolveKeyPath(
	defaultKey: string,
	defaultKeyPath: string | null,
	mpcConfigPath: string,
): string | undefined {
	if (defaultKeyPath) {
		const expanded = expandHome(defaultKeyPath);
		return fs.existsSync(expanded) ? expanded : undefined;
	}

	const keys = discoverKeys(mpcConfigPath);
	return keys.find(k => k.id === defaultKey)?.path;
}
