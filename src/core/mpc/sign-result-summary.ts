import {
	effectiveExpiryUnixForSignRequestRow,
	getCustomGasChainDetailsFromExtraJSON,
	getBatchLength,
	getSignRequestOriginatorNodeKey,
	isBatchSignRequest,
	isSignRequestExpired,
	joinClientAgreementProgress,
	keyGenIdFromRecord,
	signRequestJoinAgreementState,
	signResultHasExecutableSignature,
	txParamsFromGetSignRequestIdData,
} from './sign-request-utils.js';
import type {SignRequestDetail} from './types.js';

function readString(
	r: Record<string, unknown>,
	...keys: string[]
): string | undefined {
	for (const key of keys) {
		const v = r[key];
		if (v != null && String(v).trim() !== '') {
			return String(v).trim();
		}
	}
	return undefined;
}

function readRequestId(r: Record<string, unknown>): string {
	return (
		readString(r, 'requestid', 'requestId', 'RequestId', 'RequestID') ?? ''
	);
}

function readStatus(r: Record<string, unknown>): string {
	return (
		readString(r, 'status', 'Status') ??
		readString(
			(r.SignRequestDataPb ?? r.signRequestDataPb) as Record<string, unknown>,
			'status',
			'Status',
		) ??
		''
	).toLowerCase();
}

export function readSignResultTransactionHashes(
	result: Record<string, unknown>,
): string[] {
	const single = readString(
		result,
		'transactionHash',
		'TransactionHash',
		'transactionhash',
	);
	const batchRaw = (result.batchTransactionHashes ??
		result.BatchTransactionHashes ??
		result.batchtransactionhashes) as unknown;
	if (Array.isArray(batchRaw)) {
		const batch = batchRaw
			.map(h => String(h).trim())
			.filter(h => h.length > 0);
		if (batch.length > 0) return batch;
	}
	return single ? [single] : [];
}

export type SignResultExecutionState = {
	readonly signResultStatus: string | undefined;
	readonly executedOnChain: boolean;
	readonly transactionHashes: readonly string[];
	readonly readyToBroadcast: boolean;
};

/** Distinguish MPC-signed (ready to broadcast) from recorded on-chain execution. */
export function signResultExecutionState(
	result: Record<string, unknown>,
): SignResultExecutionState {
	const signResultStatus = readString(result, 'status', 'Status');
	const normalizedStatus = signResultStatus?.toLowerCase();
	const transactionHashes = readSignResultTransactionHashes(result);
	const hasSignature = signResultHasExecutableSignature(result);
	const executedOnChain =
		normalizedStatus === 'executed' || transactionHashes.length > 0;
	const readyToBroadcast =
		hasSignature &&
		!executedOnChain &&
		normalizedStatus !== 'shelved' &&
		normalizedStatus !== 'failed';

	return {
		signResultStatus,
		executedOnChain,
		transactionHashes,
		readyToBroadcast,
	};
}

export {getSignRequestOriginatorNodeKey as signRequestOriginatorNodeKey} from './sign-request-utils.js';

function signRequestHasGetSigTxParams(merged: Record<string, unknown>): boolean {
	if (txParamsFromGetSignRequestIdData(merged) != null) return true;
	const nested = (merged.txParams ?? merged.TxParams) as Record<string, unknown> | undefined;
	if (!nested || typeof nested !== 'object' || Array.isArray(nested)) return false;
	const gl = nested.gas_limit ?? nested.gasLimit ?? nested.GasLimit ?? nested.gas;
	const tt = nested.tx_type ?? nested.txType ?? nested.TxType;
	return gl != null && String(gl).trim() !== '' && tt != null && String(tt).trim() !== '';
}

export function summarizeSignRequestForAgent(
	row: SignRequestDetail | Record<string, unknown>,
	localNodeId?: string | null,
): Record<string, unknown> {
	const r =
		row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
	const nested = (r.SignRequestDataPb ?? r.signRequestDataPb) as
		| Record<string, unknown>
		| undefined;
	const merged: Record<string, unknown> = nested ? {...nested, ...r} : r;
	const requestId = readRequestId(merged);
	const isBatch = isBatchSignRequest(merged);
	const joinProgress = joinClientAgreementProgress(merged);
	const joinAgreement = localNodeId
		? signRequestJoinAgreementState(merged, localNodeId)
		: null;

	const lifecycleStatus = readStatus(merged) || undefined;
	const getSigTriggered = signRequestHasGetSigTxParams(merged);
	const expiryDate = effectiveExpiryUnixForSignRequestRow(merged) ?? undefined;
	const isExpired = isSignRequestExpired(merged);

	return {
		requestId,
		status: lifecycleStatus,
		lifecycleStatus,
		getSigTriggered,
		expiryDate,
		isExpired,
		destinationChainId: readString(
			merged,
			'DestinationChainID',
			'destinationChainID',
		),
		originatorNodeKey: getSignRequestOriginatorNodeKey(merged),
		keyGenId: keyGenIdFromRecord(merged) || undefined,
		proposalUsedCustomGas: Boolean(getCustomGasChainDetailsFromExtraJSON(merged)),
		isBatch,
		batchLength: isBatch ? getBatchLength(merged) : 1,
		joinAgreedCount: joinProgress?.agreed,
		joinKeyCount: joinProgress?.total,
		...(joinAgreement
			? {
					localJoinAgreed: joinAgreement.localJoinAgreed,
					isOriginatorLocal: joinAgreement.isOriginatorLocal,
					localAgreementPending: joinAgreement.localAgreementPending,
				}
			: {}),
	};
}

export function summarizeSignResultForAgent(
	result: Record<string, unknown>,
): Record<string, unknown> {
	const batchSigs = (result.batchsignatures ?? result.BatchSignatures) as
		| unknown[]
		| undefined;
	const batchSizeRaw = result.BatchSize ?? result.batchSize;
	const batchSize =
		typeof batchSizeRaw === 'number'
			? batchSizeRaw
			: Array.isArray(batchSigs)
				? batchSigs.length
				: undefined;
	const completedBatchLegs = Array.isArray(batchSigs)
		? batchSigs.filter(entry => {
				if (!entry || typeof entry !== 'object') return false;
				const e = entry as Record<string, unknown>;
				return Boolean(
					String(e.sigr ?? e.Sigr ?? e.r ?? e.R ?? '').trim() &&
						String(e.sigs ?? e.Sigs ?? e.s ?? e.S ?? '').trim(),
				);
			}).length
		: undefined;
	const hasSignature = signResultHasExecutableSignature(result);
	const execution = signResultExecutionState(result);
	const isBatch = Boolean(
		result.BatchSignResult ?? result.batchSignResult ?? batchSize != null,
	);

	const out: Record<string, unknown> = {
		signResultStatus: execution.signResultStatus,
		executedOnChain: execution.executedOnChain,
		readyToBroadcast: execution.readyToBroadcast,
		readyToExecute: execution.readyToBroadcast,
		hasSignature,
		batchSignResult: isBatch || undefined,
		batchSize,
		completedBatchLegs,
		chainId:
			result.chainId ??
			result.ChainID ??
			result.ChainId ??
			result.DestinationChainID ??
			result.destinationChainID,
	};
	if (execution.transactionHashes.length > 0) {
		out.transactionHashes = [...execution.transactionHashes];
	}
	return out;
}

export function summarizeSignRequestsForAgent(
	rows: readonly unknown[],
	localNodeId?: string | null,
): Record<string, unknown>[] {
	return rows
		.filter((row): row is Record<string, unknown> => row != null && typeof row === 'object')
		.map(row => summarizeSignRequestForAgent(row, localNodeId));
}
