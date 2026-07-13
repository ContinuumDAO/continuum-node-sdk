import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import {getEnvironmentVariable} from '../../core/agent/environment-variables.js';
import type {NodeSdkConfig} from '../../config/schema.js';

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
	const result = await getEnvironmentVariable(config, {name: THE_GRAPH_API_KEY_ENV});
	if (!result.ok) {
		return undefined;
	}
	const value = result.data.value.trim();
	return value || undefined;
}

/** Inject node Variables into process.env for the duration of an OHLCV tool call. */
export async function withTheGraphApiKeyFromNode<T>(
	config: NodeSdkConfig,
	toolName: string,
	run: () => Promise<T>,
): Promise<T> {
	if (toolName !== UNISWAP_V4_OHLCV_TOOL_NAME) {
		return run();
	}
	const key = await resolveTheGraphApiKeyFromNode(config);
	if (!key) {
		return run();
	}
	const previous = process.env[THE_GRAPH_API_KEY_ENV];
	process.env[THE_GRAPH_API_KEY_ENV] = key;
	try {
		return await run();
	} finally {
		if (previous?.trim()) {
			process.env[THE_GRAPH_API_KEY_ENV] = previous;
		} else {
			delete process.env[THE_GRAPH_API_KEY_ENV];
		}
	}
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
