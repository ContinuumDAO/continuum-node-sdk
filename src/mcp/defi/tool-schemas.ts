import type {AnySchema} from '@modelcontextprotocol/sdk/server/zod-compat.js';
import {UNISWAP_V4_API_KEY_TOOL_NAMES} from './uniswap-api-key.js';

type DefiToolSchemaSource = {
	name: string;
	inputZod: AnySchema;
	outputZod: AnySchema;
};

function isZodObject(
	schema: AnySchema,
): schema is AnySchema & {
	omit: (keys: {uniswapApiKey: true}) => AnySchema;
	shape: Record<string, unknown>;
} {
	return (
		typeof (schema as {omit?: unknown}).omit === 'function' &&
		typeof (schema as {shape?: unknown}).shape === 'object'
	);
}

/** MCP registration schema — omits server-injected secrets from tool input. */
export function defiToolInputSchema(tool: DefiToolSchemaSource): AnySchema {
	if (
		UNISWAP_V4_API_KEY_TOOL_NAMES.has(tool.name) &&
		isZodObject(tool.inputZod)
	) {
		return tool.inputZod.omit({uniswapApiKey: true});
	}
	return tool.inputZod;
}

export function defiToolOutputSchema(tool: DefiToolSchemaSource): AnySchema {
	return tool.outputZod;
}
