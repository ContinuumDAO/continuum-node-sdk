import {parseTransaction, serializeTransaction} from 'viem';
import type {ChainDetailRow, SignRequestDetail, TxParamsFromApi} from './types.js';
import type {ProposalTxParams} from '../../evm/tx-params.js';

function feeFieldString(
	c: Record<string, unknown>,
	camel: string,
	snake: string,
): string | undefined {
	const raw = c[camel] ?? c[snake];
	if (raw == null) return undefined;
	const s = String(raw).trim();
	return s !== '' ? s : undefined;
}

export function txParamsFromGetSignRequestIdData(data: unknown): TxParamsFromApi | null {
	if (data == null || typeof data !== 'object' || Array.isArray(data)) return null;
	const d = data as Record<string, unknown>;
	const nested = (d.txParams ?? d.TxParams) as Record<string, unknown> | undefined;
	const c: Record<string, unknown> =
		nested && typeof nested === 'object' && !Array.isArray(nested) ? nested : d;
	const txTypeRaw = (c.txType ?? c.tx_type ?? c.TxType) as string | undefined;
	const txType = txTypeRaw != null ? String(txTypeRaw).trim() : '';
	if (txType !== 'eip1559' && txType !== 'legacy') return null;
	const nRaw = c.nonce ?? c.Nonce;
	const nonce =
		typeof nRaw === 'number' && Number.isFinite(nRaw)
			? nRaw
			: typeof nRaw === 'string' && nRaw.trim() !== ''
				? parseInt(nRaw, 10)
				: NaN;
	if (!Number.isFinite(nonce) || nonce < 0) return null;
	const gl = c.gasLimit ?? c.gas_limit ?? c.GasLimit ?? c.gas;
	if (gl == null || String(gl).trim() === '') return null;
	const out: TxParamsFromApi = {
		nonce,
		gasLimit: String(gl).trim(),
		txType: txType as TxParamsFromApi['txType'],
	};
	const maxFee = feeFieldString(c, 'maxFeePerGas', 'max_fee_per_gas');
	const maxPrio = feeFieldString(c, 'maxPriorityFeePerGas', 'max_priority_fee_per_gas');
	const gasPrice = feeFieldString(c, 'gasPrice', 'gas_price');
	if (txType === 'eip1559') {
		if (maxFee == null || maxPrio == null) return null;
		out.maxFeePerGas = maxFee;
		out.maxPriorityFeePerGas = maxPrio;
	} else if (gasPrice == null) {
		return null;
	} else {
		out.gasPrice = gasPrice;
	}
	return out;
}

export function mpcAuthEnvelopeData(raw: unknown): unknown | null {
	if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const r = raw as Record<string, unknown>;
	const code = r.Code ?? r.code;
	if (code !== 0) return null;
	const data = r.Data ?? r.data;
	return data ?? null;
}

export function parseSignRequestExtraJSON(
	detail: SignRequestDetail | Record<string, unknown> | null,
): Record<string, unknown> | null {
	if (!detail) return null;
	const d = detail as Record<string, unknown>;
	const raw = d.ExtraJSON ?? d.extraJSON;
	if (raw == null) return null;
	if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
		return raw as Record<string, unknown>;
	}
	if (typeof raw !== 'string') return null;
	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
			? parsed
			: null;
	} catch {
		return null;
	}
}

export function chainSnapshotForCustomGasExtraJSON(
	chainDetail: ChainDetailRow,
): Record<string, unknown> {
	const lr = chainDetail.legacy as boolean | string | undefined;
	const legacy = lr === true || (typeof lr === 'string' && lr.toLowerCase() === 'true');

	const push = (o: Record<string, unknown>, key: string, v: unknown) => {
		if (v === undefined || v === null) return;
		if (typeof v === 'string' && v.trim() === '') return;
		o[key] = v;
	};

	const fields: Record<string, unknown> = {};
	push(fields, 'gasLimit', chainDetail.gasLimit);
	if (legacy) {
		push(fields, 'gasMultiplier', chainDetail.gasMultiplier);
		push(fields, 'gasPrice', chainDetail.gasPrice);
	} else {
		push(fields, 'baseFee', chainDetail.baseFee);
		push(fields, 'priorityFee', chainDetail.priorityFee);
		push(fields, 'baseFeeMultiplier', chainDetail.baseFeeMultiplier);
	}

	if (Object.keys(fields).length === 0) return {};
	return {legacy, ...fields};
}

