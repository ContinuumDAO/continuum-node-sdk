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
			'Load CoinGecko MCP (catalog) if available → coingecko__execute marketChart for ethereum, days=7, interval=hourly → continuum__prepare_chart_from_rows.',
			'If CMC Pro credits work: coinmarketcap-public__get_crypto_ohlcv_historical id=1027 timePeriod=hourly (CEX ETH, not Uniswap pool).',
			'See continuum skill chart-ohlcv-sources — stop after this message; do not burn tool rounds on CMC DEX.',
		],
	};
}

export function buildKlineFallbackReason(fallback: KlineChartFallback): string {
	return fallback.nextSteps.join('\n');
}
