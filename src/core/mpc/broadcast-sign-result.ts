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
import {createPublicClientForChain} from './context.js';
import {fetchKeyGenResult} from '../keygen.js';
import {nodeId} from '../general.js';
import {
	mpcGetSignRequestById,
	mpcGetSignResultById,
	mpcPostUpdateSignResultStatusById,
} from './client.js';
import {keyGenIdFromRecord} from './sign-request-utils.js';
import {assertExecutorNativeSufficientForSignedHexes} from './gas-preflight.js';
import {
	buildManagementPostRequest,
	managementSign,
	type BuiltManagementPostRequest,
} from '../management-signer.js';

export type BuiltBroadcastSignResult = {
	readonly signedTxHexes: string[];
	readonly requestId: string;
	readonly chainId: number;
};

async function resolveBroadcastSignedHexes(
	config: NodeSdkConfig,
	requestId: string,
): Promise<
	SdkResult<{
		signedTxHexes: string[];
		chainId: number;
	}>
> {
	const req = await mpcGetSignRequestById(config, requestId);
	if (!req.ok) return req;

	const signResult = await mpcGetSignResultById(config, requestId);
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

	return {
		ok: true,
		data: {
			signedTxHexes: signedHexes,
			chainId: chainIdNum,
		},
	};
}

export async function buildBroadcastSignResult(
	config: NodeSdkConfig,
	input: unknown,
): Promise<SdkResult<BuiltBroadcastSignResult>> {
	const parsed = BroadcastSignResultInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid broadcast sign result input.'};
	}

	const resolved = await resolveBroadcastSignedHexes(config, parsed.data.requestId);
	if (!resolved.ok) return resolved;

	return {
		ok: true,
		data: {
			signedTxHexes: resolved.data.signedTxHexes,
			requestId: parsed.data.requestId,
			chainId: resolved.data.chainId,
		},
	};
}

export async function buildBroadcastSignResultStatusUpdate(
	config: NodeSdkConfig,
	input: {requestId: string; txHashes: string[]},
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	if (input.txHashes.length === 0) {
		return {ok: false, reason: 'At least one transaction hash is required.'};
	}

	return buildManagementPostRequest(
		config,
		{
			path: '/updateSignResultStatusById',
			buildRequestFields: () => ({
				requestId: input.requestId,
				status: 'executed',
				...(input.txHashes.length > 1
					? {batchTransactionHashes: input.txHashes}
					: {transactionHash: input.txHashes[0]}),
			}),
		},
		signing,
	);
}

export async function broadcastSignResult(
	config: NodeSdkConfig,
	input: unknown,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<{requestId: string; txHashes: string[]; status: 'executed'}>> {
	const parsed = BroadcastSignResultInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid broadcast sign result input.'};
	}

	const built = await buildBroadcastSignResult(config, input);
	if (!built.ok) return built;

	const ctx = await createPublicClientForChain(config, built.data.chainId);
	if (!ctx.ok) return ctx;

	const txHashes: string[] = [];
	const slowBatch = parsed.data.slowBatch === true;
	for (let i = 0; i < built.data.signedTxHexes.length; i++) {
		const hex = built.data.signedTxHexes[i]! as `0x${string}`;
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
				reason: `Transaction ${i + 1} of ${built.data.signedTxHexes.length} failed: ${broadcastErrorMessage(msg)}`,
			};
		}
		if (slowBatch && i < built.data.signedTxHexes.length - 1) {
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

	const statusBuilt = await buildBroadcastSignResultStatusUpdate(
		config,
		{requestId: parsed.data.requestId, txHashes},
		signing,
	);
	if (statusBuilt.ok) {
		const signed = await managementSign(
			config,
			signing,
			statusBuilt.data.unsignedBody,
		);
		if (signed.ok) {
			await mpcPostUpdateSignResultStatusById(config, signed.data);
		}
	}

	return {
		ok: true,
		data: {requestId: parsed.data.requestId, txHashes, status: 'executed'},
	};
}
