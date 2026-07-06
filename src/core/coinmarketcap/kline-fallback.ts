import type {CmcKlineCandle} from './kline.js';
import type {KlineQueryWindow} from './kline-window.js';

export type KlineChartFallback = {
	action: 'switch_ohlcv_source';
	doNotRetry: string[];
	nextSteps: string[];
};

export function isKlineDataTooStaleForWindow(
	candles: CmcKlineCandle[],
	window: KlineQueryWindow,
	nowSec = Math.floor(Date.now() / 1000),
): boolean {
	if (!candles.length) {
		return true;
	}
	const latest = candles[candles.length - 1]!.time;
	const maxAgeSec =
		window.lookbackDays != null
			? window.lookbackDays * 86_400 + 86_400
			: 2 * 86_400;
	return nowSec - latest > maxAgeSec;
}

export function buildKlineChartFallback(
	candles: CmcKlineCandle[],
	window: KlineQueryWindow,
): KlineChartFallback {
	const latest = candles[candles.length - 1]?.time;
	const latestIso = latest ? new Date(latest * 1000).toISOString() : 'none';
	const windowLabel =
		window.lookbackDays != null
			? `last ${window.lookbackDays}d`
			: `~${window.limit} bars`;

	return {
		action: 'switch_ohlcv_source',
		doNotRetry: [
			'coinmarketcap-public__get_kline_candles',
			'coinmarketcap-public__search_dex_tokens',
			'coinmarketcap-public__get_dex_token_pools',
		],
		nextSteps: [
			`CMC DEX k-lines are too stale for "${windowLabel}" (latest bar: ${latestIso}). Keyless k-lines often lag; do not retry CMC DEX fetches.`,
			'Ask the operator which OHLCV source to use next (CoinGecko, CMC Pro historical, Hyperliquid/GMX DeFi, etc.). Do not auto-load catalog MCP servers.',
			'After the operator chooses: agent_load_mcp_server → fetch OHLCV → pass full fetch JSON as toolResult to prepare_chart_from_rows or analyze_*.',
			'See skill chart-ohlcv-sources — stop after this message; do not burn tool rounds on CMC DEX.',
		],
	};
}

export function buildKlineFallbackReason(fallback: KlineChartFallback): string {
	return fallback.nextSteps.join('\n');
}
