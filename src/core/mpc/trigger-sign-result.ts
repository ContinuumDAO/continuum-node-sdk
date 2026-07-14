import {
	getAddress,
	isAddress,
	keccak256,
	serializeTransaction,
	type Address,
} from 'viem';
import type {NodeSdkConfig} from '../../config/schema.js';
import {fetchChainFeeParams} from '../../evm/chain-fees.js';
import {
	fetchEip1559ReplacementFloorWei,
	fetchLegacyReplacementGasPriceFloorWei,
} from '../../evm/replacement-fee-floor.js';
import {
	getDefaultGetSigFeeSpeedFromChainDetail,
	normalizeGetSigFeeSpeedTier,
	resolveGetSigFeeWei,
	type ResolvedGetSigEip1559Fees,
	type ResolvedGetSigLegacyFees,
} from '../../evm/get-sig-fee-speed.js';
import {
	gasLimitFromEstimateAndChainConfig,
	type ProposalTxParams,
} from '../../evm/tx-params.js';
import {
	DEFAULT_MANAGEMENT_SIGNING,
	type ManagementSigningMethod,
} from '../../schemas/extended.js';
import type {SdkResult} from '../result.js';
import {
	buildManagementPostRequest,
	managementSign,
	type BuiltManagementPostRequest,
} from '../management-signer.js';
import {TriggerSignResultInputSchema} from './schemas.js';
import {summarizeSignResultForAgent} from './sign-result-summary.js';
import {
	applyCustomGasChainDetailsToChainDetail,
	getCustomGasChainDetailsFromExtraJSON,
	isBatchSignRequest,
	getBatchLength,
	messageRawToCalldata,
	mpaTotalCreditsRemaining,
	resolveProposalGasLimitWeiForDetailIndex,
	tryParseNonceFromMessageRawForGetSig,
	keyGenIdFromRecord,
} from './sign-request-utils.js';
import {
	createPublicClientForChain,
	executorAddressFromKeyGen,
} from './context.js';
import {fetchGlobalNonceByKeyGenId, fetchKeyGenResult} from '../keygen.js';
import {
	mpcGetSignRequestById,
	mpcGetSignResultById,
	mpcPostTriggerSignRequestById,
} from './client.js';
import {getMpaWalletStatus} from './mpa-top-up.js';
import {
	getEip712MessageHashFromDetail,
	isEip712SignRequest,
} from './eip712-sign-request.js';

const POLL_MS = 5000;
const POLL_TIMEOUT_MS = 120_000;

