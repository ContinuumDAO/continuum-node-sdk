import {formatUnits, getAddress} from 'viem';
import {parseUniswapChainId} from '@continuumdao/ctm-mpc-defi/protocols/evm/uniswap-v4';
import type {NodeSdkConfig} from '../../config/schema.js';
import {fetchKeyGenResult} from '../../core/keygen.js';
import {resolveChainRegistryEntry} from '../../core/registry/networks.js';
import type {SdkResult} from '../../core/result.js';
import {parseKeyGenRequestId} from '../../core/keygen-id.js';

function parseEvmChainId(raw: unknown): number {
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
		const chain = await resolveChainRegistryEntry(config, chainId);
		if (!chain.ok) return chain;

		const pubkeyhex = String(kg.data.pubkeyhex ?? '').trim();
		const eth = String(kg.data.ethereumaddress ?? '').trim();
		if (!pubkeyhex || !eth) {
			return {ok: false, reason: 'KeyGen result missing pubkeyhex or ethereumaddress.'};
		}
		const rpcUrl = String(chain.data.rpcGateway ?? '').trim();
		if (!rpcUrl) {
			return {ok: false, reason: 'Chain registry entry has no rpcGateway.'};
		}

		const chainDetail: Record<string, unknown> = {
			legacy: chain.data.legacy,
			gasLimit: chain.data.gasLimit,
			gasMultiplier: chain.data.gasMultiplier,
			gasPrice: chain.data.gasPrice,
			baseFee: chain.data.baseFee,
			priorityFee: chain.data.priorityFee,
			baseFeeMultiplier: chain.data.baseFeeMultiplier,
		};

		const useCustomGas = Boolean(input.useCustomGas ?? false);
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

	const keyGen = input.keyGen;
	if (!keyGen || typeof keyGen !== 'object' || Array.isArray(keyGen)) {
		return {
			ok: false,
			reason: 'Provide keyGenId or full keyGen + rpcUrl + executorAddress + chainDetail.',
		};
	}
	const kgObj = keyGen as Record<string, unknown>;
	const pubkeyhex = String(kgObj.pubkeyhex ?? '').trim();
	const executorAddress = String(input.executorAddress ?? '').trim();
	const rpcUrl = String(input.rpcUrl ?? '').trim();
	if (!pubkeyhex || !executorAddress || !rpcUrl) {
		return {ok: false, reason: 'keyGen.pubkeyhex, executorAddress, and rpcUrl are required.'};
	}
	if (!Number.isFinite(chainId) || chainId <= 0) {
		return {ok: false, reason: 'chainId must be a positive integer.'};
	}

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
			chainDetail:
				input.chainDetail && typeof input.chainDetail === 'object'
					? (input.chainDetail as Record<string, unknown>)
					: {},
			useCustomGas: Boolean(input.useCustomGas ?? false),
			customGasChainDetails:
				input.customGasChainDetails &&
				typeof input.customGasChainDetails === 'object'
					? (input.customGasChainDetails as Record<string, unknown>)
					: undefined,
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
		...rest
	} = input;
	return rest;
}
