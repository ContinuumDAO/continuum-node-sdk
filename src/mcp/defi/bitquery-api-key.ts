import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import {getEnvironmentVariable} from '../../core/agent/environment-variables.js';
import type {NodeSdkConfig} from '../../config/schema.js';

/** Node env var for Bitquery GraphQL (required for Robinhood Chain Uniswap V4 OHLCV). */
export const BITQUERY_API_KEY_ENV = 'BITQUERY_API_KEY';

export const BITQUERY_API_KEY_SIGNUP_URL = 'https://account.bitquery.io/';

export const BITQUERY_API_KEY_DOCS_URL = 'https://bitquery.io/blockchains/robinhood-chain-api';

export function isBitqueryAuthOrRateLimitError(message: string): boolean {
	const m = message.toLowerCase();
	const mentionsBitquery =
		m.includes('bitquery') || m.includes('bitquery_api_key') || m.includes('robinhood chain ohlcv');
	if (!mentionsBitquery) {
		return false;
	}
	return (
		m.includes('429') ||
		m.includes('rate limit') ||
		m.includes('too many requests') ||
		m.includes('auth') ||
		m.includes('unauthorized') ||
		m.includes('forbidden') ||
		m.includes('api key') ||
		m.includes('access token') ||
		m.includes('required')
	);
}

export function bitqueryApiKeyVariablesHint(): string {
	return [
		`Set \`${BITQUERY_API_KEY_ENV}\` in Node → AI Agent → Variables (+ Add: paste the key as the value).`,
		`Get an API key at ${BITQUERY_API_KEY_SIGNUP_URL}`,
	].join(' ');
}

export function bitqueryAuthErrorMessage(baseError: string): string {
	return `${baseError}\n\nBitquery auth or rate limit — ${bitqueryApiKeyVariablesHint()}`;
}

export const UNISWAP_V4_OHLCV_TOOL_NAME = 'ctm_uniswap_v4_fetch_ohlcv';

export async function resolveBitqueryApiKeyFromNode(
	config: NodeSdkConfig,
): Promise<string | undefined> {
	const result = await getEnvironmentVariable(config, {name: BITQUERY_API_KEY_ENV});
	if (!result.ok) {
		return undefined;
	}
	const value = result.data.value.trim();
	return value || undefined;
}

/** Inject node Variables into process.env for the duration of an OHLCV tool call. */
export async function withBitqueryApiKeyFromNode<T>(
	config: NodeSdkConfig,
	toolName: string,
	run: () => Promise<T>,
): Promise<T> {
	if (toolName !== UNISWAP_V4_OHLCV_TOOL_NAME) {
		return run();
	}
	const key = await resolveBitqueryApiKeyFromNode(config);
	if (!key) {
		return run();
	}
	const previous = process.env[BITQUERY_API_KEY_ENV];
	process.env[BITQUERY_API_KEY_ENV] = key;
	try {
		return await run();
	} finally {
		if (previous?.trim()) {
			process.env[BITQUERY_API_KEY_ENV] = previous;
		} else {
			delete process.env[BITQUERY_API_KEY_ENV];
		}
	}
}

export function formatBitqueryToolErrorIfAuth(
	toolName: string,
	message: string,
): string | null {
	if (toolName !== UNISWAP_V4_OHLCV_TOOL_NAME) {
		return null;
	}
	if (!isBitqueryAuthOrRateLimitError(message)) {
		return null;
	}
	if (message.includes(BITQUERY_API_KEY_ENV) && message.includes('Variables')) {
		return message;
	}
	return bitqueryAuthErrorMessage(message);
}

export function bitqueryAuthCallToolResult(baseError: string): CallToolResult {
	return {
		content: [
			{
				type: 'text',
				text: bitqueryAuthErrorMessage(baseError),
			},
		],
		isError: true,
	};
}
