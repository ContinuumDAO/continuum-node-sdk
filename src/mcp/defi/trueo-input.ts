import type {NodeSdkConfig} from '../../config/schema.js';
import {resolveChainRegistryEntry} from '../../core/registry/networks.js';
import type {SdkResult} from '../../core/result.js';
import {parseEvmChainId} from './input-adapter.js';

const TRUEO_READ_TOOLS = new Set(['ctm_trueo_fetch_orderbook']);

export function isTrueoReadTool(toolName: string): boolean {
	return TRUEO_READ_TOOLS.has(toolName);
}

/** Inject rpcUrl from chain registry for Trueo on-chain book reads. */
export async function adaptTrueoReadMcpInput(
	config: NodeSdkConfig,
	toolName: string,
	input: Record<string, unknown>,
): Promise<SdkResult<Record<string, unknown>>> {
	if (!isTrueoReadTool(toolName)) {
		return {ok: true, data: input};
	}
	const adapted: Record<string, unknown> = {...input, chainId: parseEvmChainId(input.chainId) || 8453};
	if (typeof adapted.rpcUrl === 'string' && adapted.rpcUrl.trim()) {
		return {ok: true, data: adapted};
	}
	const chain = await resolveChainRegistryEntry(config, 8453);
	if (!chain.ok) return chain;
	const rpcUrl = String(chain.data.rpcGateway ?? '').trim();
	if (rpcUrl) adapted.rpcUrl = rpcUrl;
	return {ok: true, data: adapted};
}
