import {postDeriveExchange, saveDeriveOwnerLogin, normalizeDeriveOwnerLoginSignature} from '@continuumdao/ctm-mpc-defi/protocols/evm/derive';
import type {SdkResult} from '../result.js';
import {eip712SignatureHexFromResult, getEip712Delivery} from './eip712-sign-request.js';
import {getPersonalSignDelivery} from './deliver-personal-sign.js';

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
	return structuredClone(params) as Record<string, unknown>;
}

function setSignaturePath(params: Record<string, unknown>, path: string, signature: string): boolean {
	const parts = path.split('.').filter(Boolean);
	if (parts.length === 0) return false;
	let cursor: Record<string, unknown> = params;
	for (let i = 0; i < parts.length - 1; i++) {
		const next = cursor[parts[i]!];
		if (!next || typeof next !== 'object' || Array.isArray(next)) return false;
		cursor = next as Record<string, unknown>;
	}
	cursor[parts[parts.length - 1]!] = signature;
	return true;
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
	let signatureHex = args.attachSignature === false ? undefined : eip712SignatureHexFromResult(args.signResult);
	if (args.attachSignature !== false && !signatureHex) {
		return {ok: false, reason: 'Sign result missing r, s, v for Derive delivery.'};
	}
	const signaturePath = typeof delivery.signaturePath === 'string' ? delivery.signaturePath : '';
	if (signatureHex && signaturePath) {
		if (!setSignaturePath(params, signaturePath, signatureHex)) {
			return {ok: false, reason: `Derive delivery signature path ${signaturePath} was not found.`};
		}
		signatureHex = undefined;
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

/** Posts one Derive body after every paired EIP-712 leg has a signature. */
export async function deliverDerivePairedExchange(args: {
	signRequestDetail: Record<string, unknown>;
	signatures: string[];
}): Promise<SdkResult<string>> {
	const delivery = getEip712Delivery(args.signRequestDetail);
	if (!delivery || delivery.kind !== 'derive_exchange_pair') {
		return {ok: false, reason: 'Sign request is not a paired Derive exchange delivery.'};
	}
	const method = typeof delivery.method === 'string' ? delivery.method : '';
	const owner = ownerFromDelivery(delivery);
	const params = paramsFromDelivery(delivery);
	const paths = Array.isArray(delivery.signaturePaths)
		? delivery.signaturePaths.filter((item): item is string => typeof item === 'string')
		: [];
	if (!method || !owner || !params || paths.length === 0 || args.signatures.length < paths.length) {
		return {ok: false, reason: 'Paired Derive delivery is missing a method, owner, body, or signature.'};
	}
	for (let i = 0; i < paths.length; i++) {
		const signature = args.signatures[i];
		if (!signature || !setSignaturePath(params, paths[i]!, signature)) {
			return {ok: false, reason: `Derive delivery signature path ${paths[i]} was not found.`};
		}
	}
	try {
		const result = await postDeriveExchange({
			method,
			network: networkFromDelivery(delivery),
			owner,
			params,
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
		const normalized = await normalizeDeriveOwnerLoginSignature(owner, timestamp, signatureHex).catch(() => null);
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
