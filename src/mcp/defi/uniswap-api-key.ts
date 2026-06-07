import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import {getEnvironmentVariable} from '../../core/agent/environment-variables.js';
import type {NodeSdkConfig} from '../../config/schema.js';

export const UNISWAP_API_KEY_ENV = 'UNISWAP_API_KEY';

export const UNISWAP_API_KEY_SIGNUP_URL =
	'https://developers.uniswap.org/dashboard/welcome';

/** Uniswap V4 MCP tools that call the Trade / LP API and require an x-api-key. */
export const UNISWAP_V4_API_KEY_TOOL_NAMES = new Set([
	'ctm_uniswap_v4_quote',
	'ctm_uniswap_v4_create_swap',
	'ctm_uniswap_v4_lp_create_position',
	'ctm_uniswap_v4_lp_increase',
	'ctm_uniswap_v4_lp_decrease',
	'ctm_uniswap_v4_lp_collect',
]);

export function missingUniswapApiKeyCallToolResult(): CallToolResult {
	return {
		content: [
			{
				type: 'text',
				text: [
					'Uniswap V4 Trade API requires an API key.',
					`Add environment variable ${UNISWAP_API_KEY_ENV} in the Node page → AI Agent → Variables tab (add_environment_variable MCP tool).`,
					`Create a key at ${UNISWAP_API_KEY_SIGNUP_URL}`,
					`Check configuration with list_environment_variables — do not pass uniswapApiKey in tool input.`,
				].join('\n'),
			},
		],
		isError: true,
	};
}

export async function resolveUniswapApiKey(
	config: NodeSdkConfig,
): Promise<string | undefined> {
	const result = await getEnvironmentVariable(config, {
		name: UNISWAP_API_KEY_ENV,
	});
	if (!result.ok) {
		return undefined;
	}
	const value = result.data.value.trim();
	return value || undefined;
}

/** Whether UNISWAP_API_KEY is set (value is never returned). */
export async function isUniswapApiKeyConfigured(
	config: NodeSdkConfig,
): Promise<boolean> {
	return (await resolveUniswapApiKey(config)) !== undefined;
}

export async function injectUniswapApiKeyForTool(
	config: NodeSdkConfig,
	toolName: string,
	input: Record<string, unknown>,
): Promise<
	{ok: true; input: Record<string, unknown>} | {ok: false; result: CallToolResult}
> {
	if (!UNISWAP_V4_API_KEY_TOOL_NAMES.has(toolName)) {
		return {ok: true, input};
	}

	const apiKey = await resolveUniswapApiKey(config);
	if (!apiKey) {
		return {ok: false, result: missingUniswapApiKeyCallToolResult()};
	}

	return {
		ok: true,
		input: {
			...input,
			uniswapApiKey: apiKey,
		},
	};
}
