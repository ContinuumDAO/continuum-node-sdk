import type {OhlcvAnalysisMeta} from '../analysis-meta.js';
import {resolveOhlcvFetchContext} from '../../ohlcv-window-expectations.js';

/** Short code for the OHLCV / time-series source used to generate the trade idea. */
export type TradeChartDataPurposeContext = {
	dataSource: string;
	interval?: string;
	barCount?: number;
};

const DATA_SOURCE_MAX_LEN = 8;
const INTERVAL_MAX_LEN = 8;

function sanitizeDataSourceCode(code: string): string {
	const cleaned = code.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
	return cleaned.slice(0, DATA_SOURCE_MAX_LEN) || 'ts';
}

function sanitizeIntervalLabel(interval: string): string {
	const cleaned = interval.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
	return cleaned.slice(0, INTERVAL_MAX_LEN);
}

export function chartDataSourceShortCodeFromFetchToolName(toolName?: string): string | undefined {
	const raw = toolName?.trim().toLowerCase() ?? '';
	if (!raw) {
		return undefined;
	}
	const base = raw.includes('__') ? raw.slice(raw.lastIndexOf('__') + 2) : raw;
	if (raw.includes('hyperliquid') && base.includes('fetch_ohlcv')) {
		return 'hl';
	}
	if (raw.includes('gmx') && base.includes('fetch_ohlcv')) {
		return 'gmx';
	}
	if (raw.includes('uniswap') && base.includes('fetch_ohlcv')) {
		return 'uni';
	}
	if (raw.includes('coinmarketcap') || base.includes('get_kline') || base.includes('get_crypto_ohlcv')) {
		return 'cmc';
	}
	if (raw.includes('coingecko') || base === 'execute') {
		return 'cg';
	}
	return undefined;
}

function ohlcvRecordFromPayload(payload: unknown): Record<string, unknown> | null {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return null;
	}
	const record = payload as Record<string, unknown>;
	if (record.ohlcv && typeof record.ohlcv === 'object' && !Array.isArray(record.ohlcv)) {
		return record.ohlcv as Record<string, unknown>;
	}
	if (
		'candles' in record ||
		'interval' in record ||
		'timeframe' in record ||
		'coin' in record ||
		'symbol' in record
	) {
		return record;
	}
	return null;
}

export function chartDataSourceShortCodeFromFetchPayload(payload: unknown): string | undefined {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return undefined;
	}
	const record = payload as Record<string, unknown>;
	const explicit = record.dataSource;
	if (typeof explicit === 'string' && explicit.trim()) {
		switch (explicit.trim().toLowerCase()) {
			case 'protocol_ohlcv':
				if (ohlcvRecordFromPayload(payload)?.coin != null) {
					return 'hl';
				}
				return 'proto';
			case 'coingecko_time_series':
				return 'cg';
			case 'coinmarketcap_klines':
				return 'cmc';
			default:
				return sanitizeDataSourceCode(explicit);
		}
	}
	const ohlcv = ohlcvRecordFromPayload(payload);
	if (ohlcv?.coin != null) {
		return 'hl';
	}
	if (typeof record.symbol === 'string' && 'candles' in record) {
		return 'gmx';
	}
	if (Array.isArray(record.series) || Array.isArray(record.points)) {
		return 'ts';
	}
	return undefined;
}

export function chartDataSourceShortCodeFromProtocolId(protocolId?: string): string | undefined {
	const proto = protocolId?.trim().toLowerCase();
	if (!proto) {
		return undefined;
	}
	switch (proto) {
		case 'hyperliquid':
		case 'hl':
			return 'hl';
		case 'gmx':
			return 'gmx';
		case 'uniswap':
		case 'uniswap-v4':
		case 'uni':
			return 'uni';
		default:
			return undefined;
	}
}

function barCountFromFetchPayload(payload: unknown): number | undefined {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return undefined;
	}
	const record = payload as Record<string, unknown>;
	for (const key of ['candleCount', 'barCount', 'count'] as const) {
		const raw = record[key];
		if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
			return Math.floor(raw);
		}
	}
	const ohlcv = ohlcvRecordFromPayload(payload);
	if (ohlcv) {
		for (const key of ['candleCount', 'barCount', 'count'] as const) {
			const raw = ohlcv[key];
			if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
				return Math.floor(raw);
			}
		}
		const candles = ohlcv.candles;
		if (Array.isArray(candles) && candles.length > 0) {
			return candles.length;
		}
	}
	const candles = record.candles;
	if (Array.isArray(candles) && candles.length > 0) {
		return candles.length;
	}
	return undefined;
}

