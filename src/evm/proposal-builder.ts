import type {NodeSdkConfig} from '../config/schema.js';
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
import type {SdkResult} from '../core/result.js';
import {
	DEFAULT_MANAGEMENT_SIGNING,
	type ManagementSigningMethod,
} from '../schemas/extended.js';
import {buildManagementPostRequest} from '../core/management-signer.js';
import type {
	BuiltMultiSignProposal,
	ChainDetailRow,
	ComposeActionInput,
	KeyGenResultById,
} from '../core/mpc/types.js';
import {resolveChainRegistryEntry} from '../core/registry/networks.js';
import {
	chainSnapshotForCustomGasExtraJSON,
} from '../core/mpc/sign-request-utils.js';
import {encodeActionCalldata} from './encode-calldata.js';
import {fetchChainFeeParams} from './chain-fees.js';
import {gweiToDecimalString} from './gwei.js';
import {getClientIdFromKeyGenResult, isValidRpcUrl} from './rpc-utils.js';
import {
	composeFeePayloadToTxParams,
	gasLimitFromEstimateAndChainConfig,
	type ProposalTxParams,
} from './tx-params.js';

export type BuildMultiSignProposalInput = {
	readonly keyGenResult: KeyGenResultById;
	readonly chainId: number;
	readonly actions: readonly ComposeActionInput[];
	readonly purpose?: string;
	readonly useCustomGas?: boolean;
	readonly startingNonce?: number;
};

