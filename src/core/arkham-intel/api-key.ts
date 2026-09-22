import {getEnvironmentVariable} from '../agent/environment-variables.js';
import type {NodeSdkConfig} from '../../config/schema.js';

export const ARKHAM_API_KEY_ENV = 'ARKHAM_API_KEY';
export const ARKHAM_API_KEY_HEADER = 'API-Key';
export const ARKHAM_API_BASE_URL = 'https://api.arkm.com';
export const ARKHAM_API_DOCS_URL = 'https://arkm.com/api/docs';
export const ARKHAM_API_ACCESS_URL = 'https://arkm.com/api';
export const ARKHAM_API_LLMS_URL = 'https://arkm.com/llms.txt';

export function getArkhamApiKeyFromEnv(): string | undefined {
	const key = process.env[ARKHAM_API_KEY_ENV]?.trim();
	return key || undefined;
}

export function missingArkhamApiKeyReason(): string {
	return [
		'Arkham Intel API key required.',
		`Add Variable ${ARKHAM_API_KEY_ENV} in Node → AI Agent → Variables (add_environment_variable).`,
		`Request API access at ${ARKHAM_API_ACCESS_URL}, then create a key under Settings → API Keys.`,
		`Auth header is ${ARKHAM_API_KEY_HEADER} against ${ARKHAM_API_BASE_URL}.`,
		'Verify with list_environment_variables (name and envConfigured only — never pass the key in tool input).',
	].join('\n');
}

/** Agent Variable first, then process.env fallback. */
export async function resolveArkhamApiKey(
	config: NodeSdkConfig,
): Promise<string | undefined> {
	const result = await getEnvironmentVariable(config, {
		name: ARKHAM_API_KEY_ENV,
	});
	if (result.ok) {
		const value = result.data.value.trim();
		if (value) {
			return value;
		}
	}
	return getArkhamApiKeyFromEnv();
}
