import {ryskPostSigned} from '@continuumdao/ctm-mpc-defi/protocols/evm/rysk';
import type {SdkResult} from '../result.js';
import {eip712SignatureHexFromResult, getEip712Delivery} from './eip712-sign-request.js';

function paramsFromDelivery(delivery: Record<string, unknown>): Record<string, unknown> | null {
	const params = delivery.params;
	if (!params || typeof params !== 'object' || Array.isArray(params)) return null;
	return structuredClone(params) as Record<string, unknown>;
}

/** Sends a signed Rysk V12 confirmation, maker transfer, or maker quote over the protocol websocket. */
export async function deliverRyskV12Signature(args: {
	signRequestDetail: Record<string, unknown>;
	signResult: Record<string, unknown>;
}): Promise<SdkResult<string>> {
	const delivery = getEip712Delivery(args.signRequestDetail);
	if (!delivery || delivery.kind !== 'rysk_v12') {
		return {ok: false, reason: 'Sign request is not a Rysk V12 delivery.'};
	}
	const socket = delivery.socket === '/maker' || delivery.socket === '/taker' ? delivery.socket : '';
	const method = typeof delivery.method === 'string' ? delivery.method : '';
	const params = paramsFromDelivery(delivery);
	if (!socket || !method || !params) {
		return {ok: false, reason: 'Rysk delivery is missing socket, method, or params.'};
	}
	const signatureHex = eip712SignatureHexFromResult(args.signResult);
	if (!signatureHex) {
		return {ok: false, reason: 'Sign result missing r, s, v for Rysk delivery.'};
	}
	params.signature = signatureHex;
	const rpcId = typeof delivery.rpcId === 'string' ? delivery.rpcId : undefined;
	try {
		const result = await ryskPostSigned({socket, method, params, rpcId});
		return {ok: true, data: typeof result === 'string' ? result : JSON.stringify(result)};
	} catch (err) {
		return {ok: false, reason: err instanceof Error ? err.message : 'Rysk delivery failed.'};
	}
}
