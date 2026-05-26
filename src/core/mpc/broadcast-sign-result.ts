import type {NodeSdkConfig} from '../../config/schema.js';
import {
	DEFAULT_MANAGEMENT_SIGNING,
	type ManagementSigningMethod,
} from '../../schemas/extended.js';
import type {SdkResult} from '../result.js';
import {BroadcastSignResultInputSchema} from './schemas.js';
import {
	buildBatchSignedTxsFromResult,
	broadcastErrorMessage,
	isBatchSignRequest,
	getBatchLength,
} from './sign-request-utils.js';
import {
	createPublicClientForChain,
	executorAddressFromKeyGen,
} from './context.js';
import {fetchKeyGenResult} from '../keygen.js';
import {nodeId} from '../general.js';
import {mpcGetSignRequestById, mpcGetSignResultById, mpcPostUpdateSignResultStatusById} from './client.js';
import {keyGenIdFromRecord} from './sign-request-utils.js';
import {assertExecutorNativeSufficientForSignedHexes} from './gas-preflight.js';
import {prepareSignedManagementRequest} from '../management-signer.js';

export async function broadcastSignResult(
	config: NodeSdkConfig,
	input: unknown,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<{requestId: string; txHashes: string[]; status: 'executed'}>> {
	const parsed = BroadcastSignResultInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid broadcast sign result input.'};
	}

	const req = await mpcGetSignRequestById(config, parsed.data.requestId);
	if (!req.ok) return req;

	const signResult = await mpcGetSignResultById(config, parsed.data.requestId);
	if (!signResult.ok) return signResult;

	const result = signResult.data;
	const reqData = req.data as Record<string, unknown>;
	const chainIdRaw =
		result.chainId ?? result.ChainID ?? reqData.DestinationChainID ?? reqData.destinationChainID;
	const chainIdNum =
		typeof chainIdRaw === 'number'
			? chainIdRaw
			: parseInt(String(chainIdRaw), 10);
	if (Number.isNaN(chainIdNum)) {
		return {ok: false, reason: 'Missing valid chain id for broadcast.'};
	}

	const keyGenId = keyGenIdFromRecord(reqData);
	const kg = keyGenId ? await fetchKeyGenResult(config, keyGenId) : null;
	if (!kg?.ok) {
		return {ok: false, reason: 'Could not load KeyGen for broadcast preflight.'};
	}

	const isBatch = isBatchSignRequest(reqData);
	const batchN = isBatch ? getBatchLength(reqData) : 0;
	const batchSignedTxsPrebuilt = (result.SignedTxs ?? result.signedTxs) as
		| string[]
		| undefined;
	const batchSignedTxsBuilt = buildBatchSignedTxsFromResult(result);
	let signedHexes: string[];

	if (isBatch && batchN > 0) {
		const batchSignedTxs =
			Array.isArray(batchSignedTxsPrebuilt) &&
			batchSignedTxsPrebuilt.length === batchN
				? batchSignedTxsPrebuilt
				: batchSignedTxsBuilt != null && batchSignedTxsBuilt.length === batchN
					? batchSignedTxsBuilt
					: null;
		if (batchSignedTxs == null) {
			return {
				ok: false,
				reason: `Could not build ${batchN} signed transaction(s) from batch signatures.`,
			};
		}
		signedHexes = batchSignedTxs.map(h => (h.startsWith('0x') ? h : `0x${h}`));
	} else {
		const signedTxHex = (result.signedTx ??
			result.rawTransaction ??
			result.serializedTx ??
			result.SignedTx) as string | undefined;
		if (signedTxHex && signedTxHex.startsWith('0x')) {
			signedHexes = [signedTxHex];
		} else {
			const built = buildBatchSignedTxsFromResult({
				...result,
				MessageRawBatch: [reqData.MessageRaw ?? reqData.messageRaw],
				batchsignatures: [
					{
						sigr: result.r ?? result.R,
						sigs: result.s ?? result.S,
						sigrecover: result.sigrecover ?? result.Sigrecover ?? '0',
					},
				],
			});
			if (!built || built.length !== 1) {
				return {ok: false, reason: 'Could not build signed transaction from r,s.'};
			}
			signedHexes = built;
		}
	}

	const preflight = await assertExecutorNativeSufficientForSignedHexes(config, {
		keyGenResult: kg.data,
		chainId: chainIdNum,
		signedTxHexes: signedHexes,
	});
	if (!preflight.ok) return preflight;

	const ctx = await createPublicClientForChain(config, chainIdNum);
	if (!ctx.ok) return ctx;

	const txHashes: string[] = [];
	const slowBatch = parsed.data.slowBatch === true;
	for (let i = 0; i < signedHexes.length; i++) {
		const hex = signedHexes[i]! as `0x${string}`;
		try {
			const txHash = (await ctx.data.publicClient.request({
				method: 'eth_sendRawTransaction',
				params: [hex],
			})) as string;
			txHashes.push(txHash.startsWith('0x') ? txHash : `0x${txHash}`);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			return {
				ok: false,
				reason: `Transaction ${i + 1} of ${signedHexes.length} failed: ${broadcastErrorMessage(msg)}`,
			};
		}
		if (slowBatch && i < signedHexes.length - 1) {
			const blockAfter = await ctx.data.publicClient.getBlockNumber();
			const slowDeadline = Date.now() + 6 * 60 * 1000;
			while (Date.now() < slowDeadline) {
				await new Promise(r => setTimeout(r, 2000));
				const b = await ctx.data.publicClient.getBlockNumber();
				if (b > blockAfter) break;
			}
		}
	}

	const self = await nodeId(config);
	if (!self.ok) {
		return {
			ok: true,
			data: {
				requestId: parsed.data.requestId,
				txHashes,
				status: 'executed',
			},
		};
	}

	const signed = await prepareSignedManagementRequest(config, signing, () => ({
		requestId: parsed.data.requestId,
		status: 'executed',
		...(txHashes.length > 1
			? {batchTransactionHashes: txHashes}
			: {transactionHash: txHashes[0]}),
	}));
	if (signed.ok) {
		await mpcPostUpdateSignResultStatusById(config, signed.data.body);
	}

	return {
		ok: true,
		data: {requestId: parsed.data.requestId, txHashes, status: 'executed'},
	};
}
