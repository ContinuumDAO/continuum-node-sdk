import {
	arcusCanonicalJson,
	arcusFetchPerpMarkets,
} from '@continuumdao/ctm-mpc-defi/protocols/evm/arcus';
import {arcusPerpApiBaseUrl} from '@continuumdao/ctm-mpc-defi/protocols/evm/arcus';
import {PAYLOAD_SIGN_ED25519_REQUEST_KIND} from '@continuumdao/ctm-mpc-defi/core';
import type {ArcusPerpMarket} from '@continuumdao/ctm-mpc-defi/protocols/evm/arcus';
import type {SdkResult} from '../result.js';
import {extractEip712SignatureParts} from './deliver-hyperliquid-exchange.js';
import {getPersonalSignDelivery} from './deliver-personal-sign.js';
import {getEip712Delivery, parseExtraJsonField} from './eip712-sign-request.js';

type ArcusDelivery = Record<string, unknown> & {kind: string};

function normalizeEd25519SignatureHex(raw: unknown): string | null {
	if (typeof raw !== 'string' || !raw.trim()) return null;
	const hex = raw.trim().replace(/^0x/i, '').toLowerCase();
	if (hex.length !== 128) return null;
	return hex;
}

function extractEd25519SignatureHex(result: Record<string, unknown>, index = 0): string | null {
	const batchSigs = (result.batchsignatures ?? result.BatchSignatures) as unknown[] | undefined;
	if (Array.isArray(batchSigs) && batchSigs.length > index) {
		const entry = batchSigs[index];
		if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
			const sig = normalizeEd25519SignatureHex(
				(entry as Record<string, unknown>).signaturehex ??
					(entry as Record<string, unknown>).SignatureHex,
			);
			if (sig) return sig;
		}
	}
	return normalizeEd25519SignatureHex(
		result.signaturehex ?? result.SignatureHex ?? result.ed25519signature ?? result.Ed25519Signature,
	);
}

export function isPayloadSignEd25519SignRequest(signRequestDetail: Record<string, unknown>): boolean {
	const extra = parseExtraJsonField(signRequestDetail);
	return extra?.signRequestKind === PAYLOAD_SIGN_ED25519_REQUEST_KIND;
}

export function getArcusDelivery(signRequestDetail: Record<string, unknown>): ArcusDelivery | null {
	const extra = parseExtraJsonField(signRequestDetail);
	const delivery = extra?.delivery;
	if (delivery != null && typeof delivery === 'object' && !Array.isArray(delivery)) {
		return delivery as ArcusDelivery;
	}
	return null;
}

function decodeMsgRawUtf8(msgRaw: unknown): string | null {
	if (typeof msgRaw !== 'string' || !msgRaw.trim()) return null;
	const hex = msgRaw.trim().startsWith('0x') ? msgRaw.trim().slice(2) : msgRaw.trim();
	try {
		return Buffer.from(hex, 'hex').toString('utf8');
	} catch {
		return null;
	}
}

function parseWirePayload(raw: unknown): Record<string, unknown> | null {
	if (raw == null) return null;
	if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
	if (typeof raw === 'string' && raw.trim()) {
		try {
			return JSON.parse(raw) as Record<string, unknown>;
		} catch {
			return null;
		}
	}
	return null;
}

function quantumToHuman(quantums: number, step: string): string {
	const stepN = Number(step);
	if (!Number.isFinite(stepN) || stepN <= 0) return String(quantums);
	const value = quantums * stepN;
	const s = value.toFixed(12).replace(/\.?0+$/, '');
	return s || '0';
}

function mapWireSide(side: unknown): 'BUY' | 'SELL' {
	return Number(side) === 0 ? 'BUY' : 'SELL';
}

function mapWireTif(orderType: unknown): 'GTT' | 'FOK' | 'IOC' | 'ALO' {
	switch (Number(orderType)) {
		case 1:
			return 'FOK';
		case 2:
			return 'IOC';
		case 3:
			return 'ALO';
		default:
			return 'GTT';
	}
}

