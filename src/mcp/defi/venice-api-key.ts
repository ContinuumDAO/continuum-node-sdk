import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import {getEnvironmentVariable} from '../../core/agent/environment-variables.js';
import type {NodeSdkConfig} from '../../config/schema.js';

export const VENICE_API_KEY_ENV = 'VENICE_API_KEY';

export const VENICE_API_KEY_SIGNUP_URL = 'https://venice.ai/settings/api';

/** Built-in Venice MCP tools that call the Venice HTTP API and require an API key. */
export const VENICE_API_KEY_TOOL_NAMES = new Set(['ctm_venice_list_models']);

export function missingVeniceApiKeyCallToolResult(): CallToolResult {
	return {
		content: [
			{
				type: 'text',
				text: [
					'Venice model catalog requires an API key.',
					`Add environment variable ${VENICE_API_KEY_ENV} in Node → AI Agent → Variables (Add in Variables or add_environment_variable).`,
					`Create a key at ${VENICE_API_KEY_SIGNUP_URL}`,
					'The server injects the key automatically — do not pass apiKey in tool input.',
					'Check configuration with list_environment_variables.',
				].join('\n'),
			},
		],
		isError: true,
	};
}

export async function resolveVeniceApiKey(
	config: NodeSdkConfig,
): Promise<string | undefined> {
	const result = await getEnvironmentVariable(config, {
		name: VENICE_API_KEY_ENV,
	});
	if (!result.ok) {
		return undefined;
	}
	const value = result.data.value.trim();
	return value || undefined;
}

/** Whether VENICE_API_KEY is set (value is never returned). */
export async function isVeniceApiKeyConfigured(
	config: NodeSdkConfig,
): Promise<boolean> {
	return (await resolveVeniceApiKey(config)) !== undefined;
}

export async function injectVeniceApiKeyForTool(
	config: NodeSdkConfig,
	toolName: string,
	input: Record<string, unknown>,
): Promise<
	{ok: true; input: Record<string, unknown>} | {ok: false; result: CallToolResult}
> {
	if (!VENICE_API_KEY_TOOL_NAMES.has(toolName)) {
		return {ok: true, input};
	}

	const apiKey = await resolveVeniceApiKey(config);
	if (!apiKey) {
		return {ok: false, result: missingVeniceApiKeyCallToolResult()};
	}

	const {apiKey: _ignored, ...rest} = input;
	return {
		ok: true,
		input: {
			...rest,
			apiKey,
		},
	};
}
