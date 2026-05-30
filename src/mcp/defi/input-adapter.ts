import {formatUnits, getAddress} from 'viem';
import type {NodeSdkConfig} from '../../config/schema.js';
import {fetchKeyGenResult} from '../../core/keygen.js';
import {resolveChainRegistryEntry} from '../../core/registry/networks.js';
import type {SdkResult} from '../../core/result.js';

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
	const keyGenId = typeof input.keyGenId === 'string' ? input.keyGenId.trim() : '';
	const chainIdRaw = input.chainId;
	const chainId =
		typeof chainIdRaw === 'number'
			? chainIdRaw
			: typeof chainIdRaw === 'string'
				? Number.parseInt(chainIdRaw, 10)
				: Number.NaN;

	if (keyGenId) {
		if (!Number.isFinite(chainId) || chainId <= 0) {
			return {ok: false, reason: 'chainId must be a positive integer when using keyGenId.'};
		}
		const kg = await fetchKeyGenResult(config, keyGenId);
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