function wireToOrderRequest(
	wire: Record<string, unknown>,
	market: ArcusPerpMarket | undefined,
): Record<string, unknown> {
	const tick = market?.tickSize ?? '1';
	const step = market?.stepSize ?? '1';
	const goodTilNs = Number(wire.g ?? 0);
	return {
		address: String(wire.ad ?? '').toLowerCase(),
		marketId: Number(wire.m),
		accountIndex: Number(wire.ai ?? 0),
		orderSide: mapWireSide(wire.s),
		orderType: Number(wire.op) === 4 || wire.tpslType ? 'LIMIT' : 'LIMIT',
		quantity: quantumToHuman(Number(wire.q), step),
		price: quantumToHuman(Number(wire.p), tick),
		timeInForce: mapWireTif(wire.t),
		goodTilTime: String(Math.floor(goodTilNs / 1000)),
		timestamp: Number(wire.ct),
		clientTime: String(wire.ct),
		reduceOnly: Number(wire.r) === 1,
		...(typeof wire.c === 'string' && wire.c.trim() ? {clientId: wire.c.trim()} : {}),
		...(typeof wire.tpslType === 'string' && wire.tpslType.trim()
			? {tpslType: wire.tpslType, stopPrice: quantumToHuman(Number(wire.p), tick)}
			: {}),
	};
}

async function arcusSignedPost(args: {
	chainId: number;
	path: string;
	timestampNs: string;
	apiKeyHex: string;
	signatureHex: string;
	body: unknown;
	query?: Record<string, string>;
}): Promise<SdkResult<string>> {
	const base = arcusPerpApiBaseUrl(args.chainId);
	const params = new URLSearchParams(args.query ?? {});
	const url = params.size > 0 ? `${base}${args.path}?${params}` : `${base}${args.path}`;
	const res = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
			'X-API-Key': args.apiKeyHex.replace(/^0x/i, '').toLowerCase(),
			'X-Timestamp': args.timestampNs,
			'X-Signature': args.signatureHex,
		},
		body: JSON.stringify(args.body),
	});
	const text = await res.text();
	let parsed: unknown = text;
	if (text.trim()) {
		try {
			parsed = JSON.parse(text);
		} catch {
			parsed = text;
		}
	}
	if (!res.ok) {
		const message =
			typeof parsed === 'object' && parsed != null && !Array.isArray(parsed)
				? String((parsed as Record<string, unknown>).error ?? (parsed as Record<string, unknown>).message ?? res.statusText)
				: res.statusText;
		return {ok: false, reason: message.trim() || `Arcus ${args.path} failed (${res.status}).`};
	}
	const receiptId =
		typeof parsed === 'string'
			? parsed
			: typeof parsed === 'object' && parsed != null
				? JSON.stringify(parsed)
				: JSON.stringify({status: 'ok'});
	return {ok: true, data: receiptId};
}

async function deliverArcusCreateApiKey(args: {
	delivery: ArcusDelivery;
	signResult: Record<string, unknown>;
}): Promise<SdkResult<string>> {
	const body = args.delivery.body;
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return {ok: false, reason: 'Arcus createApiKey delivery missing body.'};
	}
	const signature = extractEip712SignatureParts(args.signResult);
	if (!signature) {
		return {ok: false, reason: 'Sign result missing r, s, v for Arcus createApiKey.'};
	}
	const chainIdRaw = args.delivery.chainId;
	const chainId = typeof chainIdRaw === 'number' ? chainIdRaw : Number(chainIdRaw);
	if (!Number.isFinite(chainId)) {
		return {ok: false, reason: 'Arcus createApiKey delivery missing chainId.'};
	}
	const base = arcusPerpApiBaseUrl(chainId);
	const res = await fetch(`${base}/v1/createApiKey`, {
		method: 'POST',
		headers: {'Content-Type': 'application/json', Accept: 'application/json'},
		body: JSON.stringify({
			...(body as Record<string, unknown>),
			signature: {r: signature.r, s: signature.s, v: signature.v},
		}),
	});
	const text = await res.text();
	if (!res.ok) {
		return {ok: false, reason: text.trim() || 'Arcus createApiKey submit failed.'};
	}
	return {ok: true, data: text.trim() || JSON.stringify({status: 'ok'})};
}

