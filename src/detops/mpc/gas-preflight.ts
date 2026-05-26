import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../result.js';
import {
	doesOriginatorHaveSufficientNativeForValuePlusGasMax,
	maxWeiRequiredFromSignedSerializedTxHex,
} from '../../evm/native-sufficiency.js';
import type {BuiltMultiSignProposal, ChainDetailRow, KeyGenResultById} from './types.js';
import {createPublicClientForChain, executorAddressFromKeyGen} from './context.js';
import type {ProposalTxParams} from '../../evm/tx-params.js';

export async function assertExecutorNativeSufficientForProposal(
	config: NodeSdkConfig,
	args: {
		keyGenResult: KeyGenResultById;
		chainId: number;
		proposal: BuiltMultiSignProposal;
		valueWeiPerLeg?: readonly bigint[];
	},
): Promise<SdkEmptyResult> {
	const ctx = await createPublicClientForChain(config, args.chainId);
	if (!ctx.ok) return ctx;
	const executor = executorAddressFromKeyGen(args.keyGenResult);
	if (!executor) {
		return {ok: false, reason: 'KeyGen result has no valid ethereum address.'};
	}
	const {publicClient, chainDetail} = ctx.data;
	const rpcUrl = (chainDetail.rpcGateway ?? '').trim();
	const balance = await publicClient.getBalance({address: executor});

	const body = args.proposal.bodyForSign;
	const rawBatch = body.messageRawBatch as string[] | undefined;
	const legs = Array.isArray(rawBatch) && rawBatch.length > 0 ? rawBatch.length : 1;

	for (let i = 0; i < legs; i++) {
		const valueWei = args.valueWeiPerLeg?.[i] ?? 0n;
		let gasLimit = 21000n;
		const pt = (body.proposalTxParams as ProposalTxParams[] | undefined)?.[i] ??
			(body.txParams as ProposalTxParams | undefined);
		if (pt?.gasLimit) {
			try {
				gasLimit = BigInt(pt.gasLimit);
			} catch {
				/* keep default */
			}
		}
		const check = await doesOriginatorHaveSufficientNativeForValuePlusGasMax({
			originatorBalanceWei: balance,
			valueWei,
			gasLimit,
			chainDetail: {
				legacy:
					chainDetail.legacy === true ||
					(typeof chainDetail.legacy === 'string' &&
						chainDetail.legacy.toLowerCase() === 'true'),
				gasLimit: chainDetail.gasLimit,
				gasMultiplier: chainDetail.gasMultiplier,
				gasPrice: chainDetail.gasPrice,
				baseFee: chainDetail.baseFee,
				priorityFee: chainDetail.priorityFee,
				baseFeeMultiplier: chainDetail.baseFeeMultiplier,
			},
			rpcUrl,
			chainId: args.chainId,
		});
		if (!check.sufficient) {
			return {
				ok: false,
				reason: `Insufficient native balance on executor for transaction ${i + 1}.`,
			};
		}
	}
	return {ok: true};
}

export type SdkEmptyResult = {ok: true} | {ok: false; reason: string};

export async function assertExecutorNativeSufficientForSignedHexes(
	config: NodeSdkConfig,
	args: {
		keyGenResult: KeyGenResultById;
		chainId: number;
		signedTxHexes: readonly string[];
	},
): Promise<SdkEmptyResult> {
	const ctx = await createPublicClientForChain(config, args.chainId);
	if (!ctx.ok) return ctx;
	const executor = executorAddressFromKeyGen(args.keyGenResult);
	if (!executor) {
		return {ok: false, reason: 'KeyGen result has no valid ethereum address.'};
	}
	const balance = await ctx.data.publicClient.getBalance({address: executor});
	let totalRequired = 0n;
	for (const hex of args.signedTxHexes) {
		const req = maxWeiRequiredFromSignedSerializedTxHex(hex);
		if (req == null) {
			return {ok: false, reason: 'Could not parse signed transaction for gas preflight.'};
		}
		totalRequired += req;
	}
	if (balance < totalRequired) {
		return {
			ok: false,
			reason: 'Insufficient native balance on executor for broadcast (value + max gas).',
		};
	}
	return {ok: true};
}

export async function assertMpaCreditsForGetSig(
	config: NodeSdkConfig,
	args: {
		keyGenId: string;
		keyGenAddress: string;
		requiredCredits?: number;
	},
): Promise<SdkEmptyResult> {
	const globalNonce = await import('./mpa-top-up.js').then(m =>
		m.getMpaWalletStatus(config, {keyGenId: args.keyGenId}),
	);
	if (!globalNonce.ok) return globalNonce;
	if (globalNonce.data.globalNonce === 0) {
		return {ok: true};
	}
	const credits = globalNonce.data.remainingNonces ?? 0;
	const free = globalNonce.data.freeTransactionsLeft ?? 0;
	const total = free + Math.max(0, credits - free);
	const need = args.requiredCredits ?? 1;
	if (total < need) {
		return {
			ok: false,
			reason: `Insufficient MPA credits (${total} remaining, need ${need}). Top up on Linea.`,
		};
	}
	return {ok: true};
}
