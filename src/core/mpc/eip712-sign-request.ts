import {EIP712_SIGN_REQUEST_KIND} from '@continuumdao/ctm-mpc-defi/core';

export {EIP712_SIGN_REQUEST_KIND};

export type Eip712Leg = {
	readonly version?: number;
	readonly digest?: string;
	readonly domain?: Record<string, unknown>;
	readonly types?: Record<string, unknown>;
	readonly primaryType?: string;
	readonly message?: Record<string, unknown>;
	readonly delivery: Record<string, unknown> & {kind: string};
};

export function parseExtraJsonField(
	detail: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
	if (!detail) return null;
	const raw = detail.ExtraJSON ?? detail.extraJSON;
	if (raw == null) return null;
	if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
	if (typeof raw !== 'string' || !raw.trim()) return null;
	try {
		const parsed = JSON.parse(raw) as unknown;
		return parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

export function isEip712SignRequest(detail: Record<string, unknown> | null | undefined): boolean {
	const extra = parseExtraJsonField(detail);
	return extra?.signRequestKind === EIP712_SIGN_REQUEST_KIND;
}

export function getEip712LegsFromDetail(
	detail: Record<string, unknown> | null | undefined,
): Eip712Leg[] {
	const extra = parseExtraJsonField(detail);
	const raw = extra?.eip712;
	if (!Array.isArray(raw) || raw.length === 0) return [];
	const out: Eip712Leg[] = [];
	for (const item of raw) {
		if (item == null || typeof item !== 'object' || Array.isArray(item)) continue;
		const row = item as Record<string, unknown>;
		const delivery = row.delivery;
		if (delivery == null || typeof delivery !== 'object' || Array.isArray(delivery)) continue;
		const kind = (delivery as Record<string, unknown>).kind;
		if (typeof kind !== 'string' || !kind.trim()) continue;
		out.push({
			...(typeof row.version === 'number' ? {version: row.version} : {}),
			...(typeof row.digest === 'string' ? {digest: row.digest} : {}),
			...(row.domain != null && typeof row.domain === 'object' && !Array.isArray(row.domain)
				? {domain: row.domain as Record<string, unknown>}
				: {}),
			...(row.types != null && typeof row.types === 'object' && !Array.isArray(row.types)
				? {types: row.types as Record<string, unknown>}
				: {}),
			...(typeof row.primaryType === 'string' ? {primaryType: row.primaryType} : {}),
			...(row.message != null && typeof row.message === 'object' && !Array.isArray(row.message)
				? {message: row.message as Record<string, unknown>}
				: {}),
			delivery: delivery as Record<string, unknown> & {kind: string},
		});
	}
	return out;
}

export function getEip712Delivery(
	detail: Record<string, unknown> | null | undefined,
	index = 0,
): Record<string, unknown> | null {
	return getEip712LegsFromDetail(detail)[index]?.delivery ?? null;
}

function normalizeHash(raw: unknown): string | undefined {
	if (typeof raw !== 'string' || !raw.trim()) return undefined;
	return raw.trim().replace(/^0x/i, '');
}

export function getEip712MessageHashesFromDetail(
	detail: Record<string, unknown> | null | undefined,
): string[] {
	if (!detail) return [];
	const hashes = detail.MessageHashes ?? detail.messageHashes;
	if (Array.isArray(hashes) && hashes.length > 0) {
		const out = hashes
			.map(h => normalizeHash(h))
			.filter((h): h is string => Boolean(h));
		if (out.length === hashes.length) return out;
	}
	const single = normalizeHash(detail.MessageHash ?? detail.messageHash ?? detail.msgHash);
	const legs = getEip712LegsFromDetail(detail);
	if (legs.length > 1) {
		const fromLegs = legs
			.map(l => normalizeHash(l.digest))
			.filter((h): h is string => Boolean(h));
		if (fromLegs.length === legs.length) return fromLegs;
	}
	if (single) return [single];
	const firstDigest = normalizeHash(legs[0]?.digest);
	return firstDigest ? [firstDigest] : [];
}

export function getEip712MessageHashFromDetail(
	detail: Record<string, unknown> | null | undefined,
): string | undefined {
	return getEip712MessageHashesFromDetail(detail)[0];
}

export function isEip712BodyForSign(bodyForSign: Record<string, unknown>): boolean {
	if (bodyForSign.proposalTxParams != null) return false;
	const extra = parseExtraJsonField(bodyForSign);
	return extra?.signRequestKind === EIP712_SIGN_REQUEST_KIND;
}

export function eip712SignResultAtIndex(
	result: Record<string, unknown>,
	index: number,
): Record<string, unknown> {
	const batch = (result.batchsignatures ?? result.BatchSignatures) as unknown[] | undefined;
	if (Array.isArray(batch) && batch.length > 0) {
		const entry = batch[index];
		if (entry != null && typeof entry === 'object' && !Array.isArray(entry)) {
			const e = entry as Record<string, unknown>;
			return {
				...e,
				r: e.sigr ?? e.Sigr ?? e.r ?? e.R,
				s: e.sigs ?? e.Sigs ?? e.s ?? e.S,
				v: e.sigrecover ?? e.Sigrecover ?? e.v ?? e.V,
			};
		}
	}
	if (index === 0) return result;
	return {};
}

export function eip712SignatureHexFromResult(result: Record<string, unknown>): string | undefined {
	const hex = result.signaturehex ?? result.SignatureHex ?? result.ethereumsignature ?? result.EthereumSignature;
	if (typeof hex === 'string' && hex.trim()) {
		return hex.trim().startsWith('0x') ? hex.trim() : `0x${hex.trim()}`;
	}
	const r = result.r ?? result.R ?? result.sigr ?? result.Sigr;
	const s = result.s ?? result.S ?? result.sigs ?? result.Sigs;
	const vRaw = result.v ?? result.V ?? result.sigrecover ?? result.Sigrecover;
	if (typeof r !== 'string' || typeof s !== 'string' || !r.trim() || !s.trim()) return undefined;
	let v = 27;
	if (typeof vRaw === 'number' && (vRaw === 27 || vRaw === 28)) v = vRaw;
	else if (typeof vRaw === 'string') {
		const t = vRaw.trim();
		if (t === '27' || t === '28') v = Number(t);
		else if (/^[0-9a-fA-F]+$/.test(t)) v = 27 + parseInt(t, 16);
	}
	if (v !== 27 && v !== 28) return undefined;
	const rHex = r.replace(/^0x/i, '').padStart(64, '0');
	const sHex = s.replace(/^0x/i, '').padStart(64, '0');
	return `0x${rHex}${sHex}${v === 27 ? '1b' : '1c'}`;
}

export function eip712DetailForLeg(
	detail: Record<string, unknown>,
	leg: Eip712Leg,
): Record<string, unknown> {
	return {
		...detail,
		extraJSON: JSON.stringify({
			signRequestKind: EIP712_SIGN_REQUEST_KIND,
			eip712: [leg],
		}),
	};
}
