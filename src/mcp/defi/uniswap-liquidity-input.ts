import {zeroAddress} from 'viem';
import {
	parseUniswapChainId,
	resolveUniswapV4LpExistingPoolFromKey,
	resolveUniswapV4LpPoolPreset,
} from '@continuumdao/ctm-mpc-defi/protocols/evm/uniswap-v4';
import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../../core/result.js';
import {enrichMultisignContext} from './input-adapter.js';
import {assertUniswapV4PositionNftInRegistry} from './uniswap-liquidity-registry.js';

export const UNISWAP_V4_LP_PREP_TOOL_NAMES = new Set([
	'ctm_uniswap_v4_lp_create_position',
	'ctm_uniswap_v4_lp_increase',
	'ctm_uniswap_v4_lp_decrease',
	'ctm_uniswap_v4_lp_collect',
]);

export const UNISWAP_V4_LP_LIST_POSITIONS_TOOL_NAME = 'ctm_uniswap_v4_lp_list_positions';

const LP_PREP_TOOLS_REQUIRING_REGISTRY_NFT = new Map<string, 'nftTokenId' | 'tokenId'>([
	['ctm_uniswap_v4_lp_increase', 'nftTokenId'],
	['ctm_uniswap_v4_lp_decrease', 'nftTokenId'],
	['ctm_uniswap_v4_lp_collect', 'tokenId'],
]);

const MULTISIGN_ENRICHMENT_KEYS = [
	'keyGenId',
	'executorAddress',
	'rpcUrl',
	'chainDetail',
	'useCustomGas',
	'customGasChainDetails',
] as const;

function normalizeNativeTokenAddress(token: unknown): unknown {
	if (typeof token !== 'string') return token;
	const trimmed = token.trim();
	if (!trimmed) return token;
	const lower = trimmed.toLowerCase();
	if (
		lower === 'eth' ||
		lower === 'native' ||
		lower === 'native_eth' ||
		lower === zeroAddress.toLowerCase()
	) {
		return zeroAddress;
	}
	return token;
}

function resolveLpCreatePool(input: Record<string, unknown>): SdkResult<Record<string, unknown>> {
	const chainIdRaw = input.chainId;
	if (chainIdRaw == null) {
		return {ok: true, data: input};
	}
	let chainId: number;
	try {
		chainId = parseUniswapChainId(chainIdRaw as string | number);
	} catch {
		return {ok: true, data: input};
	}

	const out = {...input};
	const poolPreset =
		typeof out.poolPreset === 'string' && out.poolPreset.trim()
			? out.poolPreset.trim()
			: undefined;
	delete out.poolPreset;

	if (poolPreset) {
		try {
			const preset = resolveUniswapV4LpPoolPreset({chainId, presetId: poolPreset});
			out.existingPool = {
				token0Address: preset.token0Address,
				token1Address: preset.token1Address,
				poolReference: preset.poolReference,
			};
			if (preset.nativeWrapped && out.nativeWrapped == null) {
				out.nativeWrapped = preset.nativeWrapped;
			}
		} catch (error) {
			return {
				ok: false,
				reason: error instanceof Error ? error.message : String(error),
			};
		}
	}

	if (out.existingPool && typeof out.existingPool === 'object') {
		const pool = {...(out.existingPool as Record<string, unknown>)};
		const hasRef =
			typeof pool.poolReference === 'string' && String(pool.poolReference).trim();
		const fee = typeof pool.fee === 'number' ? pool.fee : undefined;
		const tickSpacing =
			typeof pool.tickSpacing === 'number' ? pool.tickSpacing : undefined;
		if (!hasRef && fee != null && tickSpacing != null) {
			try {
				const resolved = resolveUniswapV4LpExistingPoolFromKey({
					token0Address: String(pool.token0Address ?? ''),
					token1Address: String(pool.token1Address ?? ''),
					fee,
					tickSpacing,
					hooks:
						typeof pool.hooks === 'string' ? pool.hooks : undefined,
				});
				pool.token0Address = resolved.token0Address;
				pool.token1Address = resolved.token1Address;
				pool.poolReference = resolved.poolReference;
			} catch (error) {
				return {
					ok: false,
					reason: error instanceof Error ? error.message : String(error),
				};
			}
		}
		delete pool.fee;
		delete pool.tickSpacing;
		delete pool.hooks;
		out.existingPool = pool;
	}

	return {ok: true, data: out};
}

function normalizeLpAddresses(input: Record<string, unknown>): void {
	if (input.existingPool && typeof input.existingPool === 'object') {
		const pool = {...(input.existingPool as Record<string, unknown>)};
		pool.token0Address = normalizeNativeTokenAddress(pool.token0Address);
		pool.token1Address = normalizeNativeTokenAddress(pool.token1Address);
		input.existingPool = pool;
	}
	if (input.newPool && typeof input.newPool === 'object') {
		const pool = {...(input.newPool as Record<string, unknown>)};
		pool.token0Address = normalizeNativeTokenAddress(pool.token0Address);
		pool.token1Address = normalizeNativeTokenAddress(pool.token1Address);
		input.newPool = pool;
	}
	if (input.independentToken && typeof input.independentToken === 'object') {
		const tok = {...(input.independentToken as Record<string, unknown>)};
		tok.tokenAddress = normalizeNativeTokenAddress(tok.tokenAddress);
		input.independentToken = tok;
	}
	if (input.token0Address != null) {
		input.token0Address = normalizeNativeTokenAddress(input.token0Address);
	}
	if (input.token1Address != null) {
		input.token1Address = normalizeNativeTokenAddress(input.token1Address);
	}
}

