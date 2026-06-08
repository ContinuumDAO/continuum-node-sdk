import {parseTransaction} from 'viem';
import {
	firstCalldataCompactFromTx,
	firstTxComposeFeeFields,
	parseChainId,
	proposalTxParamsFromUnsignedTx,
	txToSigningHashAndRaw,
	legacyFromTxDict,
	type FoundryBroadcastTx,
	type SignRequestPayload,
} from './forge-broadcast.js';
import {triggerTxParamsFromComposeBody} from './tx-params.js';

type BatchMetaRow = {destinationAddress: string; signatureText: string};

function fieldInt(v: unknown): number {
	if (v === undefined || v === null || v === '') return 0;
	if (typeof v === 'number') return v;
	if (typeof v === 'bigint') return Number(v);
	const s = String(v).trim();
	if (s.startsWith('0x') || s.startsWith('0X')) return Number(BigInt(s));
	const n = parseInt(s, 10);
	return Number.isFinite(n) ? n : 0;
}

function toHexWei(n: number): string {
	if (n < 0) return '0x0';
	return `0x${n.toString(16)}`;
}

export function unwrapMultiSignPayload(obj: Record<string, unknown>): Record<string, unknown> {
	const bodyForSign = obj.bodyForSign;
	if (bodyForSign && typeof bodyForSign === 'object' && !Array.isArray(bodyForSign)) {
		return bodyForSign as Record<string, unknown>;
	}
	const body = obj.body;
	if (body && typeof body === 'object' && !Array.isArray(body)) {
		return body as Record<string, unknown>;
	}
	if (obj.msgHash != null || obj.messageHashes != null || obj.destinationChainID != null) {
		return obj;
	}
	throw new Error('expected bodyForSign, body, or a raw multiSignRequest body object');
}

function isBatchBody(body: Record<string, unknown>): boolean {
	const m = body.messageRawBatch;
	return Array.isArray(m) && m.length > 0;
}

function parseExtraBatchMeta(body: Record<string, unknown>): BatchMetaRow[] {
	const raw = body.extraJSON ?? body.extra_json;
	if (typeof raw !== 'string' || !raw.trim()) return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return [];
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
	const bm = (parsed as Record<string, unknown>).batchMeta;
	if (!Array.isArray(bm)) return [];
	return bm.map(item => {
		if (!item || typeof item !== 'object' || Array.isArray(item)) {
			return {destinationAddress: '', signatureText: ''};
		}
		const row = item as Record<string, unknown>;
		return {
			destinationAddress: String(row.destinationAddress ?? ''),
			signatureText: String(row.signatureText ?? ''),
		};
	});
}

function customGasChainDetailsFromBody(
	body: Record<string, unknown>,
): Record<string, unknown> | null {
	const raw = body.extraJSON ?? body.extra_json;
	if (typeof raw !== 'string' || !raw.trim()) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
	const row = parsed as Record<string, unknown>;
	const c = row.customGasChainDetails ?? row.CustomGasChainDetails;
	if (c && typeof c === 'object' && !Array.isArray(c)) {
		return c as Record<string, unknown>;
	}
	return null;
}

function parsedTxToFoundryDict(parsed: ReturnType<typeof parseTransaction>): FoundryBroadcastTx {
	const toHex = (w: bigint) => (w >= 0n ? `0x${w.toString(16)}` : '0x0');
	const isEip1559 =
		parsed.type === 'eip1559' ||
		(parsed.maxFeePerGas != null && parsed.maxPriorityFeePerGas != null);
	if (isEip1559) {
		return {
			type: '0x2',
			chainId: String(parsed.chainId ?? 0),
			nonce: String(parsed.nonce ?? 0),
			gas: toHex(parsed.gas ?? 0n),
			maxFeePerGas: toHex(parsed.maxFeePerGas ?? 0n),
			maxPriorityFeePerGas: toHex(parsed.maxPriorityFeePerGas ?? 0n),
			to: parsed.to ? String(parsed.to) : undefined,
			value: toHex(parsed.value ?? 0n),
			data: parsed.data ?? '0x',
		};
	}
	return {
		chainId: String(parsed.chainId ?? 0),
		nonce: String(parsed.nonce ?? 0),
		gas: toHex(parsed.gas ?? 0n),
		gasPrice: toHex(parsed.gasPrice ?? 0n),
		to: parsed.to ? String(parsed.to) : undefined,
		value: toHex(parsed.value ?? 0n),
		data: parsed.data ?? '0x',
	};
}

