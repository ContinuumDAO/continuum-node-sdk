import {zeroAddress} from 'viem';
import {CURVE_NATIVE_PLACEHOLDER} from '@continuumdao/ctm-mpc-defi/protocols/evm/curve-dao';
import type {NodeSdkConfig} from '../../config/schema.js';
import {resolveChainRegistryEntry} from '../../core/registry/networks.js';
import type {SdkResult} from '../../core/result.js';
import {parseEvmChainId} from './input-adapter.js';

export const CURVE_DAO_QUOTE_TOOL_NAME = 'ctm_curve_dao_quote';

/** Match Curve native coin id used by @curvefi/api router. */
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
		lower === zeroAddress.toLowerCase() ||
		lower === CURVE_NATIVE_PLACEHOLDER.toLowerCase()
	) {
		return CURVE_NATIVE_PLACEHOLDER;
	}
	return tokenIn;
}

/**
 * Resolve rpcUrl from get_chain_registry for Curve quotes (same rpcGateway as multisign builders).
 */
export async function adaptCurveQuoteMcpInput(
	config: NodeSdkConfig,
	toolName: string,
	input: Record<string, unknown>,
): Promise<SdkResult<Record<string, unknown>>> {
	if (toolName !== CURVE_DAO_QUOTE_TOOL_NAME) {
		return {ok: true, data: input};
	}

	const adapted: Record<string, unknown> = {...input};
	adapted.tokenIn = normalizeNativeTokenIn(adapted.tokenIn);

	const chainId = parseEvmChainId(adapted.chainId);
	if (!Number.isFinite(chainId) || chainId <= 0) {
		return {ok: false, reason: 'chainId must be a positive integer.'};
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

export function isCurveQuoteTool(toolName: string): boolean {
	return toolName === CURVE_DAO_QUOTE_TOOL_NAME;
}
