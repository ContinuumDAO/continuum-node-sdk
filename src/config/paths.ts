import path from 'node:path';
import os from 'node:os';

export const MPA_HOME_DIR = path.join(os.homedir(), '.mpa');
export const MANAGEMENT_KEYS_DIR = path.join(MPA_HOME_DIR, 'management_keys');

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