export async function buildMultiSignProposal(
	config: NodeSdkConfig,
	input: BuildMultiSignProposalInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltMultiSignProposal>> {
	const {keyGenResult, chainId, actions, purpose, useCustomGas = false} = input;
	if (!keyGenResult?.pubkeyhex || !keyGenResult?.ethereumaddress) {
		return {ok: false, reason: 'KeyGen result missing pubkey or ethereum address.'};
	}
	if (!actions.length) {
		return {ok: false, reason: 'At least one compose action is required.'};
	}

	const chainResult = await resolveChainRegistryEntry(config, chainId);
	if (!chainResult.ok) {
		return chainResult;
	}
	const chainDetail: ChainDetailRow = {
		chainId: chainResult.data.chainId,
		chainName: chainResult.data.chainName,
		rpcGateway: chainResult.data.rpcGateway,
		legacy: chainResult.data.legacy,
		gasLimit: chainResult.data.gasLimit,
		gasMultiplier: chainResult.data.gasMultiplier,
		gasPrice: chainResult.data.gasPrice,
		baseFee: chainResult.data.baseFee ?? undefined,
		priorityFee: chainResult.data.priorityFee ?? undefined,
		baseFeeMultiplier: chainResult.data.baseFeeMultiplier,
		defaultGetSigFeeSpeed: chainResult.data.defaultGetSigFeeSpeed,
	};
	const rpcUrl = (chainDetail.rpcGateway ?? '').trim();
	if (!rpcUrl || !isValidRpcUrl(rpcUrl)) {
		return {ok: false, reason: 'Chain has no RPC URL. Set RPC in chain configuration.'};
	}

	const chain = defineChain({
		id: chainId,
		name: chainDetail.chainName ?? 'Destination',
		nativeCurrency: {decimals: 18, name: 'Ether', symbol: 'ETH'},
		rpcUrls: {default: {http: [rpcUrl]}},
	});
	const publicClient = createPublicClient({chain, transport: http(rpcUrl)});
	const executorAddress = getAddress(
		(keyGenResult.ethereumaddress as string).startsWith('0x')
			? (keyGenResult.ethereumaddress as string)
			: `0x${keyGenResult.ethereumaddress}`,
	) as Address;

	const feeParams = await fetchChainFeeParams(rpcUrl, chainId);
	const legacy = Boolean(chainDetail?.legacy) || !feeParams.isEip1559;
	const gasLimitConfig =
		useCustomGas && chainDetail?.gasLimit != null
			? Number(chainDetail.gasLimit)
			: undefined;
	const gasFeeMultiplier =
		useCustomGas && chainDetail?.gasMultiplier != null
			? Number(chainDetail.gasMultiplier)
			: undefined;

	const nonce =
		input.startingNonce ??
		(await publicClient.getTransactionCount({
			address: executorAddress,
			blockTag: 'pending',
		}));

	const messageHashes: string[] = [];
	const messageRawBatch: string[] = [];
	const batchMeta: {destinationAddress: string; signatureText: string}[] = [];
	let firstTxFeePayload: Record<string, unknown> = {};
	let firstTxCalldataHex: string | null = null;
	const proposalTxParamsBatch: ProposalTxParams[] = [];

	for (let i = 0; i < actions.length; i++) {
		const item = actions[i]!;
		const destContract = item.contractAddress.trim();
		if (!destContract || !/^0x[a-fA-F0-9]{40}$/.test(destContract)) {
			return {
				ok: false,
				reason: `Transaction ${i + 1}: enter a valid destination contract address.`,
			};
		}

		const calldata = encodeActionCalldata(item.signature.trim(), item.args);
		if (i === 0) {
			firstTxCalldataHex = calldata.startsWith('0x') ? calldata : `0x${calldata}`;
		}
		const dataHex = (calldata.startsWith('0x') ? calldata : `0x${calldata}`) as Address;
		const toAddress = getAddress(
			destContract.startsWith('0x') ? destContract : `0x${destContract}`,
		);
		const valueBigInt = item.valueWei != null && item.valueWei !== '' ? BigInt(item.valueWei) : 0n;

		let estimatedGasForTx: bigint;
		try {
			estimatedGasForTx = await publicClient.estimateGas({
				to: toAddress,
				data: dataHex,
				value: valueBigInt,
				account: executorAddress,
			});
		} catch (e) {
			return {
				ok: false,
				reason:
					e instanceof Error
						? `Transaction ${i + 1}: ${e.message}`
						: `Transaction ${i + 1}: gas estimation failed.`,
			};
		}

		const gasLimit = useCustomGas
			? gasLimitFromEstimateAndChainConfig(estimatedGasForTx, gasLimitConfig)
			: estimatedGasForTx;

		const currentNonce = Number(nonce) + i;
		let serialized: `0x${string}`;

		if (legacy) {
			let gasPriceWei = await publicClient.getGasPrice();
			if (useCustomGas && gasFeeMultiplier != null && gasFeeMultiplier > 0) {
				gasPriceWei = (gasPriceWei * BigInt(100 + gasFeeMultiplier)) / 100n;
			}
			if (useCustomGas && chainDetail?.gasPrice != null && chainDetail.gasPrice > 0) {
				const configured = parseGwei(gweiToDecimalString(Number(chainDetail.gasPrice)));
				if (configured > gasPriceWei) gasPriceWei = configured;
			}
			if (i === 0) {
				firstTxFeePayload = {
					txNonce: nonce,
					txGasLimit: gasLimit.toString(),
					txGasPrice: gasPriceWei.toString(),
				};
			}
			proposalTxParamsBatch.push({
				nonce: currentNonce,
				gasLimit: gasLimit.toString(),
				txType: 'legacy',
				gasPrice: gasPriceWei.toString(),
			});
			serialized = serializeTransaction({
				type: 'legacy',
				to: toAddress,
				data: dataHex,
				value: valueBigInt,
				gas: gasLimit,
				gasPrice: gasPriceWei,
				nonce: currentNonce,
				chainId,
			});
		} else {
			const base = feeParams.baseFeeGwei ?? 0;
			const prio = feeParams.priorityFeeGwei ?? 0;
			const basePct =
				useCustomGas && chainDetail?.baseFeeMultiplier != null
					? Math.max(100, Number(chainDetail.baseFeeMultiplier))
					: 100;
			const baseComponent = (base * basePct) / 100;
			const maxPriorityFeePerGas =
				prio > 0 ? parseGwei(gweiToDecimalString(prio)) : parseGwei('1');
			const maxFeePerGas = parseGwei(gweiToDecimalString(baseComponent + prio));
			if (i === 0) {
				firstTxFeePayload = {
					txNonce: nonce,
					txGasLimit: gasLimit.toString(),
					txMaxFeePerGas: maxFeePerGas.toString(),
					txMaxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
				};
			}
			proposalTxParamsBatch.push({
				nonce: currentNonce,
				gasLimit: gasLimit.toString(),
				txType: 'eip1559',
				maxFeePerGas: maxFeePerGas.toString(),
				maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
			});
			serialized = serializeTransaction({
				type: 'eip1559',
				to: toAddress,
				data: dataHex,
				value: valueBigInt,
				gas: gasLimit,
				maxFeePerGas,
				maxPriorityFeePerGas,
				nonce: currentNonce,
				chainId,
			});
		}

		const hash = keccak256(serialized);
		messageHashes.push(hash.startsWith('0x') ? hash.slice(2) : hash);
		messageRawBatch.push(serialized);
		batchMeta.push({
			destinationAddress: destContract,
			signatureText: JSON.stringify({
				signature: item.signature.trim(),
				names: item.args.map(a => (a.name ?? '').trim()),
			}),
		});
	}

	const keyList = keyGenResult.keylist ?? [];
	const clientId = getClientIdFromKeyGenResult(keyGenResult);
	const purposeTrim = (purpose ?? '').trim();
	const firstDest = actions[0]!.contractAddress.trim();
	const firstSigText = batchMeta[0]?.signatureText ?? '';

	let bodyForSign: Record<string, unknown>;
	if (actions.length === 1) {
		const calldata = encodeActionCalldata(
			actions[0]!.signature.trim(),
			actions[0]!.args,
		);
		const msgRaw =
			typeof calldata === 'string' && calldata.startsWith('0x')
				? calldata.slice(2)
				: calldata;
		bodyForSign = {
			keyList,
			pubKey: keyGenResult.pubkeyhex,
			msgHash: messageHashes[0],
			msgRaw,
			destinationChainID: String(chainId),
			destinationAddress: firstDest,
			destinationContract: firstDest,
			signatureText: firstSigText,
			...firstTxFeePayload,
			...(useCustomGas
				? (() => {
						const snap = chainSnapshotForCustomGasExtraJSON(chainDetail);
						return Object.keys(snap).length > 0
							? {extraJSON: JSON.stringify({customGasChainDetails: snap})}
							: {};
					})()
				: {}),
		};
	} else {
		const extraPayload: Record<string, unknown> = {batchMeta};
		if (useCustomGas) {
			const snap = chainSnapshotForCustomGasExtraJSON(chainDetail);
			if (Object.keys(snap).length > 0) {
				extraPayload.customGasChainDetails = snap;
			}
		}
		const extraJSON = JSON.stringify(extraPayload);
		const firstMsgRaw =
			firstTxCalldataHex != null
				? firstTxCalldataHex.startsWith('0x')
					? firstTxCalldataHex.slice(2)
					: firstTxCalldataHex
				: (() => {
						const raw = messageRawBatch[0];
						return typeof raw === 'string'
							? raw.startsWith('0x')
								? raw.slice(2)
								: raw
							: raw;
					})();
		bodyForSign = {
			keyList,
			pubKey: keyGenResult.pubkeyhex,
			msgHash: messageHashes[0],
			msgRaw: firstMsgRaw,
			messageHashes,
			messageRawBatch,
			destinationChainID: String(chainId),
			destinationAddress: firstDest,
			extraJSON,
			signatureText: firstSigText,
			...firstTxFeePayload,
		};
	}

	if (clientId) bodyForSign.clientId = clientId;
	if (purposeTrim) bodyForSign.purpose = purposeTrim;

	if (actions.length === 1) {
		const tp = composeFeePayloadToTxParams(firstTxFeePayload, legacy);
		if (tp) bodyForSign.txParams = tp;
	} else {
		bodyForSign.proposalTxParams = proposalTxParamsBatch;
	}

	const built = await buildManagementPostRequest(
		config,
		{
			path: '/multiSignRequest',
			buildRequestFields: () => bodyForSign,
		},
		signing,
	);
	if (!built.ok) {
		return built;
	}

	return {
		ok: true,
		data: {
			path: '/multiSignRequest',
			unsignedBody: built.data.unsignedBody,
			canonicalJson: built.data.canonicalJson,
			bodyForSign,
			chainId,
			isBatch: actions.length > 1,
			selectedSigningKey: built.data.selectedSigningKey,
		},
	};
}
