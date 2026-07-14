import type {TradeIdea} from './trade-idea.js';
import {formatHumanPrice, validateBuildTradePrices, type BuildTradeFromTradeIdeaInput} from './build-trade.js';

export type UniswapTpslTrigger = 'take_profit' | 'stop_loss';

export type UniswapTpslMonitorInput = {
	side: 'long' | 'short';
	lastPrice: number;
	takeProfitPrice?: number;
	stopLossPrice?: number;
};

export type UniswapTpslMonitorEvaluation = {
	triggered: boolean;
	trigger?: UniswapTpslTrigger;
	lastPriceHuman: string;
	takeProfitPriceHuman?: string;
	stopLossPriceHuman?: string;
};

export function parseHumanPrice(value: string | undefined): number | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;
	const n = Number.parseFloat(trimmed);
	return Number.isFinite(n) && n > 0 ? n : null;
}

export function evaluateUniswapTpslMonitor(input: UniswapTpslMonitorInput): UniswapTpslMonitorEvaluation {
	const {side, lastPrice, takeProfitPrice, stopLossPrice} = input;
	const base: UniswapTpslMonitorEvaluation = {
		triggered: false,
		lastPriceHuman: formatHumanPrice(lastPrice),
		...(takeProfitPrice != null ? {takeProfitPriceHuman: formatHumanPrice(takeProfitPrice)} : {}),
		...(stopLossPrice != null ? {stopLossPriceHuman: formatHumanPrice(stopLossPrice)} : {}),
	};
	if (side === 'long') {
		if (takeProfitPrice != null && lastPrice >= takeProfitPrice) {
			return {...base, triggered: true, trigger: 'take_profit'};
		}
		if (stopLossPrice != null && lastPrice <= stopLossPrice) {
			return {...base, triggered: true, trigger: 'stop_loss'};
		}
		return base;
	}
	if (takeProfitPrice != null && lastPrice <= takeProfitPrice) {
		return {...base, triggered: true, trigger: 'take_profit'};
	}
	if (stopLossPrice != null && lastPrice >= stopLossPrice) {
		return {...base, triggered: true, trigger: 'stop_loss'};
	}
	return base;
}

export function uniswapTpslPricesFromTradeIdea(
	idea: TradeIdea,
	input: BuildTradeFromTradeIdeaInput,
): {takeProfitPrice?: number; stopLossPrice?: number} | null {
	const validated = validateBuildTradePrices(idea, input);
	if (!validated.ok) {
		return null;
	}
	return {
		...(validated.data!.target != null ? {takeProfitPrice: validated.data!.target} : {}),
		...(validated.data!.invalidation != null ? {stopLossPrice: validated.data!.invalidation} : {}),
	};
}

export type UniswapTpslMonitorCronSpec = {
	name: string;
	tradeIdeaId: string;
	chainId: number;
	protocolId: 'uniswap';
	sizeUsdHuman: string;
	keyGenId: string;
	pollEveryMinutes: number;
	takeProfitPriceHuman?: string;
	stopLossPriceHuman?: string;
	side: 'long' | 'short';
};

export function buildUniswapTpslMonitorCronMessage(spec: UniswapTpslMonitorCronSpec): string {
	const yamlBlock = [
		'tradeTpslMonitor:',
		'```yaml',
		`protocolId: ${spec.protocolId}`,
		`chainId: ${spec.chainId}`,
		`tradeIdeaId: ${spec.tradeIdeaId}`,
		`sizeUsdHuman: "${spec.sizeUsdHuman}"`,
		`side: ${spec.side}`,
		`pollEveryMinutes: ${spec.pollEveryMinutes}`,
		...(spec.takeProfitPriceHuman ? [`takeProfitPriceHuman: "${spec.takeProfitPriceHuman}"`] : []),
		...(spec.stopLossPriceHuman ? [`stopLossPriceHuman: "${spec.stopLossPriceHuman}"`] : []),
		'```',
	].join('\n');

	return `[Cron] Uniswap TP/SL monitor for trade idea ${spec.tradeIdeaId}

Each run:
1. \`load_defi_protocol({ protocolId: "uniswap-v4" })\`
2. Fetch current price via \`ctm_uniswap_v4_fetch_ohlcv\` (last candle close) or a small \`ctm_uniswap_v4_quote\` probe on chainId ${spec.chainId}.
3. Compare price to TP/SL levels in the YAML block below using long/short rules (long: TP when price >= TP, SL when price <= SL; short inverted).
4. If triggered: \`build_trade_from_trade_idea\` with protocolId uniswap, orderKind market, reversed exit side, sizeUsdHuman ${spec.sizeUsdHuman}, keyGenId ${spec.keyGenId}, chainId ${spec.chainId}. Purpose must note TP/SL exit.
5. If not triggered: reply \`monitor_ok\` with last price and distances.
6. If entry never filled and monitor is obsolete: \`deactivate_cron_job\` for this job.

Best-effort agent monitor — not exchange-grade resting TP/SL. Disable when filled or cancelled.

${yamlBlock}`;
}

export function uniswapTpslMonitorSchedule(pollEveryMinutes: number): {kind: 'every'; everyMs: number} {
	const minutes = Math.max(1, Math.floor(pollEveryMinutes));
	return {kind: 'every', everyMs: minutes * 60_000};
}

export function uniswapTpslMonitorCronName(tradeIdeaId: string): string {
	const slug = tradeIdeaId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 24);
	return `uniswap-tpsl-${slug || 'monitor'}`;
}
