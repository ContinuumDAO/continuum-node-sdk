import type {NodeSdkConfig} from '../../config/schema.js';
import {resolveChainRegistryEntry} from '../../core/registry/networks.js';
import type {SdkResult} from '../../core/result.js';
import {parseEvmChainId} from './input-adapter.js';

const RAILGUN_RPC_TOOLS = new Set(['ctm_railgun_fetch_popular_assets']);

export function isRailgunRpcTool(toolName: string): boolean {
	return RAILGUN_RPC_TOOLS.has(toolName);
}

/** Inject rpcUrl from get_chain_registry for the Railgun popular-asset read. */
export async function adaptRailgunRpcMcpInput(
	config: NodeSdkConfig,
	toolName: string,
	input: Record<string, unknown>,
): Promise<SdkResult<Record<string, unknown>>> {
	if (!isRailgunRpcTool(toolName)) {
		return {ok: true, data: input};
	}

	const adapted: Record<string, unknown> = {...input};
	const chainId = parseEvmChainId(adapted.chainId);
	if (!Number.isFinite(chainId) || chainId <= 0) {
		return {ok: false, reason: 'chainId must be a positive EVM chain id.'};
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
