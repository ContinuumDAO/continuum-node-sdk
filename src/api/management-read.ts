import {readApiCode, readApiData, type ApiEnvelope} from './envelope.js';
import {nodeFetchWithReadAuth, type NodeReadAuth} from './node-read.js';

function mpcAuthData(raw: ApiEnvelope): unknown {
	const code = readApiCode(raw);
	if (code !== 0 && code !== undefined) return undefined;
	return readApiData(raw);
}

/**
 * GET /getNodeKey — 128-hex MPC node id required on all NodeMgtKeySig POST bodies.
 */
export async function fetchNodeKey(
	nodeUrl: string,
	readAuth: NodeReadAuth = {bearerOnGet: false, jwt: null},
): Promise<{nodeKey: string; ok: boolean}> {
	const base = nodeUrl.trim().replace(/\/$/, '');
	const res = await nodeFetchWithReadAuth(`${base}/getNodeKey`, {cache: 'no-store'}, readAuth);
	const text = await res.text();
	let raw: ApiEnvelope;
	try {
		raw = JSON.parse(text) as ApiEnvelope;
	} catch {
		return {nodeKey: '', ok: false};
	}
	const data = mpcAuthData(raw);
	const nk =
		typeof data === 'string'
			? data
			: data != null && typeof data === 'object' && !Array.isArray(data)
				? String(
						(data as Record<string, unknown>).nodeKey ??
							(data as Record<string, unknown>).NodeKey ??
							'',
					)
				: data != null
					? String(data)
					: '';
	const trimmed = nk.trim().replace(/^0x/i, '');
	if (!/^[0-9a-fA-F]{128}$/.test(trimmed)) {
		return {nodeKey: '', ok: false};
	}
	return {nodeKey: trimmed.toLowerCase(), ok: res.ok};
}

/**
 * GET /getPublicMgtKeyNonce (Ed25519) or GET /getNodeMgtKeyNonce (Ethereum NodeMgtKey).
 * For Ed25519 added keys, pass `?publicKey=<64-hex>`.
 */
export async function fetchManagementNonce(
	nodeUrl: string,
	useEd25519: boolean,
	ed25519PublicKey?: string,
	readAuth: NodeReadAuth = {bearerOnGet: false, jwt: null},
): Promise<{nonce: number; ok: boolean; code: number}> {
	const base = nodeUrl.trim().replace(/\/$/, '');
	const path = useEd25519 ? '/getPublicMgtKeyNonce' : '/getNodeMgtKeyNonce';
	const url =
		useEd25519 && ed25519PublicKey && /^[0-9a-fA-F]{64}$/.test(ed25519PublicKey.trim())
			? `${base}${path}?publicKey=${encodeURIComponent(ed25519PublicKey.trim())}`
			: `${base}${path}`;
	const res = await nodeFetchWithReadAuth(url, {cache: 'no-store'}, readAuth);
	const text = await res.text();
	let raw: ApiEnvelope;
	try {
		raw = JSON.parse(text) as ApiEnvelope;
	} catch {
		return {nonce: 0, ok: false, code: -1};
	}
	const code = readApiCode(raw) as number | undefined;
	const payload = mpcAuthData(raw) ?? readApiData(raw);
	let nonce = 0;
	if (typeof payload === 'number' && !Number.isNaN(payload)) {
		nonce = payload;
	} else if (payload && typeof payload === 'object') {
		const n =
			(payload as Record<string, unknown>).nonce ?? (payload as Record<string, unknown>).Nonce;
		nonce = typeof n === 'number' && !Number.isNaN(n) ? n : Number(n) || 0;
	}
	return {nonce, ok: res.ok && (code === 0 || code === undefined), code: code ?? -1};
}

export type PreferredKeyGenStatus = {
	keyGenId: string;
	pubKey: string;
	keyType: string;
};

/** GET /getPreferredKeyGen — default multi-agree KeyGen for multiSignRequest. */
export async function fetchPreferredKeyGen(
	nodeUrl: string,
	readAuth: NodeReadAuth = {bearerOnGet: false, jwt: null},
): Promise<{status: PreferredKeyGenStatus; ok: boolean}> {
	const base = nodeUrl.trim().replace(/\/$/, '');
	const res = await nodeFetchWithReadAuth(`${base}/getPreferredKeyGen`, {cache: 'no-store'}, readAuth);
	const text = await res.text();
	let raw: ApiEnvelope;
	try {
		raw = JSON.parse(text) as ApiEnvelope;
	} catch {
		return {status: {keyGenId: '', pubKey: '', keyType: ''}, ok: false};
	}
	const data = mpcAuthData(raw);
	if (!data || typeof data !== 'object' || Array.isArray(data)) {
		return {status: {keyGenId: '', pubKey: '', keyType: ''}, ok: res.ok};
	}
	const d = data as Record<string, unknown>;
	return {
		status: {
			keyGenId: String(d.keyGenId ?? d.KeyGenId ?? '').trim(),
			pubKey: String(d.pubKey ?? d.PubKey ?? d.pubkeyhex ?? d.PubKeyHex ?? '').trim(),
			keyType: String(d.keyType ?? d.KeyType ?? '').trim(),
		},
		ok: res.ok,
	};
}
