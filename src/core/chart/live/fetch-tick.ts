import type {ChartLiveBinding, ChartLiveTick} from './schemas.js';
import {
	CHART_LIVE_PROVIDER_COINGECKO_SIMPLE,
	CHART_LIVE_PROVIDER_GMX_MARK_PRICE,
	CHART_LIVE_PROVIDER_HYPERLIQUID_ALL_MIDS,
	CHART_LIVE_PROVIDER_LIGHTER_MARKET_SNAPSHOT,
} from './schemas.js';
import {lighterFetchMarketSnapshot} from '@continuumdao/ctm-mpc-defi/protocols/evm/lighter';
import type {LighterApiProfile, LighterOhlcvInterval} from '@continuumdao/ctm-mpc-defi/protocols/evm/lighter';

const HYPERLIQUID_INFO_URL = 'https://api.hyperliquid.xyz/info';
const COINGECKO_SIMPLE_PRICE_URL = 'https://api.coingecko.com/api/v3/simple/price';
const LIVE_TICK_FETCH_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), LIVE_TICK_FETCH_TIMEOUT_MS);
	try {
		return await fetch(url, {...init, signal: controller.signal});
	} finally {
		clearTimeout(timer);
	}
}

async function fetchHyperliquidAllMidsTick(binding: ChartLiveBinding): Promise<ChartLiveTick | null> {
	const coin = String(binding.params.coin ?? '').trim();
	if (!coin) {
		return null;
	}
	const body: Record<string, unknown> = {type: 'allMids'};
	const dex = binding.params.dex;
	if (typeof dex === 'string' && dex.trim()) {
		body.dex = dex.trim();
	}
	const resp = await fetchWithTimeout(HYPERLIQUID_INFO_URL, {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify(body),
	});
	if (!resp.ok) {
		return null;
	}
	const mids = (await resp.json()) as Record<string, string>;
	const price = Number(mids[coin]);
	if (!Number.isFinite(price)) {
		return null;
	}
	return {timeMs: Date.now(), price};
}

async function fetchCoingeckoSimpleTick(binding: ChartLiveBinding): Promise<ChartLiveTick | null> {
	const coinId = String(binding.params.coinId ?? '').trim();
	if (!coinId) {
		return null;
	}
	const vs = String(binding.params.vsCurrency ?? 'usd').trim() || 'usd';
	const url =
		`${COINGECKO_SIMPLE_PRICE_URL}?ids=${encodeURIComponent(coinId)}` +
		`&vs_currencies=${encodeURIComponent(vs)}`;
	const resp = await fetchWithTimeout(url, {});
	if (!resp.ok) {
		return null;
	}
	const data = (await resp.json()) as Record<string, Record<string, number>>;
	const price = data[coinId]?.[vs];
	if (typeof price !== 'number' || !Number.isFinite(price)) {
		return null;
	}
	return {timeMs: Date.now(), price};
}

async function fetchLighterMarketSnapshotTick(binding: ChartLiveBinding): Promise<ChartLiveTick | null> {
	const symbol = String(binding.params.symbol ?? '').trim();
	if (!symbol) {
		return null;
	}
	const chainIdRaw = binding.params.chainId;
	const chainId =
		typeof chainIdRaw === 'number' && Number.isFinite(chainIdRaw) && chainIdRaw > 0
			? chainIdRaw
			: 42161;
	const marketIdRaw = binding.params.marketId;
	const marketId =
		typeof marketIdRaw === 'number' && Number.isFinite(marketIdRaw) && marketIdRaw > 0
			? marketIdRaw
			: undefined;
	const intervalRaw = binding.params.interval;
	const interval =
		typeof intervalRaw === 'string' && intervalRaw.trim()
			? (intervalRaw.trim() as LighterOhlcvInterval)
			: undefined;
	const profileRaw = binding.params.profile;
	const profile =
		typeof profileRaw === 'string' && profileRaw.trim()
			? (profileRaw.trim() as LighterApiProfile)
			: undefined;
	try {
		const snapshot = await lighterFetchMarketSnapshot({
			chainId,
			symbol,
			...(marketId != null ? {marketId} : {}),
			...(interval ? {interval} : {}),
			...(profile ? {profile} : {}),
			limit: 2,
		});
		const price = Number(snapshot.midUsd ?? snapshot.latestCandle?.close);
		if (!Number.isFinite(price)) {
			return null;
		}
		return {timeMs: snapshot.fetchedAtMs || Date.now(), price};
	} catch {
		return null;
	}
}

/** Fetch one live price tick for a chart live binding (same adapters as chart UI polling). */
export async function fetchChartLiveTick(binding: ChartLiveBinding): Promise<ChartLiveTick | null> {
	switch (binding.providerId) {
		case CHART_LIVE_PROVIDER_HYPERLIQUID_ALL_MIDS:
			return fetchHyperliquidAllMidsTick(binding);
		case CHART_LIVE_PROVIDER_LIGHTER_MARKET_SNAPSHOT:
			return fetchLighterMarketSnapshotTick(binding);
		case CHART_LIVE_PROVIDER_COINGECKO_SIMPLE:
			return fetchCoingeckoSimpleTick(binding);
		case CHART_LIVE_PROVIDER_GMX_MARK_PRICE:
			// GMX mark price needs chainId + SDK — pass `liveTick` from chart or re-fetch OHLCV via defi MCP.
			return null;
		default:
			return null;
	}
}