export function getCustomGasChainDetailsFromExtraJSON(
	detail: SignRequestDetail | Record<string, unknown> | null,
): Record<string, unknown> | null {
	const o = parseSignRequestExtraJSON(detail);
	if (!o) return null;
	const c = o.customGasChainDetails ?? o.CustomGasChainDetails;
	if (c && typeof c === 'object' && !Array.isArray(c)) {
		return c as Record<string, unknown>;
	}
	return null;
}

export function applyCustomGasChainDetailsToChainDetail(
	chainDetail: ChainDetailRow,
	customGas: Record<string, unknown> | null | undefined,
): ChainDetailRow {
	if (!customGas || typeof customGas !== 'object' || Array.isArray(customGas)) {
		return chainDetail;
	}
	const num = (key: string): number | undefined => {
		const v = customGas[key];
		if (v == null || v === '') return undefined;
		const n = typeof v === 'number' ? v : Number(v);
		return Number.isFinite(n) ? n : undefined;
	};
	const out: Record<string, unknown> = {...chainDetail};
	if (customGas.legacy != null) {
		const lr = customGas.legacy;
		out.legacy = lr === true || (typeof lr === 'string' && lr.toLowerCase() === 'true');
	}
	const gasLimit = num('gasLimit');
	if (gasLimit != null && gasLimit > 0) out.gasLimit = gasLimit;
	if (out.legacy) {
		const gasMultiplier = num('gasMultiplier');
		if (gasMultiplier != null) out.gasMultiplier = gasMultiplier;
		const gasPrice = num('gasPrice');
		if (gasPrice != null) out.gasPrice = gasPrice;
	} else {
		const baseFee = num('baseFee');
		if (baseFee != null) out.baseFee = baseFee;
		const priorityFee = num('priorityFee');
		if (priorityFee != null) out.priorityFee = priorityFee;
		const baseFeeMultiplier = num('baseFeeMultiplier');
		if (baseFeeMultiplier != null) out.baseFeeMultiplier = baseFeeMultiplier;
	}
	return out as ChainDetailRow;
}

export function isBatchSignRequest(
	detail: SignRequestDetail | Record<string, unknown> | null,
): boolean {
	if (!detail) return false;
	const d = detail as Record<string, unknown>;
	const rawBatch = d.MessageRawBatch ?? d.messageRawBatch;
	const hashes = d.MessageHashes ?? d.messageHashes;
	if (Array.isArray(rawBatch) && rawBatch.length > 1) return true;
	if (Array.isArray(hashes) && hashes.length > 1) return true;
	return false;
}

export function getBatchLength(
	detail: SignRequestDetail | Record<string, unknown> | null,
): number {
	if (!detail) return 1;
	const d = detail as Record<string, unknown>;
	const rawBatch = d.MessageRawBatch ?? d.messageRawBatch;
	const hashes = d.MessageHashes ?? d.messageHashes;
	if (!isBatchSignRequest(detail)) return 1;
	return Math.max(
		Array.isArray(rawBatch) ? rawBatch.length : 0,
		Array.isArray(hashes) ? hashes.length : 0,
		1,
	);
}

export function mpaTotalCreditsRemaining(status: {
	readonly registered?: boolean;
	readonly error?: string;
	readonly freeTransactionsLeft?: number;
	readonly remainingNonces?: number;
} | null): number {
	if (!status?.registered || status.error) return 0;
	const free = status.freeTransactionsLeft ?? 0;
	const r = status.remainingNonces ?? 0;
	return free + Math.max(0, r - free);
}

