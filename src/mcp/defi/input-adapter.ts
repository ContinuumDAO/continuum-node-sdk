import {formatUnits, getAddress} from 'viem';
import {
	parseAgentBoolean,
	parseAgentEvmChainId,
} from '@continuumdao/ctm-mpc-defi/agent';
import {parseUniswapChainId} from '@continuumdao/ctm-mpc-defi/protocols/evm/uniswap-v4';
import type {NodeSdkConfig} from '../../config/schema.js';
import {fetchKeyGenResult} from '../../core/keygen.js';
import {resolveChainRegistryEntry} from '../../core/registry/networks.js';
import type {SdkResult} from '../../core/result.js';
import {ChainRegistryEntrySchema} from '../../schemas/extended.js';
import type {z} from 'zod';

type ChainRegistryEntry = z.infer<typeof ChainRegistryEntrySchema>;
import {parseKeyGenRequestId} from '../../core/keygen-id.js';

/** Multisign chain id: decimal (8453 for Base). Uniswap quote/LP tools keep parseUniswapChainId. */
export function parseEvmChainId(raw: unknown): number {
	const chainId = parseAgentEvmChainId(raw);
	if (Number.isFinite(chainId) && chainId > 0) {
		return chainId;
	}
	if (typeof raw === 'number' && Number.isFinite(raw)) {
		return raw;
	}
	if (typeof raw === 'string' && raw.trim()) {
		try {
			return parseUniswapChainId(raw);
		} catch {
			return Number.NaN;
		}
	}
	return Number.NaN;
}

export function normalizeMultisignAgentInput(
	input: Record<string, unknown>,
): Record<string, unknown> {
	const out: Record<string, unknown> = {...input};
	if (input.chainId !== undefined) {
		const chainId = parseAgentEvmChainId(input.chainId);
		if (Number.isFinite(chainId) && chainId > 0) {
			out.chainId = chainId;
		}
	}
	if (input.useCustomGas !== undefined) {
		out.useCustomGas = parseAgentBoolean(input.useCustomGas, false);
	}
	return out;
}

export type EnrichedMultisignContext = {
	keyGen: {
		pubkeyhex: string;
		keylist?: string[];
		ClientKeys?: Record<string, string>;
	};
	executorAddress: string;
	chainId: number;
	rpcUrl: string;
	chainDetail: Record<string, unknown>;
	useCustomGas: boolean;
	customGasChainDetails?: Record<string, unknown>;
};

function chainDetailFromRegistry(chain: ChainRegistryEntry): Record<string, unknown> {
	return {
		legacy: chain.legacy,
		gasLimit: chain.gasLimit,
		gasMultiplier: chain.gasMultiplier,
		gasPrice: chain.gasPrice,
		baseFee: chain.baseFee,
		priorityFee: chain.priorityFee,
		baseFeeMultiplier: chain.baseFeeMultiplier,
	};
}

async function resolveRegistryRpcForChain(
	config: NodeSdkConfig,
	chainId: number,
): Promise<SdkResult<{rpcUrl: string; chainDetail: Record<string, unknown>}>> {
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
	return {
		ok: true,
		data: {
			rpcUrl,
			chainDetail: chainDetailFromRegistry(chain.data),
		},
	};
}