async function deliverArcusExchange(args: {
	signRequestDetail: Record<string, unknown>;
	signResult: Record<string, unknown>;
	delivery: ArcusDelivery;
}): Promise<SdkResult<string>> {
	const chainIdRaw = args.delivery.chainId;
	const chainId = typeof chainIdRaw === 'number' ? chainIdRaw : Number(chainIdRaw);
	if (!Number.isFinite(chainId)) {
		return {ok: false, reason: 'Arcus delivery missing chainId.'};
	}
	const apiKeyHex = String(args.delivery.apiKeyPubKeyHex ?? '').trim();
	if (!apiKeyHex) {
		return {ok: false, reason: 'Arcus delivery missing apiKeyPubKeyHex.'};
	}
	const timestampNs = String(args.delivery.timestampNs ?? '').trim();
	if (!timestampNs) {
		return {ok: false, reason: 'Arcus delivery missing timestampNs.'};
	}
	const endpoint = String(args.delivery.endpoint ?? '').trim();
	if (!endpoint) {
		return {ok: false, reason: 'Arcus delivery missing endpoint.'};
	}

	if (endpoint === 'batchPlaceOrders') {
		const batchSigs = (args.signResult.batchsignatures ?? args.signResult.BatchSignatures) as
			| unknown[]
			| undefined;
		const msgRawBatch = (args.signRequestDetail.MessageRawBatch ??
			args.signRequestDetail.messageRawBatch) as unknown[] | undefined;
		if (!Array.isArray(batchSigs) || !Array.isArray(msgRawBatch) || batchSigs.length === 0) {
			return {ok: false, reason: 'Arcus batch delivery missing batch signatures or MessageRawBatch.'};
		}
		const {markets} = await arcusFetchPerpMarkets({chainId});
		const orders: Record<string, unknown>[] = [];
		for (let i = 0; i < batchSigs.length; i++) {
			const sigHex = extractEd25519SignatureHex(args.signResult, i);
			if (!sigHex) {
				return {ok: false, reason: `Arcus batch leg ${i + 1} missing Ed25519 signature.`};
			}
			const canonical = decodeMsgRawUtf8(msgRawBatch[i]);
			const wire = parseWirePayload(canonical);
			if (!wire) {
				return {ok: false, reason: `Arcus batch leg ${i + 1} missing wire payload.`};
			}
			const market = markets.find((m: {marketId: number}) => m.marketId === Number(wire.m));
			orders.push({...wireToOrderRequest(wire, market), signature: sigHex});
		}
		const headerSig = extractEd25519SignatureHex(args.signResult, 0);
		if (!headerSig) {
			return {ok: false, reason: 'Arcus batch delivery missing header signature.'};
		}
		const address = String(orders[0]?.address ?? '').trim();
		return arcusSignedPost({
			chainId,
			path: '/v1/batchPlaceOrders',
			timestampNs,
			apiKeyHex,
			signatureHex: headerSig,
			query: address ? {address} : undefined,
			body: {
				grouping: args.delivery.grouping ?? 'positionTpsl',
				orders,
			},
		});
	}

	const signatureHex = extractEd25519SignatureHex(args.signResult, 0);
	if (!signatureHex) {
		return {ok: false, reason: 'Sign result missing Ed25519 signature for Arcus delivery.'};
	}

	if (Number(args.delivery.scheme) === 2 || endpoint === 'setLeverage') {
		const body = args.delivery.body;
		if (!body || typeof body !== 'object' || Array.isArray(body)) {
			return {ok: false, reason: `Arcus ${endpoint} delivery missing body.`};
		}
		const canonical =
			typeof args.delivery.canonical === 'string' && args.delivery.canonical.trim()
				? args.delivery.canonical.trim()
				: arcusCanonicalJson(body as Record<string, unknown>);
		const address = String((body as Record<string, unknown>).address ?? '').trim().toLowerCase();
		return arcusSignedPost({
			chainId,
			path: `/v1/${endpoint}`,
			timestampNs,
			apiKeyHex,
			signatureHex,
			query: address ? {address} : undefined,
			body,
		});
	}

	const wire = parseWirePayload(args.delivery.body);
	if (!wire) {
		return {ok: false, reason: 'Arcus order delivery missing wire body.'};
	}
	const {markets} = await arcusFetchPerpMarkets({chainId});
	const market = markets.find((m: {marketId: number}) => m.marketId === Number(wire.m));
	const orderBody = wireToOrderRequest(wire, market);
	const address = String(orderBody.address ?? '').trim().toLowerCase();
	const path =
		endpoint === 'placeOrder'
			? '/v1/placeOrder'
			: endpoint === 'cancelOrder'
				? '/v1/cancelOrder'
				: `/v1/${endpoint}`;
	return arcusSignedPost({
		chainId,
		path,
		timestampNs,
		apiKeyHex,
		signatureHex,
		query: address ? {address} : undefined,
		body: orderBody,
	});
}

