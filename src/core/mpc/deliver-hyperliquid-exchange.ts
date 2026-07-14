import {hyperliquidApiBaseUrl} from '@continuumdao/ctm-mpc-defi/protocols/evm/hyperliquid';
import type {SdkResult} from '../result.js';
import {getEip712Delivery, parseExtraJsonField} from './eip712-sign-request.js';

export type Eip712SignatureParts = {
	r: string;
	s: string;
	v: number;
};

function normalizeHex(value: string): string {
	const trimmed = value.trim();
	return trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
}

export function extractEip712SignatureParts(
	result: Record<string, unknown>,
): Eip712SignatureParts | null {
	const r = result.r ?? result.R;
	const s = result.s ?? result.S;
	let v = result.v ?? result.V;
	if (typeof r !== 'string' || typeof s !== 'string') return null;
	if (typeof v === 'string') v = Number.parseInt(v, 10);
	if (typeof v !== 'number' || !Number.isFinite(v)) return null;
	return {r: normalizeHex(r), s: normalizeHex(s), v};
}

export function parseHyperliquidExchangeApiError(response: unknown): string | null {
	if (response == null) return null;
	if (typeof response === 'string' && response.trim()) return response.trim();
	if (typeof response !== 'object' || Array.isArray(response)) return null;
	const o = response as Record<string, unknown>;
	if (o.status === 'err') {
		const inner = o.response;
		if (typeof inner === 'string' && inner.trim()) return inner.trim();
		if (inner != null) return JSON.stringify(inner);
		return 'Hyperliquid exchange returned status err.';
	}
	return null;
}

export async function deliverHyperliquidExchangeSignature(args: {
	signRequestDetail: Record<string, unknown>;
	signResult: Record<string, unknown>;
}): Promise<SdkResult<string>> {
	const delivery = getEip712Delivery(args.signRequestDetail);
	if (!delivery || delivery.kind !== 'hyperliquid_exchange') {
		return {ok: false, reason: 'Sign request is not a Hyperliquid exchange delivery.'};
	}
	const action = delivery.action;
	const nonce = delivery.nonce;
	if (action == null || typeof action !== 'object' || Array.isArray(action)) {
		return {ok: false, reason: 'Hyperliquid delivery missing action.'};
	}
	if (typeof nonce !== 'number' && typeof nonce !== 'string') {
		return {ok: false, reason: 'Hyperliquid delivery missing nonce.'};
	}
	const signature = extractEip712SignatureParts(args.signResult);
	if (!signature) {
		return {ok: false, reason: 'Sign result missing r, s, v for Hyperliquid delivery.'};
	}

	const chainIdRaw = delivery.chainId ?? parseExtraJsonField(args.signRequestDetail)?.destinationChainID;
	const chainId = typeof chainIdRaw === 'number' ? chainIdRaw : Number(chainIdRaw);
	if (!Number.isFinite(chainId)) {
		return {ok: false, reason: 'Hyperliquid delivery missing chainId.'};
	}
	const isTestnet = delivery.isTestnet === true || chainId === 998;
	const baseUrl = hyperliquidApiBaseUrl(chainId);

	const res = await fetch(`${baseUrl}/exchange`, {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify({
			action,
			nonce,
			signature: {
				r: signature.r,
				s: signature.s,
				v: signature.v,
			},
			...(isTestnet ? {testnet: true} : {}),
		}),
	});
	const raw = (await res.json()) as unknown;
	if (!res.ok) {
		const message =
			typeof raw === 'object' && raw != null && !Array.isArray(raw)
				? String((raw as Record<string, unknown>).error ?? (raw as Record<string, unknown>).message ?? res.statusText)
				: res.statusText;
		return {ok: false, reason: message.trim() || 'Hyperliquid exchange submit failed.'};
	}
	const hlErr = parseHyperliquidExchangeApiError(raw);
	if (hlErr) {
		return {ok: false, reason: hlErr};
	}
	const receiptId =
		typeof raw === 'string'
			? raw
			: typeof raw === 'object' && raw != null && !Array.isArray(raw)
				? JSON.stringify(raw)
				: JSON.stringify({status: 'ok'});
	return {ok: true, data: receiptId};
}
