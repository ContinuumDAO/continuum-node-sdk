import type {NodeSdkConfig} from '../../config/schema.js';
import {resolveChainRegistryEntry} from '../../core/registry/networks.js';
import type {SdkResult} from '../../core/result.js';
import {parseEvmChainId} from './input-adapter.js';

const AERODROME_READ_TOOLS = new Set([
	'ctm_aerodrome_quote',
	'ctm_aerodrome_quote_add_liquidity',
	'ctm_aerodrome_quote_cl_deposit',
	'ctm_aerodrome_discover_pools',
	'ctm_aerodrome_fetch_pools',
	'ctm_aerodrome_fetch_lp_yields',
	'ctm_aerodrome_fetch_stock_lp_yields',
	'ctm_aerodrome_fetch_positions',
]);

export function isAerodromeReadTool(toolName: string): boolean {
	return AERODROME_READ_TOOLS.has(toolName);
}

/**
 * Inject rpcUrl from get_chain_registry (same as Curve quotes).
 * Agents are told not to pass a public RPC URL; without this, Aerodrome reads
 * crash on `rpcUrl.trim()` of undefined.
 */
export async function adaptAerodromeReadMcpInput(
	config: NodeSdkConfig,
	toolName: string,
	input: Record<string, unknown>,
): Promise<SdkResult<Record<string, unknown>>> {
	if (!isAerodromeReadTool(toolName)) {
		return {ok: true, data: input};
	}

	const adapted: Record<string, unknown> = {...input};
	const chainId = parseEvmChainId(adapted.chainId);
	if (!Number.isFinite(chainId) || chainId <= 0) {
		return {
			ok: false,
			reason: 'Aero chainId must be 8453, 1, 10, 42161, 4663, 5042, or 57073.',
		};
	}
	const aeroChains = new Set([8453, 1, 10, 42161, 4663, 5042, 57073]);
	if (!aeroChains.has(chainId)) {
		return {
			ok: false,
			reason: 'Aero chainId must be 8453, 1, 10, 42161, 4663, 5042, or 57073.',
		};
	}
	if (toolName === 'ctm_aerodrome_fetch_stock_lp_yields' && chainId !== 8453) {
		return {ok: false, reason: 'Aero stock LP yields are Base (8453) only.'};
	}
	adapted.chainId = chainId;

	const rpcProvided =
		typeof adapted.rpcUrl === 'string' && adapted.rpcUrl.trim()
			? adapted.rpcUrl.trim()
			: undefined;
	if (!rpcProvided) {
		const chain = await resolveChainRegistryEntry(config, chainId);
		if (!chain.ok) {
			return chain;
		}
		const rpcUrl = String(chain.data.rpcGateway ?? '').trim();
		if (!rpcUrl) {
			return {
				ok: false,
				reason: `Chain registry entry for chainId ${chainId} has no rpcGateway. Configure it via get_chain_registry / add_to_chain_registry.`,
			};
		}
		adapted.rpcUrl = rpcUrl;
	}

	delete adapted.keyGenId;
	delete adapted.purposeText;
	delete adapted.useCustomGas;

	return {ok: true, data: adapted};
}