export async function enrichMultisignContext(
	config: NodeSdkConfig,
	input: Record<string, unknown>,
): Promise<SdkResult<EnrichedMultisignContext>> {
	const keyGenIdRaw =
		typeof input.keyGenId === 'string' && input.keyGenId.trim()
			? input.keyGenId
			: undefined;
	const chainId = parseEvmChainId(input.chainId);

	if (keyGenIdRaw) {
		const keyGenIdParsed = parseKeyGenRequestId(keyGenIdRaw);
		if (!keyGenIdParsed.ok) return keyGenIdParsed;
		if (!Number.isFinite(chainId) || chainId <= 0) {
			return {ok: false, reason: 'chainId must be a positive integer when using keyGenId.'};
		}
		const kg = await fetchKeyGenResult(config, keyGenIdParsed.data);
		if (!kg.ok) return kg;
		const registry = await resolveRegistryRpcForChain(config, chainId);
		if (!registry.ok) return registry;

		const pubkeyhex = String(kg.data.pubkeyhex ?? '').trim();
		const eth = String(kg.data.ethereumaddress ?? '').trim();
		if (!pubkeyhex || !eth) {
			return {ok: false, reason: 'KeyGen result missing pubkeyhex or ethereumaddress.'};
		}

		const useCustomGas = parseAgentBoolean(input.useCustomGas, false);
		const {rpcUrl, chainDetail} = registry.data;
		return {
			ok: true,
			data: {
				keyGen: {
					pubkeyhex,
					keylist: kg.data.keylist ? [...kg.data.keylist] : undefined,
					ClientKeys: kg.data.ClientKeys
						? {...kg.data.ClientKeys}
						: undefined,
				},
				executorAddress: getAddress(eth.startsWith('0x') ? eth : `0x${eth}`),
				chainId,
				rpcUrl,
				chainDetail,
				useCustomGas,
				customGasChainDetails: useCustomGas ? {...chainDetail} : undefined,
			},
		};
	}

	if (!Number.isFinite(chainId) || chainId <= 0) {
		return {ok: false, reason: 'chainId must be a positive integer.'};
	}

	const registry = await resolveRegistryRpcForChain(config, chainId);
	if (!registry.ok) return registry;

	const keyGen = input.keyGen;
	if (!keyGen || typeof keyGen !== 'object' || Array.isArray(keyGen)) {
		return {
			ok: false,
			reason: 'Provide keyGenId (preferred) or keyGen + executorAddress with chainId.',
		};
	}
	const kgObj = keyGen as Record<string, unknown>;
	const pubkeyhex = String(kgObj.pubkeyhex ?? '').trim();
	const executorAddress = String(input.executorAddress ?? '').trim();
	if (!pubkeyhex || !executorAddress) {
		return {
			ok: false,
			reason: 'keyGen.pubkeyhex and executorAddress are required when keyGenId is omitted.',
		};
	}

	const useCustomGas = parseAgentBoolean(input.useCustomGas, false);
	const {rpcUrl, chainDetail} = registry.data;
	return {
		ok: true,
		data: {
			keyGen: {
				pubkeyhex,
				keylist: Array.isArray(kgObj.keylist)
					? kgObj.keylist.map(String)
					: undefined,
				ClientKeys:
					kgObj.ClientKeys && typeof kgObj.ClientKeys === 'object'
						? (kgObj.ClientKeys as Record<string, string>)
						: undefined,
			},
			executorAddress: getAddress(executorAddress as `0x${string}`),
			chainId,
			rpcUrl,
			chainDetail,
			useCustomGas,
			customGasChainDetails: useCustomGas ? {...chainDetail} : undefined,
		},
	};
}

/** Map MCP schema field names to builder arg names where they differ. */
export function mapToolFieldsToBuilderArgs(
	toolName: string,
	fields: Record<string, unknown>,
): Record<string, unknown> {
	const out = {...fields};
	if (
		toolName === 'ctm_lido_build_submit_multisign' &&
		out.valueWei != null &&
		out.ethAmountHuman == null
	) {
		try {
			out.ethAmountHuman = formatUnits(BigInt(String(out.valueWei)), 18);
		} catch {
			/* leave for builder to error */
		}
		delete out.valueWei;
	}
	return out;
}

export function stripEnrichmentKeys(
	input: Record<string, unknown>,
): Record<string, unknown> {
	const {
		keyGenId: _k,
		keyGen: _kg,
		executorAddress: _e,
		rpcUrl: _r,
		chainDetail: _c,
		customGasChainDetails: _g,
		_aaveV4NativeWrapped: _anw,
		_aaveV4IsNativeIn: _ani,
		_aaveV4HubName: _ahn,
		...rest
	} = input;
	return rest;
}