async function deliverArcusSpotRfq(args: {
	signResult: Record<string, unknown>;
	delivery: ArcusDelivery;
}): Promise<SdkResult<string>> {
	const chainIdRaw = args.delivery.chainId;
	const chainId = typeof chainIdRaw === 'number' ? chainIdRaw : Number(chainIdRaw);
	if (!Number.isFinite(chainId)) {
		return {ok: false, reason: 'Arcus spot RFQ delivery missing chainId.'};
	}
	const apiKeyHex = String(args.delivery.apiKeyPubKeyHex ?? '').trim();
	const timestampNs = String(args.delivery.timestampNs ?? '').trim();
	const endpoint = String(args.delivery.endpoint ?? '').trim();
	const signatureHex = extractEd25519SignatureHex(args.signResult, 0);
	const body = args.delivery.body;
	if (!apiKeyHex || !timestampNs || !endpoint || !signatureHex) {
		return {ok: false, reason: 'Arcus spot RFQ delivery missing signing metadata.'};
	}
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return {ok: false, reason: 'Arcus spot RFQ delivery missing body.'};
	}
	const address = String((body as Record<string, unknown>).address ?? '').trim().toLowerCase();
	return arcusSignedPost({
		chainId,
		path: `/v1/${endpoint}`,
		timestampNs,
		apiKeyHex,
		signatureHex,
		query: address ? {address} : undefined,
		body,
	});
}

async function deliverArcusWithdraw(args: {
	delivery: ArcusDelivery;
	signResult: Record<string, unknown>;
}): Promise<SdkResult<string>> {
	const body = args.delivery.body;
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return {ok: false, reason: 'Arcus withdraw delivery missing body.'};
	}
	const signature = extractEip712SignatureParts(args.signResult);
	if (!signature) {
		return {ok: false, reason: 'Sign result missing r, s, v for Arcus withdraw.'};
	}
	const chainIdRaw = args.delivery.chainId;
	const chainId = typeof chainIdRaw === 'number' ? chainIdRaw : Number(chainIdRaw);
	if (!Number.isFinite(chainId)) {
		return {ok: false, reason: 'Arcus withdraw delivery missing chainId.'};
	}
	const base = arcusPerpApiBaseUrl(chainId);
	const res = await fetch(`${base}/v1/withdraw`, {
		method: 'POST',
		headers: {'Content-Type': 'application/json', Accept: 'application/json'},
		body: JSON.stringify({
			...(body as Record<string, unknown>),
			signature: {r: signature.r, s: signature.s, v: signature.v},
		}),
	});
	const text = await res.text();
	if (!res.ok) {
		return {ok: false, reason: text.trim() || `Arcus withdraw failed (${res.status}).`};
	}
	return {ok: true, data: text.trim() || JSON.stringify({status: 'accepted'})};
}

export async function deliverArcusWithdrawSignature(args: {
	signRequestDetail: Record<string, unknown>;
	signResult: Record<string, unknown>;
}): Promise<SdkResult<string>> {
	const delivery = getEip712Delivery(args.signRequestDetail);
	if (!delivery || delivery.kind !== 'arcus_withdraw') {
		return {ok: false, reason: 'Sign request is not an Arcus withdraw delivery.'};
	}
	return deliverArcusWithdraw({delivery: delivery as ArcusDelivery, signResult: args.signResult});
}

export async function deliverArcusSignature(args: {
	signRequestDetail: Record<string, unknown>;
	signResult: Record<string, unknown>;
}): Promise<SdkResult<string>> {
	const personalDelivery = getPersonalSignDelivery(args.signRequestDetail);
	if (personalDelivery?.kind === 'arcus_create_api_key') {
		return deliverArcusCreateApiKey({
			delivery: personalDelivery as ArcusDelivery,
			signResult: args.signResult,
		});
	}

	const delivery = getArcusDelivery(args.signRequestDetail);
	if (!delivery) {
		return {ok: false, reason: 'Sign request is not an Arcus delivery.'};
	}

	if (delivery.kind === 'arcus_exchange') {
		return deliverArcusExchange({
			signRequestDetail: args.signRequestDetail,
			signResult: args.signResult,
			delivery,
		});
	}
	if (delivery.kind === 'arcus_spot_rfq') {
		return deliverArcusSpotRfq({signResult: args.signResult, delivery});
	}
	return {ok: false, reason: `Unsupported Arcus delivery kind: ${String(delivery.kind)}.`};
}

export function isArcusSignRequest(signRequestDetail: Record<string, unknown>): boolean {
	const personal = getPersonalSignDelivery(signRequestDetail);
	if (personal?.kind === 'arcus_create_api_key') return true;
	if (!isPayloadSignEd25519SignRequest(signRequestDetail)) return false;
	const delivery = getArcusDelivery(signRequestDetail);
	return delivery?.kind === 'arcus_exchange' || delivery?.kind === 'arcus_spot_rfq';
}
