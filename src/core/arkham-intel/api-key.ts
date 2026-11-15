import type {NodeSdkConfig} from '../../config/schema.js';
import {readTrustedVariable} from '../agent/trusted-variables.js';

export const ARKHAM_API_KEY_ENV = 'ARKHAM_API_KEY';
export const ARKHAM_API_KEY_HEADER = 'API-Key';
export const ARKHAM_API_BASE_URL = 'https://api.arkm.com';
export const ARKHAM_API_DOCS_URL = 'https://arkm.com/api/docs';
export const ARKHAM_API_ACCESS_URL = 'https://arkm.com/api';
export const ARKHAM_API_LLMS_URL = 'https://arkm.com/llms.txt';

export function missingArkhamApiKeyReason(): string {
	return [
		'Arkham Intel API key required.',
		`Add Variable ${ARKHAM_API_KEY_ENV} in Node → AI Agent → Variables (add_environment_variable).`,
		`Request API access at ${ARKHAM_API_ACCESS_URL}, then create a key under Settings → API Keys.`,
		`Auth header is ${ARKHAM_API_KEY_HEADER} against ${ARKHAM_API_BASE_URL}.`,
		'Verify with list_environment_variables (name and envConfigured only — never pass the key in tool input).',
	].join('\n');
}

/** Value from the Variables store. Never read from process.env. */
export async function resolveArkhamApiKey(
	config: NodeSdkConfig,
): Promise<string | undefined> {
	return readTrustedVariable(ARKHAM_API_KEY_ENV, config);
}
