import {
	createPublicClient,
	defineChain,
	getAddress,
	http,
	keccak256,
	parseGwei,
	serializeTransaction,
	type Address,
} from 'viem';
import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../result.js';
import {TransferNativeInputSchema} from './schemas.js';
import {fetchKeyGenResult} from '../keygen.js';
import {resolveChainRegistryEntry} from '../registry/networks.js';
import {isValidRpcUrl} from '../../evm/rpc-utils.js';
import {fetchChainFeeParams} from '../../evm/chain-fees.js';
import {gweiToDecimalString} from '../../evm/gwei.js';
import {resolveEip1559FeeWei} from '../../evm/eip1559-fee-wei.js';
import {composeFeePayloadToTxParams, gasLimitFromEstimateAndChainConfig} from '../../evm/tx-params.js';
import {signAndSubmitMultiSignRequest} from './sign-request-body.js';
import {assertExecutorNativeSufficientForProposal} from './gas-preflight.js';
import {resolveTransferRecipient} from './resolve-recipient.js';
import {resolveChainForTransfer} from './resolve-transfer-input.js';
import type {BuiltMultiSignProposal} from './types.js';

export async function transferNativeGas(
	config: NodeSdkConfig,
	input: unknown,
): Promise<SdkResult<{requestId: string}>> {
	const parsed = TransferNativeInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid native transfer input.'};
	}

	const resolvedChain = await resolveChainForTransfer(config, {
		chainId: parsed.data.chainId,
		chainName: parsed.data.chainName,
	});
	if (!resolvedChain.ok) {
		return resolvedChain;
	}
	const destinationChainId = resolvedChain.data.chainId;

	const recipient = await resolveTransferRecipient(config, {
		toAddress: parsed.data.toAddress,
		toContactName: parsed.data.toContactName,
		chainId: destinationChainId,
	});
	if (!recipient.ok) {
		return recipient;
	}

	const kg = await fetchKeyGenResult(config, parsed.data.keyGenId);
	if (!kg.ok) return kg;

	const chainResult = await resolveChainRegistryEntry(config, destinationChainId);
	if (!chainResult.ok) return chainResult;
	const chainDetail = chainResult.data;
	const rpcUrl = (chainDetail.rpcGateway ?? '').trim();
	if (!rpcUrl || !isValidRpcUrl(rpcUrl)) {
		return {ok: false, reason: 'Chain has no RPC URL.'};
	}

	const viemChain = defineChain({
		id: destinationChainId,
		name: 'Assets',
		nativeCurrency: {decimals: 18, name: 'Ether', symbol: 'ETH'},
		rpcUrls: {default: {http: [rpcUrl]}},
	});
	const publicClient = createPublicClient({chain: viemChain, transport: http(rpcUrl)});
	const executorAddress = getAddress(
		(kg.data.ethereumaddress as string).startsWith('0x')
			? (kg.data.ethereumaddress as string)
			: `0x${kg.data.ethereumaddress}`,
	) as Address;
	const toAddress = getAddress(
		recipient.data.startsWith('0x') ? recipient.data : `0x${recipient.data}`,
	);
	const valueBigInt = BigInt(parsed.data.amountWei);
	if (valueBigInt <= 0n) {
		return {ok: false, reason: 'Amount must be greater than zero.'};
	}

	const nonce =
		parsed.data.startingNonce ??
		(await publicClient.getTransactionCount({
			address: executorAddress,
			blockTag: 'pending',
		}));
	const feeParams = await fetchChainFeeParams(rpcUrl, destinationChainId);
	const legacy = Boolean(chainDetail?.legacy) || !feeParams.isEip1559;
	let estimatedGas = 21000n;
	try {
		const n = await publicClient.estimateGas({
			account: executorAddress,
			to: toAddress,
			value: valueBigInt,
			data: '0x',
		});
		if (n > 0n) estimatedGas = n;
	} catch {
		/* Ethereum floor when the RPC cannot estimate */
	}
	const configuredGasLimit =
		chainDetail?.gasLimit != null && chainDetail.gasLimit > 0
			? Math.floor(chainDetail.gasLimit)
			: undefined;
	const gasLimit = gasLimitFromEstimateAndChainConfig(estimatedGas, configuredGasLimit);
	const gasFeeMultiplier =
		chainDetail?.gasMultiplier != null ? Number(chainDetail.gasMultiplier) : undefined;

	const dataHex = '0x' as Address;
	const txFeePayload: Record<string, unknown> = {
		txNonce: Number(nonce),
		txGasLimit: gasLimit.toString(),
	};
	let txSigningHash: Address;
	let unsignedTx: `0x${string}`;

	if (legacy) {
		let gasPriceWei = await publicClient.getGasPrice();
		if (gasFeeMultiplier != null && gasFeeMultiplier > 0) {
			gasPriceWei = (gasPriceWei * BigInt(100 + gasFeeMultiplier)) / 100n;
		}
		const configuredGasPriceGwei =
			chainDetail?.gasPrice != null ? Number(chainDetail.gasPrice) : undefined;
		const configuredGasPriceWei =
			configuredGasPriceGwei != null && configuredGasPriceGwei > 0
				? parseGwei(gweiToDecimalString(configuredGasPriceGwei))
				: 0n;
		const gasPrice =
			configuredGasPriceWei > gasPriceWei ? configuredGasPriceWei : gasPriceWei;
		txFeePayload.txGasPrice = gasPrice.toString();
		unsignedTx = serializeTransaction({
			type: 'legacy',
			to: toAddress,
			data: dataHex,
			value: valueBigInt,
			gas: gasLimit,
			gasPrice,
			nonce,
			chainId: destinationChainId,
		});
		txSigningHash = keccak256(unsignedTx);
	} else {
		const fetchedBase = feeParams.baseFeeGwei ?? 0;
		const fetchedPriority = feeParams.priorityFeeGwei ?? 0;
		const configuredBase = chainDetail?.baseFee != null ? Number(chainDetail.baseFee) : 0;
		const configuredPriority =
			chainDetail?.priorityFee != null ? Number(chainDetail.priorityFee) : 0;
		const effectiveBaseFeeGwei = Math.max(fetchedBase, configuredBase);
		const effectivePriorityFeeGwei = Math.max(fetchedPriority, configuredPriority);
		const baseFeeMultiplierPct =
			chainDetail?.baseFeeMultiplier != null
				? Math.max(100, Number(chainDetail.baseFeeMultiplier))
				: 100;
		const baseComponentGwei =
			(effectiveBaseFeeGwei * baseFeeMultiplierPct) / 100;
		const resolvedFees = resolveEip1559FeeWei(baseComponentGwei, effectivePriorityFeeGwei);
		let maxPriorityFeePerGas = resolvedFees.maxPriorityFeePerGas;
		let maxFeePerGas = resolvedFees.maxFeePerGas;
		if (gasFeeMultiplier != null && gasFeeMultiplier > 0) {
			maxPriorityFeePerGas =
				(maxPriorityFeePerGas * BigInt(100 + gasFeeMultiplier)) / 100n;
			maxFeePerGas = (maxFeePerGas * BigInt(100 + gasFeeMultiplier)) / 100n;
		}
		txFeePayload.txMaxFeePerGas = maxFeePerGas.toString();
		txFeePayload.txMaxPriorityFeePerGas = maxPriorityFeePerGas.toString();
		unsignedTx = serializeTransaction({
			type: 'eip1559',
			to: toAddress,
			data: dataHex,
			value: valueBigInt,
			gas: gasLimit,
			maxFeePerGas,
			maxPriorityFeePerGas,
			nonce,
			chainId: destinationChainId,
		});
		txSigningHash = keccak256(unsignedTx);
	}

	const msgHash = txSigningHash.startsWith('0x')
		? txSigningHash.slice(2)
		: txSigningHash;
	const keyList = kg.data.keylist ?? [];
	const signatureText = JSON.stringify({
		signature: 'transfer',
		names: ['to', 'value'],
	});
	const bodyForSign: Record<string, unknown> = {
		keyList,
		pubKey: kg.data.pubkeyhex,
		msgHash,
		// Full unsigned transaction. Calldata-only msgRaw cannot survive Get Sig.
		msgRaw: unsignedTx,
		destinationChainID: String(destinationChainId),
		destinationAddress: recipient.data,
		destinationContract: recipient.data,
		signatureText,
		...txFeePayload,
		sendGas: true,
		value: parsed.data.amountWei,
	};
	if (parsed.data.purpose) bodyForSign.purpose = parsed.data.purpose;
	const tp = composeFeePayloadToTxParams(txFeePayload, legacy);
	if (tp) bodyForSign.txParams = tp;

	const preflight = await assertExecutorNativeSufficientForProposal(config, {
		keyGenResult: kg.data,
		chainId: destinationChainId,
		proposal: {bodyForSign},
		valueWeiPerLeg: [valueBigInt],
	});
	if (!preflight.ok) return preflight;

	return signAndSubmitMultiSignRequest(config, bodyForSign);
}