function decodeFullMessageRawToTx(msgRaw: string): FoundryBroadcastTx {
	const t = (msgRaw ?? '').trim();
	if (!t) {
		throw new Error('empty full transaction messageRaw');
	}
	const hex = (t.startsWith('0x') ? t : `0x${t}`) as `0x${string}`;
	if (hex.length < 4) {
		throw new Error('empty full transaction messageRaw');
	}
	const firstByte = parseInt(hex.slice(2, 4), 16);
	if (firstByte === 0x01) {
		throw new Error('multiSignJoin: EIP-2930 type-1 transactions are not supported yet');
	}
	try {
		return parsedTxToFoundryDict(parseTransaction(hex));
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		throw new Error(`failed to decode messageRaw as unsigned tx: ${msg}`);
	}
}

function looksLikeComposeCalldataOnly(msgRaw: string): boolean {
	const s = (msgRaw ?? '').trim();
	if (!s) return false;
	if (s.startsWith('0x02') || s.startsWith('0x01')) return false;
	const hex = (s.startsWith('0x') ? s : `0x${s}`) as `0x${string}`;
	try {
		const firstByte = parseInt(hex.slice(2, 4), 16);
		if (firstByte === 0x02 || firstByte === 0x01) return false;
		if (hex.length > 2) {
			const rawLen = (hex.length - 2) / 2;
			if (rawLen > 0) {
				const lead = parseInt(hex.slice(2, 4), 16);
				if (lead >= 0xc0) return false;
			}
		}
	} catch {
		return true;
	}
	return true;
}

function reconstructComposeSingleTx(body: Record<string, unknown>): FoundryBroadcastTx {
	const chain = body.destinationChainID ?? body.destination_chain_id;
	if (chain == null || String(chain).trim() === '') {
		throw new Error('body missing destinationChainID');
	}
	const dest =
		body.destinationContract ??
		body.destination_contract ??
		body.destinationAddress ??
		body.destination_address;
	if (!dest || !String(dest).trim()) {
		throw new Error('body missing destinationContract / destinationAddress');
	}

	let msgRaw = body.msgRaw;
	if (msgRaw == null) msgRaw = '';
	const msgRawStr = String(msgRaw).trim();
	if (!msgRawStr) {
		throw new Error(
			'native-transfer or empty-calldata single-tx body cannot be joined without full serialized transactions; build a compose JSON with both actions in one call, or supply inputs whose bodies include messageRawBatch / full-tx msgRaw.',
		);
	}
	const calldata = msgRawStr.startsWith('0x') ? msgRawStr : `0x${msgRawStr}`;

	const txNonce = body.txNonce ?? body.tx_nonce;
	if (txNonce == null) {
		throw new Error('compose single-tx body missing txNonce (cannot rebuild transaction)');
	}
	const nonceInt = fieldInt(txNonce);

	const gasLim = body.txGasLimit ?? body.tx_gas_limit;
	if (gasLim == null) {
		throw new Error('compose single-tx body missing txGasLimit');
	}
	const gasInt = fieldInt(gasLim);

	const legacy = body.txGasPrice != null || body.tx_gas_price != null;
	if (legacy) {
		const gp = body.txGasPrice ?? body.tx_gas_price;
		if (gp == null) throw new Error('missing txGasPrice');
		return {
			nonce: String(nonceInt),
			gasPrice: toHexWei(fieldInt(gp)),
			gas: toHexWei(gasInt),
			to: String(dest).trim(),
			value: '0x0',
			data: calldata,
			chainId: String(parseChainId(String(chain))),
		};
	}

	const mf = body.txMaxFeePerGas ?? body.tx_max_fee_per_gas;
	const mp = body.txMaxPriorityFeePerGas ?? body.tx_max_priority_fee_per_gas;
	if (mf == null || mp == null) {
		throw new Error('compose single-tx body missing txMaxFeePerGas / txMaxPriorityFeePerGas');
	}
	return {
		type: '0x2',
		nonce: String(nonceInt),
		gas: toHexWei(gasInt),
		maxFeePerGas: toHexWei(fieldInt(mf)),
		maxPriorityFeePerGas: toHexWei(fieldInt(mp)),
		to: String(dest).trim(),
		value: '0x0',
		data: calldata,
		chainId: String(parseChainId(String(chain))),
	};
}

