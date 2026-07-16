import {lighterAttachL1Signature, lighterSendTx} from '@continuumdao/ctm-mpc-defi/protocols/evm/lighter';
import type {SdkResult} from '../result.js';
import {extractEip712SignatureParts} from './deliver-hyperliquid-exchange.js';

export type PersonalSignDelivery = {
	kind: string;
	chainId?: number;
	txType?: number;
	txInfo?: string;
	needsL1Sig?: boolean;
};

function parseExtraJson(signRequestDetail: Record<string, unknown>): Record<string, unknown> | null {
	const raw = signRequestDetail.extraJSON ?? signRequestDetail.ExtraJSON;
	if (typeof raw !== 'string' || !raw.trim()) return null;
	try {
		return JSON.parse(raw) as Record<string, unknown>;
	} catch {
		return null;
	}
}

export function getPersonalSignDelivery(
	signRequestDetail: Record<string, unknown>,
): PersonalSignDelivery | null {
	const extra = parseExtraJson(signRequestDetail);
	if (!extra || extra.signRequestKind !== 'personal_sign') return null;
	const delivery = extra.delivery;
	if (!delivery || typeof delivery !== 'object' || Array.isArray(delivery)) return null;
	return delivery as PersonalSignDelivery;
}

export function isPersonalSignSignRequest(signRequestDetail: Record<string, unknown>): boolean {
	return getPersonalSignDelivery(signRequestDetail) != null;
}

export async function deliverLighterSendTxSignature(args: {
	signRequestDetail: Record<string, unknown>;
	signResult: Record<string, unknown>;
}): Promise<SdkResult<string>> {
	const delivery = getPersonalSignDelivery(args.signRequestDetail);
	if (!delivery || delivery.kind !== 'lighter_send_tx') {
		return {ok: false, reason: 'Sign request is not a Lighter sendTx delivery.'};
	}
	const txType = delivery.txType;
	const txInfo = delivery.txInfo;
	if (typeof txType !== 'number' || typeof txInfo !== 'string' || !txInfo.trim()) {
		return {ok: false, reason: 'Lighter delivery missing txType or txInfo.'};
	}
	const chainIdRaw = delivery.chainId ?? args.signRequestDetail.DestinationChainID ?? args.signRequestDetail.destinationChainID;
	const chainId = typeof chainIdRaw === 'number' ? chainIdRaw : Number(chainIdRaw);
	if (!Number.isFinite(chainId)) {
		return {ok: false, reason: 'Lighter delivery missing chainId.'};
	}

	let finalTxInfo = txInfo;
	if (delivery.needsL1Sig === true) {
		const signature = extractEip712SignatureParts(args.signResult);
		if (!signature) {
			return {ok: false, reason: 'Sign result missing r, s, v for Lighter L1Sig.'};
		}
		const sigHex = `${signature.r}${signature.s.slice(2)}${signature.v.toString(16).padStart(2, '0')}`;
		finalTxInfo = lighterAttachL1Signature(txInfo, sigHex);
	}

	const sent = await lighterSendTx({chainId, txType, txInfo: finalTxInfo});
	return {ok: true, data: sent.txHash || JSON.stringify(sent)};
}
