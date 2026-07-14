import {EIP712_SIGN_REQUEST_KIND} from '@continuumdao/ctm-mpc-defi/core';

export {EIP712_SIGN_REQUEST_KIND};

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

export function getEip712Delivery(
	detail: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
	const extra = parseExtraJsonField(detail);
	const delivery = extra?.delivery;
	if (delivery != null && typeof delivery === 'object' && !Array.isArray(delivery)) {
		return delivery as Record<string, unknown>;
	}
	return null;
}

export function getEip712MessageHashFromDetail(
	detail: Record<string, unknown> | null | undefined,
): string | undefined {
	if (!detail) return undefined;
	const raw = detail.MessageHash ?? detail.messageHash ?? detail.msgHash;
	if (typeof raw === 'string' && raw.trim()) {
		return raw.trim().replace(/^0x/i, '');
	}
	const hashes = detail.MessageHashes ?? detail.messageHashes;
	if (Array.isArray(hashes) && hashes.length > 0) {
		const h = hashes[0];
		if (typeof h === 'string' && h.trim()) {
			return h.trim().replace(/^0x/i, '');
		}
	}
	const extra = parseExtraJsonField(detail);
	const eip712 = extra?.eip712;
	if (eip712 != null && typeof eip712 === 'object' && !Array.isArray(eip712)) {
		const digest = (eip712 as Record<string, unknown>).digest;
		if (typeof digest === 'string' && digest.trim()) {
			return digest.trim().replace(/^0x/i, '');
		}
	}
	return undefined;
}

export function isEip712BodyForSign(bodyForSign: Record<string, unknown>): boolean {
	if (bodyForSign.proposalTxParams != null) return false;
	const extra = parseExtraJsonField(bodyForSign);
	return extra?.signRequestKind === EIP712_SIGN_REQUEST_KIND;
}
