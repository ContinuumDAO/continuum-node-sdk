import {zeroAddress} from 'viem';
import {buildManagementUrl} from '../../api/management-api.js';
import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../../core/result.js';
import {enrichMultisignContext} from './input-adapter.js';
import {
	isUniswapLimitOrderKeyTool,
	UNISWAP_V4_FETCH_LIMIT_ORDERS_TOOL_NAME,
	UNISWAP_V4_LIMIT_ORDER_QUOTE_TOOL_NAME,
} from './uniswap-limit-order-input.js';

export const UNISWAP_V4_QUOTE_TOOL_NAME = 'ctm_uniswap_v4_quote';

const MULTISIGN_ENRICHMENT_KEYS = [
	'keyGenId',
	'executorAddress',
	'rpcUrl',
	'chainDetail',
	'useCustomGas',
	'customGasChainDetails',
] as const;

function managementNodeBaseUrl(config: NodeSdkConfig): string {
	return buildManagementUrl(config, '').replace(/\/$/, '');
}

function isBlank(value: unknown): boolean {
	return typeof value !== 'string' || !value.trim();
}

/** Match node-app native ETH: Trade API expects zero address + x-erc20eth-enabled. */
function normalizeNativeTokenIn(tokenIn: unknown): unknown {
	if (typeof tokenIn !== 'string') {
		return tokenIn;
	}
	const trimmed = tokenIn.trim();
	if (!trimmed) {
		return tokenIn;
	}
	const lower = trimmed.toLowerCase();
	if (
		lower === 'eth' ||
		lower === 'native' ||
		lower === 'native_eth' ||
		lower === zeroAddress.toLowerCase()
	) {
		return zeroAddress;
	}
	return tokenIn;
}

function resolveKeyGenId(adapted: Record<string, unknown>): string | undefined {
	if (typeof adapted.keyGenId === 'string' && adapted.keyGenId.trim()) {
		return adapted.keyGenId.trim();
	}
	if (typeof adapted.keyGen === 'string' && adapted.keyGen.trim()) {
		return adapted.keyGen.trim();
	}
	return undefined;
}

async function resolveUniswapSwapperFromKeyGen(
	config: NodeSdkConfig,
	adapted: Record<string, unknown>,
	defaultChainId?: unknown,
): Promise<SdkResult<Record<string, unknown>>> {
	const keyGenId = resolveKeyGenId(adapted);
	const swapperProvided =
		typeof adapted.swapper === 'string' && adapted.swapper.trim();

	if (keyGenId && !swapperProvided) {
		const enriched = await enrichMultisignContext(config, {
			keyGenId,
			chainId: adapted.chainId ?? defaultChainId,
		});
		if (!enriched.ok) {
			return enriched;
		}
		adapted.swapper = enriched.data.executorAddress;
		adapted.keyGen = keyGenId;
		if (adapted.chainId == null) {
			adapted.chainId = enriched.data.chainId;
		}
	}

	if (typeof adapted.keyGen === 'object' && adapted.keyGen !== null) {
		delete adapted.keyGen;
	}
	if (isBlank(adapted.swapper) && typeof adapted.executorAddress === 'string') {
		adapted.swapper = adapted.executorAddress.trim();
	}

	const keyGenStr = resolveKeyGenId(adapted);
	if (keyGenStr && isBlank(adapted.swapper)) {
		adapted.managementNodeUrl = managementNodeBaseUrl(config);
		adapted.keyGen = keyGenStr;
	} else if (keyGenStr) {
		adapted.keyGen = keyGenStr;
	}

	for (const key of MULTISIGN_ENRICHMENT_KEYS) {
		delete adapted[key];
	}

	return {ok: true, data: adapted};
}

/**
 * Align MCP quote input with continuumdao-node-app POST /api/uniswap/quote:
 * permit2Disabled true, slippage 0.5, keyGenId → swapper, managementNodeUrl from config.
 */
export async function adaptUniswapQuoteMcpInput(
	config: NodeSdkConfig,
	toolName: string,
	input: Record<string, unknown>,
): Promise<SdkResult<Record<string, unknown>>> {
	if (toolName === UNISWAP_V4_LIMIT_ORDER_QUOTE_TOOL_NAME) {
		const adapted: Record<string, unknown> = {...input};
		adapted.tokenIn = normalizeNativeTokenIn(adapted.tokenIn);
		return resolveUniswapSwapperFromKeyGen(config, adapted, 1);
	}

	if (toolName === UNISWAP_V4_FETCH_LIMIT_ORDERS_TOOL_NAME) {
		return resolveUniswapSwapperFromKeyGen(config, {...input}, 1);
	}

	if (toolName !== UNISWAP_V4_QUOTE_TOOL_NAME) {
		return {ok: true, data: input};
	}

	const adapted: Record<string, unknown> = {...input};
	adapted.tokenIn = normalizeNativeTokenIn(adapted.tokenIn);

	if (adapted.permit2Disabled !== true && adapted.permit2Disabled !== false) {
		adapted.permit2Disabled = true;
	}

	if (
		(adapted.slippage === undefined ||
			adapted.slippage === null ||
			String(adapted.slippage).trim() === '') &&
		adapted.permit2Disabled === true
	) {
		adapted.slippage = 0.5;
	}

	return resolveUniswapSwapperFromKeyGen(config, adapted);
}

export function isUniswapQuoteTool(toolName: string): boolean {
	return (
		toolName === UNISWAP_V4_QUOTE_TOOL_NAME || isUniswapLimitOrderKeyTool(toolName)
	);
}
