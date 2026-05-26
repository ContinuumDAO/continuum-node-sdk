/**
 * Bump / cancel pending mempool txs by creating a new multiSignRequest (ported from bumpMultisignFromSourceRequest).
 */
import {
	getAddress,
	keccak256,
	parseTransaction,
	serializeTransaction,
	type Address,
	type PublicClient,
} from 'viem';
import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../result.js';
import {BumpSignResultInputSchema} from './schemas.js';
import {
	createPublicClientForChain,
	executorAddressFromKeyGen,
} from './context.js';
import {fetchKeyGenResult} from '../keygen.js';
import {mpcGetSignRequestById} from './client.js';
import {
	getBatchLength,
	getDestinationAddressForDetail,
	getMessageRawForDetail,
	getProposalTxParamsForDetailIndex,
	getSignatureTextForDetail,
	isBatchSignRequest,
	keyGenIdFromRecord,
	parseSignRequestExtraJSON,
} from './sign-request-utils.js';
import {signAndSubmitMultiSignRequest} from './sign-request-body.js';
import type {SignRequestDetail} from './types.js';
import type {ProposalTxParams} from '../../evm/tx-params.js';
import {fetchChainFeeParams} from '../../evm/chain-fees.js';

const CANCEL_GAS = 21000n;

export type BumpMempoolPrecheckOk = {
	ok: true;
	slicedFromIndex: number;
	activeCount: number;
	message: string;
};

export type BumpMempoolPrecheckFail = {ok: false; message: string};

export async function precheckBumpMempool(args: {
	publicClient: PublicClient;
	executorAddress: Address;
	proposalNonces: number[];
}): Promise<BumpMempoolPrecheckOk | BumpMempoolPrecheckFail> {
	const latest = await args.publicClient.getTransactionCount({
		address: args.executorAddress,
		blockTag: 'latest',
	});
	const pending = await args.publicClient.getTransactionCount({
		address: args.executorAddress,
		blockTag: 'pending',
	});
	let firstActive = 0;
	while (
		firstActive < args.proposalNonces.length &&
		args.proposalNonces[firstActive]! < latest
	) {
		firstActive++;
	}
	if (firstActive >= args.proposalNonces.length) {
		return {
			ok: false,
			message: 'Every transaction from this sign request is already mined.',
		};
	}
	const activeNonces = args.proposalNonces.slice(firstActive);
	if (pending <= latest) {
		return {
			ok: false,
			message: 'No pending transactions in mempool for this key.',
		};
	}
	const msg =
		firstActive > 0
			? `First ${firstActive} tx(s) mined; bumping ${activeNonces.length} remaining.`
			: `All ${activeNonces.length} transaction(s) still pending.`;
	return {ok: true, slicedFromIndex: firstActive, activeCount: activeNonces.length, message: msg};
}

function deriveTxParamsEnvelopeFromMessageRaws(
	detail: SignRequestDetail,
): Record<string, unknown> | null {
	const batch = isBatchSignRequest(detail);
	const N = batch ? getBatchLength(detail) : 1;
	const rows: ProposalTxParams[] = [];
	for (let i = 0; i < N; i++) {
		const raw = getMessageRawForDetail(detail, i);
		if (!raw || String(raw).trim().length < 4) return null;
		const hex = (raw.trim().startsWith('0x') ? raw.trim() : `0x${raw.trim()}`) as `0x${string}`;
		let parsed: ReturnType<typeof parseTransaction>;
		try {
			parsed = parseTransaction(hex);
		} catch {
			return null;
		}
		const nonce = Number(parsed.nonce);
		if (!Number.isFinite(nonce) || parsed.gas == null) return null;
		const gasLimit = parsed.gas.toString();
		if (parsed.maxFeePerGas != null && parsed.maxPriorityFeePerGas != null) {
			rows.push({
				nonce,
				gasLimit,
				txType: 'eip1559',
				maxFeePerGas: parsed.maxFeePerGas.toString(),
				maxPriorityFeePerGas: parsed.maxPriorityFeePerGas.toString(),
			});
		} else if (parsed.gasPrice != null) {
			rows.push({
				nonce,
				gasLimit,
				txType: 'legacy',
				gasPrice: parsed.gasPrice.toString(),
			});
		} else {
			return null;
		}
	}
	if (batch && N > 1) return {proposalTxParams: rows};
	if (rows.length === 1) return {txParams: rows[0]};
	return null;
}