export function getMessageRawForDetail(
	detail: SignRequestDetail | Record<string, unknown> | null,
	index: number,
): string | undefined {
	if (!detail) return undefined;
	const d = detail as Record<string, unknown>;
	const topRaw = (d.MessageRaw ?? d.messageRaw) as string | undefined;
	const rawBatch = d.MessageRawBatch ?? d.messageRawBatch;
	if (index === 0 && topRaw != null && String(topRaw).trim() !== '') {
		return String(topRaw);
	}
	if (Array.isArray(rawBatch)) {
		if (rawBatch[index] != null) return String(rawBatch[index]);
		if (index > 0 && rawBatch[index - 1] != null) return String(rawBatch[index - 1]);
	}
	if (index === 0) return topRaw != null ? String(topRaw) : undefined;
	return undefined;
}

export function tryParseNonceFromMessageRawForGetSig(
	raw: string | undefined,
): number | null {
	if (raw == null || typeof raw !== 'string') return null;
	const t = raw.trim();
	if (!t) return null;
	const hex = (t.startsWith('0x') ? t : `0x${t}`) as `0x${string}`;
	if (hex.length < 10) return null;
	try {
		const parsed = parseTransaction(hex);
		const n = parsed.nonce;
		const num = typeof n === 'bigint' ? Number(n) : Number(n);
		if (!Number.isFinite(num) || num < 0) return null;
		return num;
	} catch {
		return null;
	}
}

export function getSignatureTextForDetail(
	detail: SignRequestDetail | Record<string, unknown> | null,
	index: number,
): string | undefined {
	if (!detail) return undefined;
	const d = detail as Record<string, unknown>;
	const batchMeta = getBatchMeta(detail);
	const topSig = (detail as SignRequestDetail).SignatureText as string | undefined;
	if (index === 0 && topSig != null && String(topSig).trim() !== '') {
		return String(topSig);
	}
	if (
		batchMeta[index]?.signatureText != null &&
		String(batchMeta[index]!.signatureText).trim() !== ''
	) {
		return String(batchMeta[index]!.signatureText);
	}
	if (
		index > 0 &&
		batchMeta[index - 1]?.signatureText != null &&
		String(batchMeta[index - 1]!.signatureText).trim() !== ''
	) {
		return String(batchMeta[index - 1]!.signatureText);
	}
	if (index === 0) return topSig != null ? String(topSig) : undefined;
	return undefined;
}

export function getDestinationAddressForDetail(
	detail: SignRequestDetail | Record<string, unknown> | null,
	index: number,
): string | undefined {
	if (!detail) return undefined;
	const batchMeta = getBatchMeta(detail);
	const topAddr = (detail as SignRequestDetail).DestinationAddress as string | undefined;
	if (index === 0 && topAddr != null && String(topAddr).trim() !== '') {
		return String(topAddr);
	}
	if (
		batchMeta[index]?.destinationAddress != null &&
		String(batchMeta[index]!.destinationAddress).trim() !== ''
	) {
		return String(batchMeta[index]!.destinationAddress);
	}
	if (
		index > 0 &&
		batchMeta[index - 1]?.destinationAddress != null &&
		String(batchMeta[index - 1]!.destinationAddress).trim() !== ''
	) {
		return String(batchMeta[index - 1]!.destinationAddress);
	}
	if (index === 0) return topAddr != null ? String(topAddr) : undefined;
	return undefined;
}

export function getBatchMeta(
	detail: SignRequestDetail | Record<string, unknown> | null,
): {destinationAddress: string; signatureText: string}[] {
	const parsed = parseSignRequestExtraJSON(detail);
	if (!parsed) return [];
	const meta = parsed.batchMeta;
	if (!Array.isArray(meta)) return [];
	return meta.map(m => ({
		destinationAddress:
			typeof (m as Record<string, unknown>).destinationAddress === 'string'
				? ((m as Record<string, unknown>).destinationAddress as string)
				: '',
		signatureText:
			typeof (m as Record<string, unknown>).signatureText === 'string'
				? ((m as Record<string, unknown>).signatureText as string)
				: '',
	}));
}

