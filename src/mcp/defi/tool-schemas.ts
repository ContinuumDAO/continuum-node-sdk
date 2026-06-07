import type {AnySchema} from '@modelcontextprotocol/sdk/server/zod-compat.js';
import {UNISWAP_V4_API_KEY_TOOL_NAMES} from './uniswap-api-key.js';
import {UNISWAP_V4_QUOTE_TOOL_NAME} from './uniswap-quote-input.js';

type DefiToolSchemaSource = {
	name: string;
	inputZod: AnySchema;
	outputZod: AnySchema;
};

type ZodObjectLike = AnySchema & {
	omit: (keys: {uniswapApiKey: true}) => AnySchema;
	partial: (keys: Record<string, true>) => AnySchema;
	passthrough: () => AnySchema;
	shape: Record<string, unknown>;
};

/** Fields resolved server-side from keyGenId + chain registry before parseMcpToolInput. */
const MULTISIGN_ENRICHMENT_OPTIONAL_KEYS = {
	keyGen: true,
	rpcUrl: true,
	executorAddress: true,
	chainDetail: true,
} as const;

function isZodObject(schema: AnySchema): schema is ZodObjectLike {
	return (
		typeof (schema as {omit?: unknown}).omit === 'function' &&
		typeof (schema as {partial?: unknown}).partial === 'function' &&
		typeof (schema as {passthrough?: unknown}).passthrough === 'function' &&
		typeof (schema as {shape?: unknown}).shape === 'object'
	);
}

function hasMultisignEnrichmentShape(schema: ZodObjectLike): boolean {
	return 'keyGen' in schema.shape;
}

/**
 * MCP registration schema derived from ctm-mpc-defi Zod (same package instance only).
 * Never .extend() with SDK zod — that breaks parse (keyValidator._parse is not a function).
 */
export function defiToolInputSchema(tool: DefiToolSchemaSource): AnySchema {
	if (!isZodObject(tool.inputZod)) {
		return tool.inputZod;
	}

	let zodObject = tool.inputZod;

	if (UNISWAP_V4_API_KEY_TOOL_NAMES.has(tool.name)) {
		zodObject = zodObject.omit({uniswapApiKey: true}) as typeof zodObject;
	}

	if (hasMultisignEnrichmentShape(zodObject)) {
		// Agent passes keyGenId; handler enriches to keyGen/rpcUrl/executorAddress/chainDetail.
		const partial = zodObject.partial(
			MULTISIGN_ENRICHMENT_OPTIONAL_KEYS,
		) as ZodObjectLike;
		zodObject = partial.passthrough() as typeof zodObject;
	} else if (tool.name === UNISWAP_V4_QUOTE_TOOL_NAME) {
		zodObject = zodObject.passthrough() as typeof zodObject;
	}

	return zodObject;
}

export function defiToolOutputSchema(tool: DefiToolSchemaSource): AnySchema {
	return tool.outputZod;
}
