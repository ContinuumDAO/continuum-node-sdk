import {getAddress, hashMessage, recoverAddress, type Hex} from 'viem';
import {postDeriveExchange, saveDeriveOwnerLogin} from '@continuumdao/ctm-mpc-defi/protocols/evm/derive';
import type {SdkResult} from '../result.js';
import {eip712SignatureHexFromResult, getEip712Delivery} from './eip712-sign-request.js';
import {getPersonalSignDelivery} from './deliver-personal-sign.js';

async function normalizeOwnerLoginSignature(owner: string, timestamp: string, signature: string): Promise<string | null> {
	const body = signature.trim().replace(/^0x/i, '').toLowerCase();
	if (!/^[0-9a-f]+$/.test(body) || (body.length !== 128 && body.length !== 130)) return null;
	const expected = getAddress(owner).toLowerCase();
	const hash = hashMessage(timestamp.trim());
	const candidates = body.length === 130 ? [body] : [`${body}1b`, `${body}1c`];
	for (const candidate of candidates) {
		try {
			const recovered = await recoverAddress({hash, signature: `0x${candidate}` as Hex});
			if (recovered.toLowerCase() === expected) return `0x${candidate}`;
		} catch {
			continue;
		}
	}
	return null;
}

function ownerFromDelivery(delivery: Record<string, unknown>): string {
	const params = delivery.params;
	const signer =
		params && typeof params === 'object' && !Array.isArray(params)
			? (params as Record<string, unknown>).signer
			: undefined;
	const owner = delivery.owner ?? signer;
	return typeof owner === 'string' ? owner.trim() : '';
}

function networkFromDelivery(delivery: Record<string, unknown>): 'mainnet' | 'testnet' {
	return delivery.network === 'testnet' ? 'testnet' : 'mainnet';
}

function paramsFromDelivery(delivery: Record<string, unknown>): Record<string, unknown> | null {
	const params = delivery.params;
	if (!params || typeof params !== 'object' || Array.isArray(params)) return null;
	return {...(params as Record<string, unknown>)};
}

export async function deliverDeriveExchangeSignature(args: {
	signRequestDetail: Record<string, unknown>;
	signResult: Record<string, unknown>;
	/** Personal-sign approvals are not the Derive action signature. */
	attachSignature?: boolean;
}): Promise<SdkResult<string>> {
	const delivery =
		getEip712Delivery(args.signRequestDetail) ??
		(getPersonalSignDelivery(args.signRequestDetail) as Record<string, unknown> | null);
	if (!delivery || delivery.kind !== 'derive_exchange') {
		return {ok: false, reason: 'Sign request is not a Derive exchange delivery.'};
	}
	const method = typeof delivery.method === 'string' ? delivery.method : '';
	const owner = ownerFromDelivery(delivery);
	const params = paramsFromDelivery(delivery);
	if (!method || !owner || !params) {
		return {ok: false, reason: 'Derive delivery is missing method, owner, or params.'};
	}
	const signatureHex = args.attachSignature === false ? undefined : eip712SignatureHexFromResult(args.signResult);
	if (args.attachSignature !== false && !signatureHex) {
		return {ok: false, reason: 'Sign result missing r, s, v for Derive delivery.'};
	}
	try {
		const result = await postDeriveExchange({
			method,
			network: networkFromDelivery(delivery),
			owner,
			params,
			signatureHex,
		});
		return {ok: true, data: typeof result === 'string' ? result : JSON.stringify(result)};
	} catch (err) {
		return {ok: false, reason: err instanceof Error ? err.message : 'Derive delivery failed.'};
	}
}

export async function deliverDerivePersonalSign(args: {
	signRequestDetail: Record<string, unknown>;
	signResult: Record<string, unknown>;
}): Promise<SdkResult<string>> {
	const delivery = getPersonalSignDelivery(args.signRequestDetail) as Record<string, unknown> | null;
	if (!delivery) return {ok: false, reason: 'Sign request is not a personal_sign delivery.'};
	const signatureHex = eip712SignatureHexFromResult(args.signResult);
	if (!signatureHex) return {ok: false, reason: 'Personal sign signature is missing.'};
	if (delivery.kind === 'derive_owner_login') {
		const owner = typeof delivery.owner === 'string' ? delivery.owner : '';
		const timestamp = typeof delivery.timestamp === 'string' ? delivery.timestamp : '';
		if (!owner || !timestamp) return {ok: false, reason: 'Owner login delivery is missing owner or timestamp.'};
		const normalized = await normalizeOwnerLoginSignature(owner, timestamp, signatureHex);
		if (!normalized) return {ok: false, reason: 'Owner login signature does not recover to this KeyGen.'};
		saveDeriveOwnerLogin(owner, timestamp, normalized);
		return {ok: true, data: `Derive owner login saved for ${owner}. Broadcast set_session_key next.`};
	}
	if (delivery.kind === 'derive_competition_proof') {
		return {ok: true, data: signatureHex};
	}
	if (delivery.kind === 'derive_exchange') {
		return deliverDeriveExchangeSignature({...args, attachSignature: false});
	}
	return {ok: false, reason: `personal_sign delivery kind is not supported for SDK broadcast.`};
}