function intervalFromMetaAndPayload(
	analysisMeta?: Pick<OhlcvAnalysisMeta, 'barCount' | 'fetchContext'>,
	fetchPayload?: unknown,
): string | undefined {
	const fromMeta = analysisMeta?.fetchContext?.interval;
	if (typeof fromMeta === 'string' && fromMeta.trim()) {
		return sanitizeIntervalLabel(fromMeta);
	}
	const ohlcv = fetchPayload != null ? ohlcvRecordFromPayload(fetchPayload) : null;
	const raw = ohlcv?.interval ?? ohlcv?.timeframe;
	if (typeof raw === 'string' && raw.trim()) {
		return sanitizeIntervalLabel(raw);
	}
	if (fetchPayload && typeof fetchPayload === 'object' && !Array.isArray(fetchPayload)) {
		const record = fetchPayload as Record<string, unknown>;
		const top = record.interval ?? record.timeframe;
		if (typeof top === 'string' && top.trim()) {
			return sanitizeIntervalLabel(top);
		}
	}
	return undefined;
}

export function extractChartDataPurposeContext(input: {
	analysisMeta?: Pick<OhlcvAnalysisMeta, 'barCount' | 'fetchContext'>;
	fetchPayload?: unknown;
	fetchToolName?: string;
	loadedProtocolId?: string;
}): TradeChartDataPurposeContext | undefined {
	const dataSource =
		chartDataSourceShortCodeFromFetchToolName(input.fetchToolName) ??
		chartDataSourceShortCodeFromFetchPayload(input.fetchPayload) ??
		chartDataSourceShortCodeFromProtocolId(input.loadedProtocolId) ??
		(input.fetchPayload != null ? 'ts' : undefined);
	if (!dataSource) {
		return undefined;
	}
	const interval = intervalFromMetaAndPayload(input.analysisMeta, input.fetchPayload);
	const barCount =
		(typeof input.analysisMeta?.barCount === 'number' && input.analysisMeta.barCount > 0
			? Math.floor(input.analysisMeta.barCount)
			: undefined) ?? barCountFromFetchPayload(input.fetchPayload);
	const ctx: TradeChartDataPurposeContext = {dataSource: sanitizeDataSourceCode(dataSource)};
	if (interval) {
		ctx.interval = interval;
	}
	if (barCount != null && barCount > 0) {
		ctx.barCount = barCount;
	}
	return ctx;
}

/** ctm1 tokens: ds=hl iv=4h n=180 */
export function formatChartDataPurposeTokens(
	chartData?: TradeChartDataPurposeContext | null,
): string[] {
	if (!chartData?.dataSource) {
		return [];
	}
	const tokens = [`ds=${sanitizeDataSourceCode(chartData.dataSource)}`];
	if (chartData.interval) {
		tokens.push(`iv=${sanitizeIntervalLabel(chartData.interval)}`);
	}
	if (chartData.barCount != null && chartData.barCount > 0) {
		tokens.push(`n=${Math.floor(chartData.barCount)}`);
	}
	return tokens;
}

export function chartDataPurposeContextFromAnalysisMeta(
	meta: unknown,
	fetchPayload?: unknown,
	fetchToolName?: string,
	loadedProtocolId?: string,
): TradeChartDataPurposeContext | undefined {
	if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
		return extractChartDataPurposeContext({fetchPayload, fetchToolName, loadedProtocolId});
	}
	const record = meta as Record<string, unknown>;
	const barCount =
		typeof record.barCount === 'number' && record.barCount > 0 ? Math.floor(record.barCount) : undefined;
	const fetchContext =
		record.fetchContext && typeof record.fetchContext === 'object' && !Array.isArray(record.fetchContext)
			? resolveOhlcvFetchContext(fetchPayload ?? record)
			: resolveOhlcvFetchContext(fetchPayload ?? record);
	return extractChartDataPurposeContext({
		analysisMeta: {
			barCount: barCount ?? 0,
			fetchContext: fetchContext ?? undefined,
		},
		fetchPayload,
		fetchToolName,
		loadedProtocolId,
	});
}
