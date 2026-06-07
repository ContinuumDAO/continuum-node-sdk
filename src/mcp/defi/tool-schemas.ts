import type {AnySchema} from '@modelcontextprotocol/sdk/server/zod-compat.js';
import {z} from 'zod';
import {UNISWAP_V4_API_KEY_TOOL_NAMES} from './uniswap-api-key.js';
import {UNISWAP_V4_QUOTE_TOOL_NAME} from './uniswap-quote-input.js';

type DefiToolSchemaSource = {
	name: string;
	inputZod: AnySchema;
	outputZod: AnySchema;
};

function isZodObject(
	schema: AnySchema,
): schema is AnySchema & {
	omit: (keys: {uniswapApiKey: true}) => AnySchema;
	extend: (shape: Record<string, AnySchema>) => AnySchema;
	shape: Record<string, unknown>;
} {
	return (
		typeof (schema as {omit?: unknown}).omit === 'function' &&
		typeof (schema as {extend?: unknown}).extend === 'function' &&
		typeof (schema as {shape?: unknown}).shape === 'object'
	);
}

/** MCP registration schema — omits server-injected secrets from tool input. */
export function defiToolInputSchema(tool: DefiToolSchemaSource): AnySchema {
	if (isZodObject(tool.inputZod)) {
		let zodObject = tool.inputZod;
		if (UNISWAP_V4_API_KEY_TOOL_NAMES.has(tool.name)) {
			zodObject = zodObject.omit({uniswapApiKey: true}) as typeof zodObject;
		}
		if (tool.name === UNISWAP_V4_QUOTE_TOOL_NAME) {
			zodObject = zodObject.extend({
				keyGenId: z
					.string()
					.min(1)
					.optional()
					.describe(
						'KeyGen id from fetch_key_gen_result; resolves swapper on this node (same as other DeFi tools).',
					),
			}) as typeof zodObject;
		}
		return zodObject;
	}
	return tool.inputZod;
}

export function defiToolOutputSchema(tool: DefiToolSchemaSource): AnySchema {
	return tool.outputZod;
}
