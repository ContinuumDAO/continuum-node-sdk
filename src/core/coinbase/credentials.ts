import type {NodeSdkConfig} from '../../config/schema.js';
import {readTrustedVariable} from '../agent/trusted-variables.js';

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

/** Resolve optional CDP credentials from the Variables store. Never read from process.env. */
export async function resolveCoinbaseCdpCredentials(
	config?: NodeSdkConfig,
): Promise<CoinbaseCdpCredentials | undefined> {
	const name = (await readTrustedVariable(COINBASE_CDP_API_KEY_NAME_ENV, config)) ?? '';
	const secret = (await readTrustedVariable(COINBASE_CDP_API_PRIVATE_KEY_ENV, config)) ?? '';
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
