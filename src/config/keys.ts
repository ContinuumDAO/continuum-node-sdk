import fs from 'node:fs';
import path from 'node:path';
import {
	addedKeysDir,
	bootstrapKeyDir,
	expandHome,
	MANAGEMENT_KEYS_DIR,
} from './paths.js';

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
			label: 'bootstrap (bootstrap_key/)',
			path: seedPath,
			kind: 'bootstrap',
		};
	}

	if (!fs.existsSync(dir)) {
		return undefined;
	}

	const entries = fs
		.readdirSync(dir)
		.filter(name => {
			if (name.endsWith('.pub')) {
				return false;
			}
			const fullPath = path.join(dir, name);
			return fs.statSync(fullPath).isFile();
		})
		.sort((a, b) => a.localeCompare(b));

	const pemOrHex = entries.find(
		name =>
			name.includes('private') ||
			name.endsWith('.pem') ||
			name.endsWith('.hex'),
	);
	const chosen = pemOrHex ?? entries[0];
	if (!chosen) {
		return undefined;
	}

	const keyPath = path.join(dir, chosen);
	return {
		id: 'bootstrap',
		label: `bootstrap (mpc-config / ${chosen})`,
		path: keyPath,
		kind: 'bootstrap',
	};
}

/** Legacy: bootstrap seed hard-linked into added_keys (removed from mpc-config; prefer bootstrap_key/). */
export function discoverBootstrapKeyInAddedKeys(
	addedKeysDirectory = MANAGEMENT_KEYS_DIR,
): DiscoveredKey | undefined {
	const seedPath = path.join(addedKeysDirectory, BOOTSTRAP_SEED_FILE);
	if (!fs.existsSync(seedPath) || !fs.statSync(seedPath).isFile()) {
		return undefined;
	}

	return {
		id: 'bootstrap',
		label: 'bootstrap (added_keys)',
		path: seedPath,
		kind: 'bootstrap',
	};
}

export function discoverAddedKeys(
	addedKeysDirectory = MANAGEMENT_KEYS_DIR,
): DiscoveredKey[] {
	if (!fs.existsSync(addedKeysDirectory)) {
		return [];
	}

	const keys: DiscoveredKey[] = [];
	const pattern = /^added_key_(\d+)$/;

	for (const name of fs.readdirSync(addedKeysDirectory)) {
		const match = pattern.exec(name);
		if (!match || name.endsWith('.pub')) {
			continue;
		}

		const keyPath = path.join(addedKeysDirectory, name);
		if (!fs.statSync(keyPath).isFile()) {
			continue;
		}

		keys.push({
			id: name,
			label: `${name} (added_keys)`,
			path: keyPath,
			kind: 'added',
		});
	}

	return keys.sort((a, b) =>
		a.id.localeCompare(b.id, undefined, {numeric: true}),
	);
}

/** @deprecated Use `addedKeysDir` option name; `managementKeysDir` is kept for compatibility. */
export const discoverBootstrapKeyInManagementKeys = discoverBootstrapKeyInAddedKeys;

export function discoverKeys(
	mpcConfigPath: string,
	options?: {addedKeysDir?: string; managementKeysDir?: string},
): DiscoveredKey[] {
	const result: DiscoveredKey[] = [];
	const addedKeysDirectory =
		options?.addedKeysDir ??
		options?.managementKeysDir ??
		addedKeysDir(mpcConfigPath);
	const bootstrap =
		discoverBootstrapKey(mpcConfigPath) ??
		discoverBootstrapKeyInAddedKeys(addedKeysDirectory);
	if (bootstrap) {
		result.push(bootstrap);
	}

	result.push(...discoverAddedKeys(addedKeysDirectory));
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
