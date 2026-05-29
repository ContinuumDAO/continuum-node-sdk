import path from 'node:path';
import os from 'node:os';

/** Docker mpc-auth / continuum-mcp WORKDIR; host `./added_keys` and `./bootstrap_key` bind-mount here. */
export const APP_ROOT = '/app';
export const ADDED_KEYS_DIR_NAME = 'added_keys';
export const MANAGEMENT_KEYS_DIR = path.join(APP_ROOT, ADDED_KEYS_DIR_NAME);

/** POST /addManagementKey key files under mpcConfigPath (Docker: `/app/added_keys`). */
export function addedKeysDir(mpcConfigPath: string): string {
	return path.join(resolveMpcConfigPath(mpcConfigPath), ADDED_KEYS_DIR_NAME);
}

export function expandHome(filePath: string): string {
	if (filePath === '~') {
		return os.homedir();
	}

	if (filePath.startsWith('~/')) {
		return path.join(os.homedir(), filePath.slice(2));
	}

	return filePath;
}

export function resolveMpcConfigPath(configPath: string): string {
	const fromEnv = process.env['MPC_CONFIG_PATH'];
	if (fromEnv && fromEnv.length > 0) {
		return expandHome(fromEnv);
	}

	return expandHome(configPath);
}

export function bootstrapKeyDir(mpcConfigPath: string): string {
	return path.join(resolveMpcConfigPath(mpcConfigPath), 'bootstrap_key');
}

export function buildManagementBaseUrl(
	baseUrl: string,
	managementPort: number,
): string {
	const trimmed = baseUrl.replace(/\/+$/, '');
	return `${trimmed}:${managementPort}`;
}