function extractTxsAndMeta(body: Record<string, unknown>): [FoundryBroadcastTx[], BatchMetaRow[]] {
	const txs: FoundryBroadcastTx[] = [];
	const meta: BatchMetaRow[] = [];

	if (isBatchBody(body)) {
		const batchRaw = body.messageRawBatch;
		if (!Array.isArray(batchRaw)) {
			throw new Error('messageRawBatch must be a list');
		}
		const parsedMeta = parseExtraBatchMeta(body);
		for (let i = 0; i < batchRaw.length; i++) {
			const mr = batchRaw[i];
			if (typeof mr !== 'string' || !mr.trim()) {
				throw new Error(`messageRawBatch[${i}] invalid`);
			}
			txs.push(decodeFullMessageRawToTx(mr));
			meta.push(
				parsedMeta[i] ?? {destinationAddress: '', signatureText: ''},
			);
		}
		return [txs, meta];
	}

	const msgRaw = body.msgRaw;
	const msgRawS = msgRaw == null ? '' : String(msgRaw).trim();

	if (msgRawS && !looksLikeComposeCalldataOnly(msgRawS)) {
		txs.push(decodeFullMessageRawToTx(msgRawS));
		meta.push({
			destinationAddress: String(
				body.destinationAddress ?? body.destination_address ?? '',
			),
			signatureText: String(body.signatureText ?? body.signature_text ?? ''),
		});
		return [txs, meta];
	}

	txs.push(reconstructComposeSingleTx(body));
	meta.push({
		destinationAddress: String(body.destinationAddress ?? body.destination_address ?? ''),
		signatureText: String(body.signatureText ?? body.signature_text ?? ''),
	});
	return [txs, meta];
}

function normalizeChainId(body: Record<string, unknown>): string {
	const c = body.destinationChainID ?? body.destination_chain_id;
	if (c == null || String(c).trim() === '') {
		throw new Error('body missing destinationChainID');
	}
	return String(parseChainId(String(c)));
}

function mergePurpose(
	a: string | undefined,
	b: string | undefined,
	override: string | undefined,
): string | undefined {
	if (override != null && override.trim()) return override.trim();
	const pa = (a ?? '').trim();
	const pb = (b ?? '').trim();
	if (pa && pb) return `${pa} | ${pb}`;
	return pa || pb || undefined;
}

export type JoinMultiSignBodiesInput = {
	readonly bodyA: Record<string, unknown>;
	readonly bodyB: Record<string, unknown>;
	readonly firstNonce: number;
	readonly purpose?: string;
};

/**
 * Join two multiSignRequest-style bodies into one batch payload (consecutive nonces).
 * Mirrors mpc-config `scripts/multiSignJoin.py`.
 */
