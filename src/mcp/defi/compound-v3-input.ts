import type {NodeSdkConfig} from '../../config/schema.js';
import {resolveChainRegistryEntry} from '../../core/registry/networks.js';
import type {SdkResult} from '../../core/result.js';
import {parseEvmChainId} from './input-adapter.js';

const COMPOUND_V3_READ_TOOLS = new Set([
	'ctm_compound_v3_fetch_markets',
	'ctm_compound_v3_fetch_market',
	'ctm_compound_v3_fetch_account',
]);

export function isCompoundV3ReadTool(toolName: string): boolean {
	return COMPOUND_V3_READ_TOOLS.has(toolName);
}

/** Inject rpcUrl from get_chain_registry for Compound III reads. */
export async function adaptCompoundV3ReadMcpInput(
	config: NodeSdkConfig,
	toolName: string,
	input: Record<string, unknown>,
): Promise<SdkResult<Record<string, unknown>>> {
	if (!isCompoundV3ReadTool(toolName)) {
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
