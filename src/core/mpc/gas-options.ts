import {z} from 'zod';
import type {NodeSdkConfig} from '../../config/schema.js';
import {getDefaultGetSigFeeSpeedFromChainDetail} from '../../evm/get-sig-fee-speed.js';
import {resolveChainRegistryEntry} from '../registry/networks.js';
import type {SdkResult} from '../result.js';
import {mpcGetSignRequestById} from './client.js';
import {
	CustomGasConfigSnapshotSchema,
	GetMultiSignGasOptionsInputSchema,
	GetMultiSignGasOptionsOutputSchema,
} from './schemas.js';
import {
	getCustomGasChainDetailsFromExtraJSON,
	keyGenIdFromRecord,
} from './sign-request-utils.js';
import type {ChainDetailRow} from './types.js';

type CustomGasSnapshot = z.infer<typeof CustomGasConfigSnapshotSchema>;

export type MultiSignGasOptions = z.infer<typeof GetMultiSignGasOptionsOutputSchema>;

function customGasSnapshotFromChain(chain: ChainDetailRow): CustomGasSnapshot {
	const snap: CustomGasSnapshot = {
		legacy: Boolean(chain.legacy),
	};
	if (chain.gasName != null && String(chain.gasName).trim()) {
		snap.gasName = String(chain.gasName);
	}
	if (chain.gasLimit != null && chain.gasLimit > 0) {
		snap.gasLimit = Number(chain.gasLimit);
	}
	if (chain.legacy) {
		if (chain.gasMultiplier != null) snap.gasMultiplier = Number(chain.gasMultiplier);
		if (chain.gasPrice != null) snap.gasPrice = Number(chain.gasPrice);
	} else {
		if (chain.baseFee != null) snap.baseFee = Number(chain.baseFee);
		if (chain.priorityFee != null) snap.priorityFee = Number(chain.priorityFee);
		if (chain.baseFeeMultiplier != null) {
			snap.baseFeeMultiplier = Number(chain.baseFeeMultiplier);
		}
	}
	return snap;
}

function parseDestinationChainId(req: Record<string, unknown>): number | null {
	const raw = String(
		req.DestinationChainID ?? req.destinationChainID ?? '',
	).trim();
	if (!raw) return null;
	const n = parseInt(raw, 10);
	return Number.isFinite(n) && n > 0 ? n : null;
}

export async function getMultiSignGasOptions(
	config: NodeSdkConfig,
	input: unknown,
): Promise<SdkResult<MultiSignGasOptions>> {
	const parsed = GetMultiSignGasOptionsInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid get multi-sign gas options input.'};
	}

	let chainId = parsed.data.chainId;
	let requestId = parsed.data.requestId;
	let proposalUsedCustomGas = false;
	let proposalCustomGas: CustomGasSnapshot | undefined;

	if (requestId) {
		const req = await mpcGetSignRequestById(config, requestId);
		if (!req.ok) return req;
		const reqData = req.data as Record<string, unknown>;
		const fromReq = parseDestinationChainId(reqData);
		if (fromReq == null) {
			return {ok: false, reason: 'Sign request missing destination chain id.'};
		}
		if (chainId != null && chainId !== fromReq) {
			return {
				ok: false,
				reason: `chainId ${chainId} does not match sign request destination ${fromReq}.`,
			};
		}
		chainId = fromReq;
		const custom = getCustomGasChainDetailsFromExtraJSON(reqData);
		if (custom) {
			proposalUsedCustomGas = true;
			proposalCustomGas = customGasSnapshotFromChain(custom as ChainDetailRow);
		}
		if (!keyGenIdFromRecord(reqData)) {
			return {ok: false, reason: 'Sign request missing KeyGen id.'};
		}
	}

	if (chainId == null) {
		return {
			ok: false,
			reason: 'Provide chainId and/or requestId to resolve gas options.',
		};
	}

	const chainResult = await resolveChainRegistryEntry(config, chainId);
	if (!chainResult.ok) return chainResult;
	const chain = chainResult.data as ChainDetailRow;
	const defaultGetSigFeeSpeed = getDefaultGetSigFeeSpeedFromChainDetail(chain);
	const chainRegistryCustomGas = customGasSnapshotFromChain(chain);

	return {
		ok: true,
		data: {
			chainId,
			chainName: chain.chainName,
			...(requestId ? {requestId} : {}),
			proposalUsedCustomGas,
			chainRegistryCustomGas,
			...(proposalCustomGas ? {proposalCustomGas} : {}),
			defaultGetSigFeeSpeed,
			feeSpeedTierChoices: ['slow', 'normal', 'fast', 'advanced'],
			createMultiSignRequest: {
				useCustomGasDefault: false,
				useCustomGasWhenTrue:
					'Use saved Custom Gas Config from chainRegistryCustomGas (gas limits and fee floors/multipliers) when building the proposal.',
				useCustomGasWhenFalse:
					'Use live RPC fee estimates at proposal time (default).',
			},
			triggerSignResult: {
				defaultFeeSpeedTier: defaultGetSigFeeSpeed,
				feeSpeedTierField:
					'Optional feeSpeedTier on trigger_sign_result: slow | normal | fast | advanced. Omit to use defaultFeeSpeedTier.',
				advancedFields:
					'When feeSpeedTier is advanced, set advancedMaxFeeGwei and/or advancedPriorityFeeGwei (EIP-1559) or advancedGasPriceGwei (legacy).',
			},
		},
	};
}
