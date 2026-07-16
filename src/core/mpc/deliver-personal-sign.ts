import type {SdkResult} from '../result.js';
import {extractEip712SignatureParts} from './deliver-hyperliquid-exchange.js';
import {parseExtraJsonField} from './eip712-sign-request.js';

export type PersonalSignDelivery = {
	kind: string;
	chainId?: number;
	txType?: number;
	txInfo?: string;
	needsL1Sig?: boolean;
};

export function getPersonalSignDelivery(
	signRequestDetail: Record<string, unknown>,
): PersonalSignDelivery | null {
	const extra = parseExtraJsonField(signRequestDetail);
	if (!extra || extra.signRequestKind !== 'personal_sign') return null;
	const delivery = extra.delivery;
	if (!delivery || typeof delivery !== 'object' || Array.isArray(delivery)) return null;
	return delivery as PersonalSignDelivery;
}

export function isPersonalSignSignRequest(signRequestDetail: Record<string, unknown>): boolean {
	return getPersonalSignDelivery(signRequestDetail) != null;
}

/** Re-export for callers that need EIP-712 parts from personal_sign flows. */
export {extractEip712SignatureParts};