export function recordLooksLikeProposalTxParams(o: Record<string, unknown>): boolean {
	const gl = o.gasLimit ?? o.GasLimit ?? o.gas_limit;
	const tt = o.txType ?? o.TxType ?? o.tx_type;
	return gl != null && String(gl).trim() !== '' && tt != null && String(tt).trim() !== '';
}

export function getProposalTxParamsForDetailIndex(
	txParamsEnvelope: Record<string, unknown> | null,
	isBatch: boolean,
	index: number,
): ProposalTxParams | null {
	if (!txParamsEnvelope) return null;
	const batchArr =
		txParamsEnvelope.proposalTxParams ??
		txParamsEnvelope.ProposalTxParams ??
		txParamsEnvelope.proposal_tx_params;
	if (Array.isArray(batchArr) && batchArr.length > 0) {
		const row = batchArr[index];
		if (row && typeof row === 'object' && !Array.isArray(row)) {
			return row as ProposalTxParams;
		}
		return null;
	}
	const single = txParamsEnvelope.txParams ?? txParamsEnvelope.TxParams;
	if (single && typeof single === 'object' && !Array.isArray(single)) {
		if (!isBatch) return single as ProposalTxParams;
		if (isBatch && index === 0) return single as ProposalTxParams;
	}
	if (recordLooksLikeProposalTxParams(txParamsEnvelope)) {
		if (!isBatch) return txParamsEnvelope as ProposalTxParams;
		if (isBatch && index === 0) return txParamsEnvelope as ProposalTxParams;
	}
	return null;
}

export function resolveProposalGasLimitWeiForDetailIndex(
	detail: SignRequestDetail | Record<string, unknown> | null,
	index: number,
): bigint | null {
	if (!detail) return null;
	const d = detail as Record<string, unknown>;
	const batchArr = (d.proposal_tx_params ??
		d.proposalTxParams ??
		d.ProposalTxParams) as unknown;
	if (Array.isArray(batchArr) && batchArr.length > index) {
		const row = batchArr[index];
		if (row && typeof row === 'object' && !Array.isArray(row)) {
			const r = row as Record<string, unknown>;
			const gl = parsePositiveGasLimitBigInt(
				r.gas_limit ?? r.gasLimit ?? r.GasLimit ?? r.gas,
			);
			if (gl != null) return gl;
		}
	}
	if (index === 0) {
		const single = (d.txParams ?? d.TxParams) as Record<string, unknown> | undefined;
		if (single && typeof single === 'object') {
			const gl = parsePositiveGasLimitBigInt(
				single.gasLimit ?? single.GasLimit ?? single.gas_limit ?? single.gas,
			);
			if (gl != null) return gl;
		}
	}
	return null;
}

function parsePositiveGasLimitBigInt(raw: unknown): bigint | null {
	if (raw == null) return null;
	try {
		const s = String(raw).trim();
		if (!s) return null;
		const n = BigInt(s);
		return n > 0n ? n : null;
	} catch {
		return null;
	}
}

export function buildSignedTxFromUnsignedAndSignature(
	serializedUnsignedHex: string,
	sigr: string,
	sigs: string,
	sigrecover: string,
): string | null {
	try {
		const hex = serializedUnsignedHex.trim().startsWith('0x')
			? serializedUnsignedHex.trim()
			: `0x${serializedUnsignedHex.trim()}`;
		const parsed = parseTransaction(hex as `0x${string}`);
		if (!parsed) return null;
		const r = (sigr.startsWith('0x') ? sigr : `0x${sigr}`) as `0x${string}`;
		const s = (sigs.startsWith('0x') ? sigs : `0x${sigs}`) as `0x${string}`;
		const recovery = (sigrecover ?? '').trim().toLowerCase();
		const isRecoveryOne = recovery === '01' || recovery === '1';
		const v = parsed.type === 'legacy' ? (isRecoveryOne ? 28n : 27n) : isRecoveryOne ? 1n : 0n;
		const signed = serializeTransaction(parsed, {r, s, v});
		return signed;
	} catch {
		return null;
	}
}

