import type { CallToolResult } from "@modelcontextprotocol/server";
import type {NodeSdkConfig} from '../../config/schema.js';
import {readTrustedVariable} from '../../core/agent/trusted-variables.js';

/** Node env var for The Graph decentralized gateway (optional but recommended for OHLCV). */
export const THE_GRAPH_API_KEY_ENV = 'THE_GRAPH_API_KEY';

export const THE_GRAPH_API_KEY_SIGNUP_URL = 'https://thegraph.com/studio/apikeys/';

export const THE_GRAPH_API_KEY_DOCS_URL =
	'https://thegraph.com/docs/en/subgraphs/querying/managing-api-keys/';

export function isTheGraphRateLimitOrAuthError(message: string): boolean {
	const m = message.toLowerCase();
	return (
		m.includes('429') ||
		m.includes('rate limit') ||
		m.includes('too many requests') ||
		m.includes('auth error') ||
		m.includes('missing authorization') ||
		m.includes('unauthorized')
	);
}

export function theGraphApiKeyVariablesHint(): string {
	return [
		`Set \`${THE_GRAPH_API_KEY_ENV}\` in Node → AI Agent → Variables (+ Add: paste the key as the value).`,
		`Get a free API key at ${THE_GRAPH_API_KEY_SIGNUP_URL}`,
	].join(' ');
}

export function theGraphRateLimitErrorMessage(baseError: string): string {
	return `${baseError}\n\nThe Graph rate limit or auth issue — ${theGraphApiKeyVariablesHint()}`;
}

export const UNISWAP_V4_OHLCV_TOOL_NAME = 'ctm_uniswap_v4_fetch_ohlcv';

export async function resolveTheGraphApiKeyFromNode(
	config: NodeSdkConfig,
): Promise<string | undefined> {
	return readTrustedVariable(THE_GRAPH_API_KEY_ENV, config);
}

export function formatTheGraphToolErrorIfRateLimited(
	toolName: string,
	message: string,
): string | null {
	if (toolName !== UNISWAP_V4_OHLCV_TOOL_NAME) {
		return null;
	}
	if (!isTheGraphRateLimitOrAuthError(message)) {
		return null;
	}
	if (message.includes(THE_GRAPH_API_KEY_ENV) && message.includes('Variables')) {
		return message;
	}
	return theGraphRateLimitErrorMessage(message);
}

export function theGraphRateLimitCallToolResult(baseError: string): CallToolResult {
	return {
		content: [
			{
				type: 'text',
				text: theGraphRateLimitErrorMessage(baseError),
			},
		],
		isError: true,
	};
}

export function theGraphApiKeySetupHintText(): string {
	return theGraphApiKeyVariablesHint();
}
