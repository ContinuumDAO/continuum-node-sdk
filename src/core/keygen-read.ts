import {buildManagementQueryPath, managementGet} from '../api/management-api.js';
import type {NodeSdkConfig} from '../config/schema.js';
import {GroupIdSchema, type GroupId, type KeyGenId} from '../schemas/extended.js';
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

function finiteNonce(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function nonceField(src: Record<string, unknown>, keys: string[]): number | undefined {
	for (const key of keys) {
		const parsed = finiteNonce(src[key]);
		if (parsed != null) return parsed;
	}
	return undefined;
}

function globalNoncePayload(raw: unknown): {display?: number; stored?: number} {
	if (typeof raw === 'number' && Number.isFinite(raw)) {
		return {display: raw, stored: raw};
	}
	const data = mpcAuthEnvelopeData(raw) ?? raw;
	if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
	const src = data as Record<string, unknown>;
	const display = nonceField(src, ['globalnonce', 'globalNonce', 'GlobalNonce']);
	const stored = nonceField(src, ['storedglobalnonce', 'storedGlobalNonce', 'StoredGlobalNonce']);
	return {display, stored: stored ?? display};
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
	const raw = await managementGet<unknown>(config, path, {timeoutMs: 30_000});
	if (!raw.ok) {
		return {ok: false, reason: clarifyKeyGenLookupError(raw.reason)};
	}
	const globalNonce = globalNoncePayload(raw.data).display;
	if (typeof globalNonce !== 'number') {
		return {ok: false, reason: 'Invalid getGlobalNonceByKeyGenId response.'};
	}
	return {ok: true, data: globalNonce};
}

/**
 * Stored per-KeyGen nonce for register and syncBilling.
 * While a veCTM waiver is on, getGlobalNonceByKeyGenId's globalnonce is the shared display nonce.
 */
export async function fetchStoredGlobalNonceByKeyGenId(
	config: NodeSdkConfig,
	keyGenId: string,
): Promise<SdkResult<number>> {
	const resolved = resolveKeyGenRequestId(keyGenId);
	if (!resolved.ok) return resolved;

	const path = buildManagementQueryPath('/getGlobalNonceByKeyGenId', {
		id: resolved.data,
	});
	const raw = await managementGet<unknown>(config, path, {timeoutMs: 30_000});
	if (!raw.ok) {
		return {ok: false, reason: clarifyKeyGenLookupError(raw.reason)};
	}
	const stored = globalNoncePayload(raw.data).stored;
	if (typeof stored !== 'number') {
		return {ok: false, reason: 'Invalid getGlobalNonceByKeyGenId response.'};
	}
	return {ok: true, data: stored};
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

/** GET /getKeyGenGroupId — browser-safe (no management-signer / node:fs). */
export async function getKeyGenParentGroupId(
	config: NodeSdkConfig,
	input: {id: KeyGenId},
): Promise<SdkResult<{requestid: string; groupId: GroupId}>> {
	const idParsed = parseKeyGenRequestId(input.id);
	if (!idParsed.ok) return idParsed;
	const path = buildManagementQueryPath('/getKeyGenGroupId', {id: idParsed.data});
	const raw = await managementGet<unknown>(config, path);
	if (!raw.ok) {
		return {ok: false, reason: clarifyKeyGenLookupError(raw.reason)};
	}
	if (!raw.data || typeof raw.data !== 'object') {
		return {ok: false, reason: 'Invalid getKeyGenGroupId response shape.'};
	}
	const src = raw.data as Record<string, unknown>;
	const requestid = pick(src, ['requestid', 'RequestId', 'id']);
	const groupId = pick(src, ['groupid', 'GroupId', 'groupId']);
	if (typeof requestid !== 'string' || typeof groupId !== 'string') {
		return {ok: false, reason: 'Invalid getKeyGenGroupId response shape.'};
	}
	const groupIdParsed = GroupIdSchema.safeParse(groupId);
	if (!groupIdParsed.success) {
		return {ok: false, reason: 'Invalid group ID in response.'};
	}
	return {ok: true, data: {requestid, groupId: groupIdParsed.data}};
}
