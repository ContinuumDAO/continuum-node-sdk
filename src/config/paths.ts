import path from 'node:path';
import os from 'node:os';

export const MPA_HOME_DIR = path.join(os.homedir(), '.mpa');
export const ADDED_KEYS_DIR_NAME = 'added_keys';
/** Default agent layout: ~/.mpa/added_keys (Docker compose uses `$KEY_ROOT/added_keys`, e.g. /app/added_keys). */
export const MANAGEMENT_KEYS_DIR = path.join(MPA_HOME_DIR, ADDED_KEYS_DIR_NAME);

/** POST /addManagementKey key files under the mpc-config project (or KEY_ROOT in Docker). */
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
