import {
	getCustomGasChainDetailsFromExtraJSON,
	getBatchLength,
	isBatchSignRequest,
	keyGenIdFromRecord,
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

export function signRequestOriginatorNodeKey(
	detail: SignRequestDetail | Record<string, unknown> | null | undefined,
): string | undefined {
	if (!detail || typeof detail !== 'object') return undefined;
	const d = detail as Record<string, unknown>;
	const purposeRaw = d.Purpose ?? d.purpose;
	if (purposeRaw == null || typeof purposeRaw !== 'object' || Array.isArray(purposeRaw)) {
		return undefined;
	}
	const keys = Object.keys(purposeRaw as Record<string, unknown>);
	if (keys.length === 0) return undefined;
	return keys[0];
}

export function summarizeSignRequestForAgent(
	row: SignRequestDetail | Record<string, unknown>,
): Record<string, unknown> {
	const r =
		row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
	const nested = (r.SignRequestDataPb ?? r.signRequestDataPb) as
		| Record<string, unknown>
		| undefined;
	const merged: Record<string, unknown> = nested ? {...nested, ...r} : r;
	const requestId = readRequestId(merged);
	const isBatch = isBatchSignRequest(merged);
	const sigList = merged.SigList ?? merged.sigList;
	const agreeingCount =
		sigList && typeof sigList === 'object' && !Array.isArray(sigList)
			? Object.keys(sigList as Record<string, unknown>).length
			: undefined;

	return {
		requestId,
		status: readStatus(merged) || undefined,
		destinationChainId: readString(
			merged,
			'DestinationChainID',
			'destinationChainID',
		),
		originatorNodeKey: signRequestOriginatorNodeKey(merged),
		keyGenId: keyGenIdFromRecord(merged) || undefined,
		proposalUsedCustomGas: Boolean(getCustomGasChainDetailsFromExtraJSON(merged)),
		isBatch,
		batchLength: isBatch ? getBatchLength(merged) : 1,
		agreeingCount,
	};
}

export function summarizeSignResultForAgent(
	result: Record<string, unknown>,
): Record<string, unknown> {
	const status = readString(result, 'status', 'Status');
	const r = result.r ?? result.R;
	const s = result.s ?? result.S;
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
					String(e.sigr ?? e.Sigr ?? '').trim() &&
						String(e.sigs ?? e.Sigs ?? '').trim(),
				);
			}).length
		: undefined;
	const hasSignature = Boolean(
		(r != null && String(r).trim()) || (s != null && String(s).trim()),
	);
	const isBatch = Boolean(
		result.BatchSignResult ?? result.batchSignResult ?? batchSize != null,
	);

	return {
		status: status ?? undefined,
		readyToExecute: hasSignature,
		hasSignature,
		batchSignResult: isBatch || undefined,
		batchSize,
		completedBatchLegs,
		chainId: result.chainId ?? result.ChainID ?? result.ChainId,
	};
}

export function summarizeSignRequestsForAgent(
	rows: readonly unknown[],
): Record<string, unknown>[] {
	return rows
		.filter((row): row is Record<string, unknown> => row != null && typeof row === 'object')
		.map(row => summarizeSignRequestForAgent(row));
}