export function buildBatchSignedTxsFromResult(
	result: Record<string, unknown>,
): string[] | null {
	const batchSigs = (result.batchsignatures ?? result.BatchSignatures) as
		| Array<Record<string, unknown>>
		| undefined;
	const rawBatch = (result.MessageRawBatch ?? result.messageRawBatch) as
		| string[]
		| undefined;
	if (
		!Array.isArray(batchSigs) ||
		!Array.isArray(rawBatch) ||
		batchSigs.length !== rawBatch.length ||
		batchSigs.length === 0
	) {
		return null;
	}
	const out: string[] = [];
	for (let i = 0; i < batchSigs.length; i++) {
		const sig = batchSigs[i];
		if (!sig || typeof sig !== 'object') return null;
		const sigr = String(sig.sigr ?? sig.Sigr ?? '').trim();
		const sigs = String(sig.sigs ?? sig.Sigs ?? '').trim();
		const sigrecover = String(sig.sigrecover ?? sig.Sigrecover ?? '').trim();
		const raw = rawBatch[i];
		if (!sigr || !sigs || raw == null) return null;
		const signed = buildSignedTxFromUnsignedAndSignature(
			String(raw),
			sigr,
			sigs,
			sigrecover,
		);
		if (!signed) return null;
		out.push(signed);
	}
	return out;
}

export function keyGenIdFromRecord(
	r: SignRequestDetail | Record<string, unknown> | null | undefined,
): string {
	if (!r) return '';
	const d = r as Record<string, unknown>;
	const fromTop =
		d['KeyGenRequestId'] ??
		d['keyGenRequestId'] ??
		d.KeyGenRequestId ??
		d.keyGenRequestId ??
		d.keygenRequestId ??
		d.KeygenRequestId;
	let s = fromTop != null ? String(fromTop).trim() : '';
	if (s) return s;
	const extra = parseSignRequestExtraJSON(r as SignRequestDetail);
	if (extra) {
		const e =
			extra['KeyGenRequestId'] ??
			extra['keyGenRequestId'] ??
			extra.KeyGenRequestId ??
			extra.keyGenRequestId ??
			extra.keygenRequestId ??
			extra.KeygenRequestId;
		s = e != null ? String(e).trim() : '';
	}
	return s;
}

export function messageRawToCalldata(rawHex: string): string | null {
	const t = rawHex.trim();
	if (!t) return '0x';
	if (t.startsWith('{') || t.startsWith('[')) return null;
	try {
		const hex = (t.startsWith('0x') ? t : `0x${t}`) as `0x${string}`;
		if (hex.length < 10) return hex;
		const parsed = parseTransaction(hex);
		const d = parsed.data;
		if (d != null && String(d).length > 0) return String(d);
		return hex;
	} catch {
		return t.startsWith('0x') ? t : `0x${t}`;
	}
}

export function broadcastErrorMessage(rawMessage: string): string {
	const lower = rawMessage.toLowerCase();
	if (
		lower.includes('replacement transaction underpriced') ||
		lower.includes('replacement gas price')
	) {
		return (
			'Replacement underpriced: a tx with the same nonce is already in the mempool. ' +
			'Increase max fee and priority above the pending transaction, or run Get Sig again.'
		);
	}
	if (lower.includes('already known') || lower.includes('alreadyknown')) {
		return 'This exact transaction was already submitted. Check the block explorer.';
	}
	if (lower.includes('nonce too low') || lower.includes('nonce too high')) {
		return 'Nonce mismatch: the chain has already moved past this transaction.';
	}
	return rawMessage;
}

export function getSignRequestStatus(detail: Record<string, unknown> | null | undefined): string {
	if (!detail) return 'live';
	const status = detail.status ?? detail.Status;
	if (status == null || String(status).trim() === '') {
		return 'live';
	}
	return String(status).trim().toLowerCase();
}
