import type {AnySchema} from '@modelcontextprotocol/sdk/server/zod-compat.js';
import {normalizeObjectSchema} from '@modelcontextprotocol/sdk/server/zod-compat.js';
import {MCP_LOOSE_OBJECT_SCHEMA} from '../tool-utils.js';
import {UNISWAP_V4_API_KEY_TOOL_NAMES} from './uniswap-api-key.js';
import {VENICE_API_KEY_TOOL_NAMES} from './venice-api-key.js';
import {UNISWAP_V4_QUOTE_TOOL_NAME} from './uniswap-quote-input.js';
import {
	UNISWAP_V4_LP_LIST_POSITIONS_TOOL_NAME,
	UNISWAP_V4_LP_PREP_TOOL_NAMES,
} from './uniswap-liquidity-input.js';
import {
	UNISWAP_V4_REGISTER_POSITION_FROM_MINT_TX_TOOL_NAME,
	UNISWAP_V4_REGISTER_POSITION_NFT_TOOL_NAME,
} from './uniswap-liquidity-registry.js';
import {isAaveV4MultisignTool} from './aave-v4-input.js';

type DefiToolSchemaSource = {
	name: string;
	inputZod: AnySchema;
	outputZod: AnySchema;
};

type ZodObjectLike = AnySchema & {
	omit: (keys: Record<string, true>) => AnySchema;
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

function zodEffectsInner(schema: AnySchema): AnySchema | null {
	const def = (schema as {_def?: {schema?: AnySchema; innerType?: AnySchema}})._def;
	return def?.schema ?? def?.innerType ?? null;
}

/**
 * Unwrap z.preprocess / .refine / .transform (ZodEffects) to the inner ZodObject.
 * MCP tools/list uses normalizeObjectSchema, which returns undefined for ZodEffects
 * and exposes empty properties:{} — agents then cannot pass tool arguments.
 */
export function unwrapZodEffectsToObject(schema: AnySchema): ZodObjectLike | null {
	let current: AnySchema = schema;
	for (let depth = 0; depth < 12; depth++) {
		if (isZodObject(current)) {
			return current;
		}
		const inner = zodEffectsInner(current);
		if (!inner) {
			break;
		}
		current = inner;
	}
	return isZodObject(current) ? current : null;
}

function hasMultisignEnrichmentShape(schema: ZodObjectLike): boolean {
	// Uniswap quote schemas expose keyGen as string id — not server enrichment fields.
	return (
		'keyGen' in schema.shape &&
		'rpcUrl' in schema.shape &&
		'executorAddress' in schema.shape
	);
}

function partialExistingShapeKeys(
	schema: ZodObjectLike,
	keys: Record<string, true>,
): ZodObjectLike {
	const existing: Record<string, true> = {};
	for (const key of Object.keys(keys)) {
		if (key in schema.shape) {
			existing[key] = true;
		}
	}
	if (Object.keys(existing).length === 0) {
		return schema;
	}
	try {
		return schema.partial(existing) as ZodObjectLike;
	} catch {
		// Zod 4 object refinements or cross-version schema objects — keep shape as-is.
		return schema;
	}
}

/**
 * MCP registration schema derived from ctm-mpc-defi Zod (same package instance only).
 * Never .extend() with SDK zod — that breaks parse (keyValidator._parse is not a function).
 */
export function defiToolInputSchema(tool: DefiToolSchemaSource): AnySchema {
	const unwrapped = unwrapZodEffectsToObject(tool.inputZod);
	if (!unwrapped) {
		return tool.inputZod;
	}

	let zodObject = unwrapped;

	if (UNISWAP_V4_API_KEY_TOOL_NAMES.has(tool.name)) {
		zodObject = zodObject.omit({uniswapApiKey: true}) as typeof zodObject;
	}

	if (VENICE_API_KEY_TOOL_NAMES.has(tool.name)) {
		zodObject = zodObject.omit({apiKey: true}) as typeof zodObject;
	}

	if (hasMultisignEnrichmentShape(zodObject)) {
		// Agent passes keyGenId; handler enriches to keyGen/rpcUrl/executorAddress/chainDetail.
		zodObject = partialExistingShapeKeys(
			zodObject,
			MULTISIGN_ENRICHMENT_OPTIONAL_KEYS,
		).passthrough() as typeof zodObject;
		if (isAaveV4MultisignTool(tool.name) && 'spoke' in zodObject.shape) {
			// Server resolves spoke from Aave v4 API (marketId + underlying).
			zodObject = zodObject.partial({spoke: true}) as typeof zodObject;
		}
	} else if (
		tool.name === UNISWAP_V4_QUOTE_TOOL_NAME ||
		UNISWAP_V4_LP_PREP_TOOL_NAMES.has(tool.name) ||
		tool.name === UNISWAP_V4_LP_LIST_POSITIONS_TOOL_NAME ||
		tool.name === UNISWAP_V4_REGISTER_POSITION_NFT_TOOL_NAME ||
		tool.name === UNISWAP_V4_REGISTER_POSITION_FROM_MINT_TX_TOOL_NAME
	) {
		zodObject = zodObject.passthrough() as typeof zodObject;
	}

	return zodObject;
}

/**
 * MCP output registration — package `z.record()` outputs (e.g. quote JSON) are not
 * object schemas; normalizeObjectSchema returns undefined and output validation
 * crashes (reading '_zod' of undefined). Handler still validates via parseMcpToolOutput.
 */
export function defiToolOutputSchema(tool: DefiToolSchemaSource): AnySchema {
	if (!normalizeObjectSchema(tool.outputZod as AnySchema)) {
		return MCP_LOOSE_OBJECT_SCHEMA as AnySchema;
	}
	return tool.outputZod;
}
