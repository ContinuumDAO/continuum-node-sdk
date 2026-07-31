import {getEnvironmentVariable} from '../agent/environment-variables.js';
import type {NodeSdkConfig} from '../../config/schema.js';

export const COINBASE_CDP_API_KEY_NAME_ENV = 'COINBASE_CDP_API_KEY_NAME';
export const COINBASE_CDP_API_PRIVATE_KEY_ENV = 'COINBASE_CDP_API_PRIVATE_KEY';

export type CoinbaseCdpCredentials = {
	apiKeyName: string;
	privateKeyPem: string;
};

function normalizePrivateKey(raw: string): string {
	let key = raw.trim();
	// Variables often store PEM with literal \n escapes.
	if (key.includes('\\n') && !key.includes('\n')) {
		key = key.replace(/\\n/g, '\n');
	}
	return key;
}

/** Resolve optional CDP credentials from agent Variables (or process.env fallback). */
export async function resolveCoinbaseCdpCredentials(
	config?: NodeSdkConfig,
): Promise<CoinbaseCdpCredentials | undefined> {
	let name = '';
	let secret = '';
	if (config) {
		const nameResult = await getEnvironmentVariable(config, {
			name: COINBASE_CDP_API_KEY_NAME_ENV,
		});
		if (nameResult.ok) {
			name = nameResult.data.value.trim();
		}
		const secretResult = await getEnvironmentVariable(config, {
			name: COINBASE_CDP_API_PRIVATE_KEY_ENV,
		});
		if (secretResult.ok) {
			secret = secretResult.data.value.trim();
		}
	}
	if (!name) {
		name = (process.env[COINBASE_CDP_API_KEY_NAME_ENV] ?? '').trim();
	}
	if (!secret) {
		secret = (process.env[COINBASE_CDP_API_PRIVATE_KEY_ENV] ?? '').trim();
	}
	if (!name || !secret) {
		return undefined;
	}
	return {
		apiKeyName: name,
		privateKeyPem: normalizePrivateKey(secret),
	};
}

export async function isCoinbaseCdpConfigured(config?: NodeSdkConfig): Promise<boolean> {
	return (await resolveCoinbaseCdpCredentials(config)) !== undefined;
}