export function joinMultiSignBodies(input: JoinMultiSignBodiesInput): SignRequestPayload {
	const {bodyA, bodyB, firstNonce, purpose} = input;

	const chainA = normalizeChainId(bodyA);
	const chainB = normalizeChainId(bodyB);
	if (chainA !== chainB) {
		throw new Error(`destinationChainID mismatch: ${chainA} vs ${chainB}`);
	}

	const [txsA, metaA] = extractTxsAndMeta(bodyA);
	const [txsB, metaB] = extractTxsAndMeta(bodyB);
	if (!txsA.length || !txsB.length) {
		throw new Error('each input must yield at least one transaction');
	}

	const klA = bodyA.keyList;
	const klB = bodyB.keyList;
	if (
		Array.isArray(klA) &&
		Array.isArray(klB) &&
		klA.length > 0 &&
		klB.length > 0 &&
		JSON.stringify(klA) !== JSON.stringify(klB)
	) {
		throw new Error('keyList differs between inputs (must be the same MPC key)');
	}

	const pkA = bodyA.pubKey ?? bodyA.pubkeyhex;
	const pkB = bodyB.pubKey ?? bodyB.pubkeyhex;
	if (pkA && pkB && String(pkA).trim() !== String(pkB).trim()) {
		throw new Error('pubKey differs between inputs (must be the same MPC key)');
	}

	const keyList: string[] | undefined = Array.isArray(klB) && klB.length
		? klB.map(x => String(x))
		: Array.isArray(klA) && klA.length
			? klA.map(x => String(x))
			: undefined;
	const pubKey =
		(pkB != null && String(pkB).trim() ? String(pkB).trim() : undefined) ??
		(pkA != null && String(pkA).trim() ? String(pkA).trim() : undefined);

	const txs = [...txsA, ...txsB];
	const batchMeta = [...metaA, ...metaB];

	const messageHashes: string[] = [];
	const messageRawBatch: string[] = [];
	const proposalTxParamsBatch: ReturnType<typeof proposalTxParamsFromUnsignedTx>[] = [];

	for (let i = 0; i < txs.length; i++) {
		const td: FoundryBroadcastTx = {...txs[i]!};
		td.nonce = String(firstNonce + i);
		td.chainId = chainA;
		const {messageHash, messageRaw} = txToSigningHashAndRaw(td);
		messageHashes.push(messageHash);
		messageRawBatch.push(messageRaw);
		proposalTxParamsBatch.push(
			proposalTxParamsFromUnsignedTx(td, legacyFromTxDict(td)),
		);
	}

	const firstTx = {...txs[0]!};
	firstTx.nonce = String(firstNonce);
	firstTx.chainId = chainA;

	const mergedPurpose = mergePurpose(
		bodyA.purpose != null ? String(bodyA.purpose) : undefined,
		bodyB.purpose != null ? String(bodyB.purpose) : undefined,
		purpose,
	);

	const extraMerged: Record<string, unknown> = {batchMeta};
	const cgJoin =
		customGasChainDetailsFromBody(bodyA) ?? customGasChainDetailsFromBody(bodyB);
	if (cgJoin) {
		extraMerged.customGasChainDetails = cgJoin;
	}

	const bodyForSign: Record<string, unknown> = {
		destinationChainID: chainA,
		msgHash: messageHashes[0],
		msgRaw: firstCalldataCompactFromTx(firstTx),
		messageHashes,
		messageRawBatch,
		destinationAddress: batchMeta[0]?.destinationAddress ?? '',
		signatureText: batchMeta[0]?.signatureText ?? '',
		extraJSON: JSON.stringify(extraMerged),
		...firstTxComposeFeeFields(firstTx),
		proposalTxParams: proposalTxParamsBatch,
	};

	if (keyList) bodyForSign.keyList = keyList;
	if (pubKey) bodyForSign.pubKey = pubKey;
	if (mergedPurpose) bodyForSign.purpose = mergedPurpose.slice(0, 256);

	const cidA = String(bodyA.clientId ?? bodyA.client_id ?? '').trim();
	const cidB = String(bodyB.clientId ?? bodyB.client_id ?? '').trim();
	const cid = cidA || cidB;
	if (cid) bodyForSign.clientId = cid;

	const messageToSign = JSON.stringify(bodyForSign);

	return {
		endpoint: 'multiSignRequest',
		bodyForSign,
		messageToSign,
		chainId: chainA,
		count: txs.length,
		triggerTxParams: triggerTxParamsFromComposeBody(bodyForSign),
		triggerMessageHash: messageHashes[0]!,
	};
}

export function joinMultiSignPayloads(
	payloadA: Record<string, unknown>,
	payloadB: Record<string, unknown>,
	firstNonce: number,
	purpose?: string,
): SignRequestPayload {
	return joinMultiSignBodies({
		bodyA: unwrapMultiSignPayload(payloadA),
		bodyB: unwrapMultiSignPayload(payloadB),
		firstNonce,
		purpose,
	});
}