async function resolveWalletFromKeyGen(
	config: NodeSdkConfig,
	input: Record<string, unknown>,
): Promise<SdkResult<Record<string, unknown>>> {
	const keyGenId =
		typeof input.keyGenId === 'string' && input.keyGenId.trim()
			? input.keyGenId.trim()
			: undefined;
	if (!keyGenId) {
		return {ok: true, data: input};
	}
	const enriched = await enrichMultisignContext(config, {
		keyGenId,
		chainId: input.chainId,
	});
	if (!enriched.ok) {
		return enriched;
	}
	const adapted = {...input};
	if (
		typeof adapted.walletAddress !== 'string' ||
		!String(adapted.walletAddress).trim()
	) {
		adapted.walletAddress = enriched.data.executorAddress;
	}
	adapted.chainId = enriched.data.chainId;
	return {ok: true, data: adapted};
}

/** Adapt Uniswap V4 LP prep tools (create/increase/decrease/claim). */
export async function adaptUniswapLiquidityPrepMcpInput(
	config: NodeSdkConfig,
	toolName: string,
	input: Record<string, unknown>,
): Promise<SdkResult<Record<string, unknown>>> {
	if (!UNISWAP_V4_LP_PREP_TOOL_NAMES.has(toolName)) {
		return {ok: true, data: input};
	}

	let adapted: Record<string, unknown> = {...input};
	normalizeLpAddresses(adapted);

	if (toolName === 'ctm_uniswap_v4_lp_create_position') {
		const poolResolved = resolveLpCreatePool(adapted);
		if (!poolResolved.ok) {
			return poolResolved;
		}
		adapted = poolResolved.data;
	}

	if (adapted.slippageTolerance == null) {
		adapted.slippageTolerance = 0.5;
	}

	if (adapted.chainId != null) {
		try {
			adapted.chainId = parseUniswapChainId(adapted.chainId as string | number);
		} catch {
			/* keep original for Zod to reject */
		}
	}

	const walletResolved = await resolveWalletFromKeyGen(config, adapted);
	if (!walletResolved.ok) {
		return walletResolved;
	}
	const out = walletResolved.data;

	if (typeof out.keyGen === 'object' && out.keyGen !== null) {
		delete out.keyGen;
	}
	for (const key of MULTISIGN_ENRICHMENT_KEYS) {
		delete out[key];
	}

	const nftField = LP_PREP_TOOLS_REQUIRING_REGISTRY_NFT.get(toolName);
	if (nftField && out.chainId != null) {
		const rawId = out[nftField];
		if (rawId != null && String(rawId).trim()) {
			let chainId: number;
			try {
				chainId = parseUniswapChainId(out.chainId as string | number);
			} catch {
				return {ok: true, data: out};
			}
			const inRegistry = await assertUniswapV4PositionNftInRegistry(config, {
				chainId,
				tokenId: String(rawId),
			});
			if (!inRegistry.ok) {
				return inRegistry;
			}
		}
	}

	return {ok: true, data: out};
}

/** Adapt list-positions: keyGenId → walletAddress (token registry only; no rpcUrl). */
export async function adaptUniswapLiquidityListPositionsMcpInput(
	config: NodeSdkConfig,
	toolName: string,
	input: Record<string, unknown>,
): Promise<SdkResult<Record<string, unknown>>> {
	if (toolName !== UNISWAP_V4_LP_LIST_POSITIONS_TOOL_NAME) {
		return {ok: true, data: input};
	}

	const adapted: Record<string, unknown> = {...input};
	const keyGenId =
		typeof adapted.keyGenId === 'string' && adapted.keyGenId.trim()
			? adapted.keyGenId.trim()
			: undefined;

	if (keyGenId) {
		const enriched = await enrichMultisignContext(config, {
			keyGenId,
			chainId: adapted.chainId,
		});
		if (!enriched.ok) {
			return enriched;
		}
		if (
			typeof adapted.walletAddress !== 'string' ||
			!String(adapted.walletAddress).trim()
		) {
			adapted.walletAddress = enriched.data.executorAddress;
		}
		adapted.chainId = enriched.data.chainId;
	}

	if (adapted.chainId != null) {
		try {
			adapted.chainId = parseUniswapChainId(adapted.chainId as string | number);
		} catch {
			/* Zod */
		}
	}

	delete adapted.keyGenId;
	delete adapted.rpcUrl;
	return {ok: true, data: adapted};
}

export function isUniswapLiquidityPrepTool(toolName: string): boolean {
	return UNISWAP_V4_LP_PREP_TOOL_NAMES.has(toolName);
}

export function isUniswapLiquidityListPositionsTool(toolName: string): boolean {
	return toolName === UNISWAP_V4_LP_LIST_POSITIONS_TOOL_NAME;
}
