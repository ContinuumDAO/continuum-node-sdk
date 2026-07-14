import {buildUniswapXLimitOrderSubmitBody, submitUniswapXLimitOrder} from '@continuumdao/ctm-mpc-defi/protocols/evm/uniswap-v4';
import type {SdkResult} from '../result.js';
import {getEip712Delivery, parseExtraJsonField} from './eip712-sign-request.js';
import {extractEip712SignatureParts} from './deliver-hyperliquid-exchange.js';

function signatureHexFromParts(parts: {r: string; s: string; v: number}): string {
	const vHex = parts.v === 27 ? '1b' : '1c';
	const r = parts.r.replace(/^0x/, '').padStart(64, '0');
	const s = parts.s.replace(/^0x/, '').padStart(64, '0');
	return `0x${r}${s}${vHex}`;
}

export async function deliverUniswapXLimitOrderSignature(args: {
	signRequestDetail: Record<string, unknown>;
	signResult: Record<string, unknown>;
}): Promise<SdkResult<string>> {
	const delivery = getEip712Delivery(args.signRequestDetail);
	if (!delivery || delivery.kind !== 'uniswapx_limit_order') {
		return {ok: false, reason: 'Sign request is not a UniswapX limit order delivery.'};
	}
	const quoteResponse = delivery.quoteResponse;
	if (quoteResponse == null || typeof quoteResponse !== 'object' || Array.isArray(quoteResponse)) {
		return {ok: false, reason: 'UniswapX delivery missing quoteResponse.'};
	}
	const apiKey =
		typeof delivery.uniswapApiKey === 'string' && delivery.uniswapApiKey.trim()
			? delivery.uniswapApiKey.trim()
			: typeof parseExtraJsonField(args.signRequestDetail)?.uniswapApiKey === 'string'
				? String(parseExtraJsonField(args.signRequestDetail)?.uniswapApiKey).trim()
				: '';
	if (!apiKey) {
		return {ok: false, reason: 'UniswapX delivery missing uniswapApiKey.'};
	}
	const signature = extractEip712SignatureParts(args.signResult);
	if (!signature) {
		return {ok: false, reason: 'Sign result missing r, s, v for UniswapX limit order delivery.'};
	}
	const signatureHex = signatureHexFromParts(signature);
	const submitBody = buildUniswapXLimitOrderSubmitBody({
		quoteResponse: quoteResponse as Record<string, unknown>,
		signatureHex,
	});
	const tradeApiBaseUrl =
		typeof delivery.tradeApiBaseUrl === 'string' && delivery.tradeApiBaseUrl.trim()
			? delivery.tradeApiBaseUrl.trim()
			: 'https://trade-api.gateway.uniswap.org/v1';
	try {
		const response = await submitUniswapXLimitOrder({
			submitBody,
			uniswapApiKey: apiKey,
			baseUrl: tradeApiBaseUrl,
		});
		const orderHash =
			typeof response.orderHash === 'string'
				? response.orderHash
				: typeof response.hash === 'string'
					? response.hash
					: JSON.stringify(response);
		return {ok: true, data: orderHash};
	} catch (error) {
		return {
			ok: false,
			reason: error instanceof Error ? error.message : String(error),
		};
	}
}