export async function buildTriggerSignResult(
	config: NodeSdkConfig,
	input: unknown,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = TriggerSignResultInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid trigger sign result input.'};
	}

	const req = await mpcGetSignRequestById(config, parsed.data.requestId);
	if (!req.ok) return req;

	const reqData = req.data as Record<string, unknown>;

	if (isEip712SignRequest(reqData)) {
		const messageHash = getEip712MessageHashFromDetail(reqData);
		if (!messageHash) {
			return {ok: false, reason: 'EIP-712 sign request is missing MessageHash.'};
		}
		return buildManagementPostRequest(
			config,
			{
				path: '/triggerSignRequestById',
				buildRequestFields: () => ({
					requestId: parsed.data.requestId,
					messageHash,
				}),
			},
			signing,
		);
	}

	const destChainIdStr = String(
		reqData.DestinationChainID ?? reqData.destinationChainID ?? '',
	).trim();
	const destChainIdNum = parseInt(destChainIdStr, 10);
	if (!destChainIdStr || Number.isNaN(destChainIdNum)) {
		return {ok: false, reason: 'Sign request missing destination chain id.'};
	}

	const keyGenId = keyGenIdFromRecord(reqData);
	if (!keyGenId) {
		return {ok: false, reason: 'Sign request missing KeyGen id.'};
	}

	const kg = await fetchKeyGenResult(config, keyGenId);
	if (!kg.ok) return kg;

	const globalNonce = await fetchGlobalNonceByKeyGenId(config, keyGenId);
	const globalNonceVal = globalNonce.ok ? globalNonce.data : undefined;

	if (globalNonceVal !== 0) {
		const mpa = await getMpaWalletStatus(config, {keyGenId});
		if (mpa.ok && mpaTotalCreditsRemaining(mpa.data) < 1) {
			return {
				ok: false,
				reason:
					'Insufficient MPA credits for Get Sig. Top up on Linea before continuing.',
			};
		}
	} else {
		const exec = executorAddressFromKeyGen(kg.data);
		if (!exec) {
			return {ok: false, reason: 'KeyGen missing executor address.'};
		}
		const ctx = await createPublicClientForChain(config, destChainIdNum);
		if (!ctx.ok) return ctx;
		const bal = await ctx.data.publicClient.getBalance({address: exec});
		if (bal === 0n) {
			return {
				ok: false,
				reason: 'Executor has no native balance on destination chain for gas.',
			};
		}
	}

	const ctx = await createPublicClientForChain(config, destChainIdNum);
	if (!ctx.ok) return ctx;
	const {publicClient, chainDetail: chainDetailFromApi} = ctx.data;
	const chainDetail = applyCustomGasChainDetailsToChainDetail(
		chainDetailFromApi,
		getCustomGasChainDetailsFromExtraJSON(reqData),
	);
	const rpcUrl = (chainDetailFromApi.rpcGateway ?? '').trim();
	const feeParams = await fetchChainFeeParams(rpcUrl, destChainIdNum);
	const legacy = Boolean(chainDetail?.legacy) || !feeParams.isEip1559;
	const executor = executorAddressFromKeyGen(kg.data);
	if (!executor) {
		return {ok: false, reason: 'Invalid executor address.'};
	}

	const tier = normalizeGetSigFeeSpeedTier(
		parsed.data.feeSpeedTier ??
			getDefaultGetSigFeeSpeedFromChainDetail(chainDetail),
	);
	const gasFeeMultiplier =
		chainDetail?.gasMultiplier != null ? Number(chainDetail.gasMultiplier) : undefined;

	const isBatch = isBatchSignRequest(reqData);
	const batchN = isBatch ? getBatchLength(reqData) : 1;
	const txParamsBatch: ProposalTxParams[] = [];
	const messageHashes: string[] = [];

	for (let i = 0; i < batchN; i++) {
		const raw = (reqData.MessageRawBatch ?? reqData.messageRawBatch) as
			| string[]
			| undefined;
		const topRaw = (reqData.MessageRaw ?? reqData.messageRaw) as string | undefined;
		const messageRaw =
			i === 0 && topRaw
				? topRaw
				: Array.isArray(raw) && raw[i] != null
					? String(raw[i])
					: undefined;
		const rawHex =
			messageRaw && messageRaw.trim() !== ''
				? messageRaw.trim().startsWith('0x')
					? messageRaw.trim()
					: `0x${messageRaw.trim()}`
				: '';
		const calldataHex = messageRawToCalldata(rawHex) ?? '0x';
		const dataHex = (calldataHex.startsWith('0x') ? calldataHex : `0x${calldataHex}`) as Address;
		const toAddr = String(
			reqData.DestinationAddress ?? reqData.destinationAddress ?? '',
		).trim();
		const toAddressForCall =
			toAddr && isAddress(toAddr)
				? getAddress(toAddr.startsWith('0x') ? toAddr : `0x${toAddr}`)
				: undefined;

		const latestNonceOnChain = await publicClient.getTransactionCount({
			address: executor,
			blockTag: 'latest',
		});
		const storedNonce = tryParseNonceFromMessageRawForGetSig(messageRaw);
		let nonce: number;
		if (storedNonce != null) {
			if (storedNonce < latestNonceOnChain) {
				return {
					ok: false,
					reason: `Stored nonce ${storedNonce} already confirmed (latest ${latestNonceOnChain}).`,
				};
			}
			nonce = storedNonce;
		} else {
			nonce = await publicClient.getTransactionCount({
				address: executor,
				blockTag: 'pending',
			});
		}

		const replacementLegacy = legacy
			? await fetchLegacyReplacementGasPriceFloorWei(
					publicClient,
					executor,
					nonce,
					1,
					[nonce],
				)
			: null;
		const replacement1559 = !legacy
			? await fetchEip1559ReplacementFloorWei(
					publicClient,
					executor,
					nonce,
					1,
					[nonce],
				)
			: null;

		const gasLimitConfig =
			chainDetail?.gasLimit != null ? Number(chainDetail.gasLimit) : undefined;
		const storedGas = resolveProposalGasLimitWeiForDetailIndex(reqData, i);
		let estimatedGas =
			storedGas ??
			(dataHex === '0x' || dataHex.length <= 2
				? 21000n
				: await publicClient.estimateGas({
						to: toAddressForCall!,
						data: dataHex,
						value: 0n,
						account: executor,
					}));
		const gasLimit = gasLimitFromEstimateAndChainConfig(estimatedGas, gasLimitConfig);

		let messageHash: string;
		let txParams: ProposalTxParams;

		if (legacy) {
			const resolved = (await resolveGetSigFeeWei({
				publicClient,
				feeParams,
				chainDetail,
				legacy: true,
				tier,
				advancedGasPriceGwei: parsed.data.advancedGasPriceGwei,
				gasFeeMultiplier,
				legacyReplacementGasPriceWei: replacementLegacy,
			})) as ResolvedGetSigLegacyFees;
			const gasPrice = resolved.gasPriceWei;
			const serialized = serializeTransaction({
				type: 'legacy',
				to: toAddressForCall,
				data: dataHex,
				value: 0n,
				gas: gasLimit,
				gasPrice,
				nonce,
				chainId: destChainIdNum,
			});
			messageHash = keccak256(serialized).replace(/^0x/, '');
			txParams = {
				nonce,
				gasLimit: gasLimit.toString(),
				txType: 'legacy',
				gasPrice: gasPrice.toString(),
			};
		} else {
			const resolved = (await resolveGetSigFeeWei({
				publicClient,
				feeParams,
				chainDetail,
				legacy: false,
				tier,
				advancedMaxFeeGwei: parsed.data.advancedMaxFeeGwei,
				advancedPriorityFeeGwei: parsed.data.advancedPriorityFeeGwei,
				gasFeeMultiplier,
				eip1559ReplacementFloorWei: replacement1559,
			})) as ResolvedGetSigEip1559Fees;
			const serialized = serializeTransaction({
				type: 'eip1559',
				to: toAddressForCall,
				data: dataHex,
				value: 0n,
				gas: gasLimit,
				maxFeePerGas: resolved.maxFeePerGas,
				maxPriorityFeePerGas: resolved.maxPriorityFeePerGas,
				nonce,
				chainId: destChainIdNum,
			});
			messageHash = keccak256(serialized).replace(/^0x/, '');
			txParams = {
				nonce,
				gasLimit: gasLimit.toString(),
				txType: 'eip1559',
				maxFeePerGas: resolved.maxFeePerGas.toString(),
				maxPriorityFeePerGas: resolved.maxPriorityFeePerGas.toString(),
			};
		}
		messageHashes.push(messageHash);
		txParamsBatch.push(txParams);
	}

	return buildManagementPostRequest(
		config,
		{
			path: '/triggerSignRequestById',
			buildRequestFields: () => {
				const fields: Record<string, unknown> = {
					requestId: parsed.data.requestId,
				};
				if (isBatch && batchN > 1) {
					fields.txParamsBatch = txParamsBatch;
					fields.messageHashes = messageHashes;
				} else {
					fields.txParams = txParamsBatch[0];
					fields.messageHash = messageHashes[0];
				}
				return fields;
			},
		},
		signing,
	);
}

export async function triggerSignResult(
	config: NodeSdkConfig,
	input: unknown,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{requestId: string; signResultSummary: Record<string, unknown>}>
> {
	const parsed = TriggerSignResultInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid trigger sign result input.'};
	}

	const built = await buildTriggerSignResult(config, input, signing);
	if (!built.ok) return built;

	const signed = await managementSign(config, signing, built.data.unsignedBody);
	if (!signed.ok) return signed;

	const triggered = await mpcPostTriggerSignRequestById(config, signed.data);
	if (!triggered.ok) return triggered;

	const deadline = Date.now() + POLL_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const result = await mpcGetSignResultById(config, parsed.data.requestId);
		if (result.ok) {
			const thoughts = result.data.Thoughts ?? result.data.thoughts;
			if (thoughts != null || result.data.r != null || result.data.s != null) {
				return {
					ok: true,
					data: {
						requestId: parsed.data.requestId,
						signResultSummary: summarizeSignResultForAgent(result.data),
					},
				};
			}
		}
		await new Promise(r => setTimeout(r, POLL_MS));
	}

	return {ok: false, reason: 'Timeout waiting for sign result (2 minutes).'};
}
