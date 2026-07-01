import {buildManagementQueryPath, managementGet} from '../api/management-api.js';
import type {NodeSdkConfig} from '../config/schema.js';
import {pick} from '../internal/normalize.js';
import type {SdkResult} from './result.js';
import {clarifyKeyGenLookupError, parseKeyGenRequestId} from './keygen-id.js';
import {mpcAuthEnvelopeData} from './mpc/sign-request-utils.js';
import type {KeyGenResultById} from './mpc/types.js';

const KEYGEN_RESULT_EMPTY_REASON =
	'GET /getKeyGenResultById returned no result object. The KeyGen request may be success while this node has not stored the result yet; retry, check another group member node, or open the KeyGen result in the node UI. Do not derive ethereumaddress from pubKey or pubkeyhex.';

function unwrapKeyGenResultPayload(raw: unknown): Record<string, unknown> | null {
	let current: unknown = raw;
	for (let depth = 0; depth < 4; depth++) {
		const envelope = mpcAuthEnvelopeData(current);
		if (envelope != null) {
			current = envelope;
			continue;
		}
		if (!current || typeof current !== 'object' || Array.isArray(current)) {
			return null;
		}
		const row = current as Record<string, unknown>;
		const nested = row.result ?? row.Result ?? row.keyGenResult ?? row.KeyGenResult;
		if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
			current = nested;
			continue;
		}
		if (
			pick(row, ['requestid', 'RequestId', 'id']) != null ||
			pick(row, ['pubkeyhex', 'PubKeyHex']) != null ||
			pick(row, ['ethereumaddress', 'EthereumAddress']) != null
		) {
			return row;
		}
		return null;
	}
	return null;
}

function resolveKeyGenRequestId(keyGenId: string): SdkResult<string> {
	return parseKeyGenRequestId(keyGenId);
}

/** GET /getGlobalNonceByKeyGenId — browser-safe (no management-signer / node:fs). */
export async function fetchGlobalNonceByKeyGenId(
	config: NodeSdkConfig,
	keyGenId: string,
): Promise<SdkResult<number>> {
	const resolved = resolveKeyGenRequestId(keyGenId);
	if (!resolved.ok) return resolved;

	const path = buildManagementQueryPath('/getGlobalNonceByKeyGenId', {
		id: resolved.data,
	});
	const raw = await managementGet<unknown>(config, path);
	if (!raw.ok) {
		return {ok: false, reason: clarifyKeyGenLookupError(raw.reason)};
	}
	let globalNonce: number | undefined;
	if (typeof raw.data === 'number') {
		globalNonce = raw.data;
	} else {
		const data = mpcAuthEnvelopeData(raw.data) ?? raw.data;
		if (data && typeof data === 'object' && !Array.isArray(data)) {
			const src = data as Record<string, unknown>;
			const candidate = src.globalNonce ?? src.GlobalNonce ?? src.globalnonce;
			if (typeof candidate === 'number') globalNonce = candidate;
		}
	}
	if (typeof globalNonce !== 'number' || Number.isNaN(globalNonce)) {
		return {ok: false, reason: 'Invalid getGlobalNonceByKeyGenId response.'};
	}
	return {ok: true, data: globalNonce};
}

/** GET /getKeyGenResultById — browser-safe (no management-signer / node:fs). */
export async function fetchKeyGenResult(
	config: NodeSdkConfig,
	keyGenId: string,
): Promise<SdkResult<KeyGenResultById>> {
	const resolved = resolveKeyGenRequestId(keyGenId);
	if (!resolved.ok) return resolved;

	const path = buildManagementQueryPath('/getKeyGenResultById', {id: resolved.data});
	const raw = await managementGet<unknown>(config, path);
	if (!raw.ok) {
		return {ok: false, reason: clarifyKeyGenLookupError(raw.reason)};
	}
	const row = unwrapKeyGenResultPayload(raw.data);
	if (!row) {
		return {ok: false, reason: KEYGEN_RESULT_EMPTY_REASON};
	}
	return {ok: true, data: row as KeyGenResultById};
}