export async function bumpOrCancelSignResult(
	config: NodeSdkConfig,
	input: unknown,
): Promise<SdkResult<{requestId: string}>> {
	const parsed = BumpSignResultInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid bump sign result input.'};
	}

	const kg = await fetchKeyGenResult(config, parsed.data.keyGenId);
	if (!kg.ok) return kg;

	const req = await mpcGetSignRequestById(config, parsed.data.sourceRequestId);
	if (!req.ok) return req;

	const txParamsReq = await mpcGetSignRequestById(config, parsed.data.sourceRequestId, {
		txParams: true,
	});
	let txEnvelope: Record<string, unknown> | null = null;
	if (txParamsReq.ok) {
		txEnvelope = txParamsReq.data as Record<string, unknown>;
	}
	if (!txEnvelope) {
		txEnvelope = deriveTxParamsEnvelopeFromMessageRaws(req.data);
	}
	if (!txEnvelope) {
		return {
			ok: false,
			reason: 'Could not read nonce/gas data; MessageRaw must be full unsigned tx hex.',
		};
	}

	const detail = req.data;
	const batch = isBatchSignRequest(detail);
	const N = batch ? getBatchLength(detail) : 1;
	const proposalNonces: number[] = [];
	for (let i = 0; i < N; i++) {
		const tp = getProposalTxParamsForDetailIndex(txEnvelope, batch, i);
		if (!tp || !Number.isFinite(tp.nonce)) {
			return {ok: false, reason: `Missing nonce for transaction ${i + 1}.`};
		}
		proposalNonces.push(tp.nonce);
	}

	const destChainIdNum = parseInt(
		String(detail.DestinationChainID ?? detail.destinationChainID ?? ''),
		10,
	);
	const ctx = await createPublicClientForChain(config, destChainIdNum);
	if (!ctx.ok) return ctx;

	const executor = executorAddressFromKeyGen(kg.data);
	if (!executor) {
		return {ok: false, reason: 'KeyGen missing executor address.'};
	}

	const sourceKg = keyGenIdFromRecord(detail);
	if (sourceKg !== parsed.data.keyGenId) {
		return {ok: false, reason: 'Source sign request belongs to a different KeyGen.'};
	}

	const mempool = await precheckBumpMempool({
		publicClient: ctx.data.publicClient,
		executorAddress: executor,
		proposalNonces,
	});
	if (!mempool.ok) return {ok: false, reason: mempool.message};

	const from = mempool.slicedFromIndex;
	const activeIndices: number[] = [];
	for (let i = from; i < N; i++) activeIndices.push(i);

	const cancelPendingTx = parsed.data.cancelPendingTx === true;
	const messageHashes: string[] = [];
	const messageRawBatch: string[] = [];
	const proposalTxParamsBatch: ProposalTxParams[] = [];
	const batchMeta: Record<string, unknown>[] = [];
	const chainIdNum = destChainIdNum;
	const legacy =
		Boolean(ctx.data.chainDetail?.legacy) ||
		!(await fetchChainFeeParams(
			(ctx.data.chainDetail.rpcGateway ?? '').trim(),
			chainIdNum,
		)).isEip1559;

	for (const i of activeIndices) {
		const tp = getProposalTxParamsForDetailIndex(txEnvelope, batch, i)!;
		let dataHex = '0x' as `0x${string}`;
		let toAddr: Address | undefined;
		let valueBI = 0n;
		if (!cancelPendingTx) {
			const raw = getMessageRawForDetail(detail, i);
			const hexFull =
				raw && raw.trim().length >= 4
					? ((raw.trim().startsWith('0x') ? raw.trim() : `0x${raw.trim()}`) as `0x${string}`)
					: null;
			if (hexFull) {
				try {
					const p = parseTransaction(hexFull);
					dataHex = (p.data ?? '0x') as `0x${string}`;
					if (p.to) toAddr = getAddress(p.to);
					valueBI = p.value ?? 0n;
				} catch {
					/* calldata-only */
				}
			}
			if (!toAddr) {
				const dest = getDestinationAddressForDetail(detail, i);
				if (dest && /^0x[a-fA-F0-9]{40}$/.test(dest.trim())) {
					toAddr = getAddress(dest.trim().startsWith('0x') ? dest.trim() : `0x${dest.trim()}`);
				}
			}
			if (!toAddr) {
				return {ok: false, reason: `Could not resolve destination for tx ${i + 1}.`};
			}
		} else {
			toAddr = executor;
			dataHex = '0x';
			valueBI = 0n;
		}

		const gasLimitForLeg = cancelPendingTx ? CANCEL_GAS : BigInt(tp.gasLimit);
		let newTp: ProposalTxParams;
		let serialized: `0x${string}`;

		if (legacy || tp.txType === 'legacy') {
			const gp = BigInt(String(tp.gasPrice ?? '0').trim() || '0');
			newTp = {nonce: tp.nonce, gasLimit: gasLimitForLeg.toString(), txType: 'legacy', gasPrice: gp.toString()};
			serialized = serializeTransaction({
				type: 'legacy',
				to: toAddr,
				data: dataHex,
				value: valueBI,
				gas: gasLimitForLeg,
				gasPrice: gp,
				nonce: tp.nonce,
				chainId: chainIdNum,
			});
		} else {
			let maxFeeBI = BigInt(String(tp.maxFeePerGas ?? '0').trim() || '0');
			const maxPrioBI = BigInt(String(tp.maxPriorityFeePerGas ?? '0').trim() || '0');
			if (maxFeeBI < maxPrioBI) maxFeeBI = maxPrioBI;
			newTp = {
				nonce: tp.nonce,
				gasLimit: gasLimitForLeg.toString(),
				txType: 'eip1559',
				maxFeePerGas: maxFeeBI.toString(),
				maxPriorityFeePerGas: maxPrioBI.toString(),
			};
			serialized = serializeTransaction({
				type: 'eip1559',
				to: toAddr,
				data: dataHex,
				value: valueBI,
				gas: gasLimitForLeg,
				maxFeePerGas: maxFeeBI,
				maxPriorityFeePerGas: maxPrioBI,
				nonce: tp.nonce,
				chainId: chainIdNum,
			});
		}

		const hash = keccak256(serialized);
		messageHashes.push(hash.replace(/^0x/, ''));
		messageRawBatch.push(serialized);
		proposalTxParamsBatch.push(newTp);
		batchMeta.push({
			destinationAddress: cancelPendingTx
				? String(executor)
				: (getDestinationAddressForDetail(detail, i) ?? '').trim(),
			signatureText: cancelPendingTx ? '' : (getSignatureTextForDetail(detail, i) ?? '').trim(),
		});
	}

	const keyList = (kg.data.keylist ?? detail.KeyList ?? detail.keyList ?? []) as string[];
	const pubKey = (kg.data.pubkeyhex ?? detail.PubKey ?? detail.pubKey) as string | undefined;
	if (!pubKey?.trim()) {
		return {ok: false, reason: 'Missing pubkey for bump request.'};
	}

	const id = parsed.data.sourceRequestId;
	const purposeBase = cancelPendingTx ? `[Cancel pending tx from ${id}]` : `[Bump from ${id}]`;
	const note = (parsed.data.purposeNote ?? '').trim();
	const purposeTrim = (purposeBase + (note ? ` ${note}` : '')).slice(0, 256);

	const priorExtra = parseSignRequestExtraJSON(detail) ?? {};
	const {batchMeta: _bm, bumpSourceRequestId: _b, ...priorRest} = priorExtra;
	const extraPayload: Record<string, unknown> = {
		...priorRest,
		batchMeta,
		bumpSourceRequestId: id,
		...(from > 0 ? {bumpSlicedFromIndex: from} : {}),
		...(cancelPendingTx ? {cancelPendingTx: true} : {}),
	};
	const extraJSON = JSON.stringify(extraPayload);
	const firstDest = (batchMeta[0]?.destinationAddress as string) ?? '';
	const firstSig = (batchMeta[0]?.signatureText as string) ?? '';

	let bodyForSign: Record<string, unknown>;
	if (activeIndices.length === 1) {
		let msgRaw = '';
		try {
			const p = parseTransaction(messageRawBatch[0] as `0x${string}`);
			const d = (p.data ?? '0x') as string;
			msgRaw = d.startsWith('0x') ? d.slice(2) : d;
		} catch {
			msgRaw = '';
		}
		bodyForSign = {
			keyList,
			pubKey: pubKey.trim(),
			msgHash: messageHashes[0],
			msgRaw,
			destinationChainID: String(destChainIdNum),
			destinationAddress: firstDest,
			destinationContract: firstDest,
			signatureText: firstSig,
			extraJSON,
			purpose: purposeTrim,
			txParams: proposalTxParamsBatch[0],
		};
	} else {
		bodyForSign = {
			keyList,
			pubKey: pubKey.trim(),
			msgHash: messageHashes[0],
			msgRaw: '',
			messageHashes,
			messageRawBatch,
			destinationChainID: String(destChainIdNum),
			destinationAddress: firstDest,
			extraJSON,
			signatureText: firstSig,
			proposalTxParams: proposalTxParamsBatch,
			purpose: purposeTrim,
		};
	}

	return signAndSubmitMultiSignRequest(config, bodyForSign);
}
