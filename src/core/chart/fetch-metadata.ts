import {alpacaBarsEnvelopeFromRecord} from './alpaca-bars-envelope.js';
import {
	collectMarkdownOhlcvTextBlobs,
	metadataFromMarkdownOhlcvTable,
} from './markdown-ohlcv-table.js';

/** Title/label embedded by the fetch step (execute script), not inferred from user chat. */

export type FetchChartMetadata = {
	title?: string;
	label?: string;
};

function readMetaField(record: Record<string, unknown>, key: 'title' | 'label'): string | undefined {
	const raw = record[key];
	if (typeof raw !== 'string') {
		return undefined;
	}
	const trimmed = raw.trim();
	return trimmed || undefined;
}

function metadataFromRecord(record: Record<string, unknown>): FetchChartMetadata {
	const title = readMetaField(record, 'title');
	const label = readMetaField(record, 'label');
	if (!title && !label) {
		return {};
	}
	return {
		...(title ? {title} : {}),
		...(label ? {label} : {}),
	};
}

function metadataFromOhlcvWrapper(ohlcv: Record<string, unknown>): FetchChartMetadata {
	const coinRaw = ohlcv.coin ?? ohlcv.symbol ?? ohlcv.market;
	const coin = typeof coinRaw === 'string' ? coinRaw.trim() : '';
	const intervalRaw = ohlcv.interval ?? ohlcv.timeframe;
	const interval = typeof intervalRaw === 'string' ? intervalRaw.trim() : '';
	if (!coin) {
		return {};
	}
	const label = coin;
	const title = interval ? `${coin} ${interval.toUpperCase()}` : coin;
	return {title, label};
}

/** Coinbase Advanced Trade `{ dataSource: coinbase_candles, productId, interval, candles }`. */
function metadataFromCoinbaseCandlesFetch(record: Record<string, unknown>): FetchChartMetadata {
	const productRaw = record.productId ?? record.product_id;
	const productId = typeof productRaw === 'string' ? productRaw.trim() : '';
	if (!productId || !Array.isArray(record.candles)) {
		return {};
	}
	if (record.dataSource != null && record.dataSource !== 'coinbase_candles') {
		return {};
	}
	const label = productId.split('[')[0]?.trim() || productId;
	const intervalRaw = record.interval ?? record.granularity;
	const interval = typeof intervalRaw === 'string' ? intervalRaw.trim() : '';
	const title = interval ? `${label} ${interval.toUpperCase()}` : label;
	return {title, label};
}

/**
 * Flat OHLCV envelopes: GMX `{ symbol, timeframe, candles }` or
 * exchange klines `{ symbol, interval, klines }` (not nested under ohlcv).
 */
function metadataFromFlatDefiOhlcvFetch(record: Record<string, unknown>): FetchChartMetadata {
	const hasCandles = 'candles' in record;
	const hasKlines = 'klines' in record;
	if (!hasCandles && !hasKlines) {
		return {};
	}
	const symbolRaw = record.symbol;
	const symbol = typeof symbolRaw === 'string' ? symbolRaw.trim() : '';
	if (!symbol) {
		return {};
	}
	const label = symbol.split('[')[0]?.trim() || symbol;
	const intervalRaw = record.timeframe ?? record.interval;
	const interval = typeof intervalRaw === 'string' ? intervalRaw.trim() : '';
	const title = interval ? `${label} ${interval.toUpperCase()}` : label;
	return {title, label};
}

function firstDateFieldBar(
	rows: unknown[],
): {symbol?: string; hasOhlc: boolean} | null {
	const first = rows[0];
	if (!first || typeof first !== 'object' || Array.isArray(first)) {
		return null;
	}
	const row = first as Record<string, unknown>;
	if (row.date == null) {
		return null;
	}
	const hasOhlc = row.open != null && row.high != null && row.low != null && row.close != null;
	if (!hasOhlc) {
		return null;
	}
	const symbolRaw = row.symbol;
	const symbol = typeof symbolRaw === 'string' ? symbolRaw.trim() : undefined;
	return {hasOhlc: true, ...(symbol ? {symbol} : {})};
}

function titleFromSymbolAndInterval(symbol: string, interval?: string): FetchChartMetadata {
	const label = symbol;
	const title = interval ? `${symbol} ${interval.toUpperCase()}` : `${symbol} 1D`;
	return {title, label};
}

/**
 * `{ symbol, timeframe, bars: [{ t, o, h, l, c, v }] }` or `{ bars: { TICKER: […] } }`.
 */
function metadataFromAlpacaBarsFetch(record: Record<string, unknown>): FetchChartMetadata {
	const envelope = alpacaBarsEnvelopeFromRecord(record);
	if (!envelope) {
		return {};
	}
	return titleFromSymbolAndInterval(envelope.symbol, envelope.interval);
}

/**
 * Date-field historical envelopes: `{ symbol, historical: [{ date, open, … }] }`
 * or MCP `{ data: [{ symbol, date, open, … }] }` (EOD / intraday chart tools).
 */
function metadataFromDateFieldHistoricalFetch(record: Record<string, unknown>): FetchChartMetadata {
	const historical = record.historical;
	if (Array.isArray(historical) && historical.length > 0) {
		const first = firstDateFieldBar(historical);
		if (first?.hasOhlc) {
			const symbolRaw = record.symbol;
			const symbol =
				(typeof symbolRaw === 'string' ? symbolRaw.trim() : '') || first.symbol || '';
			if (symbol) {
				const intervalRaw = record.interval ?? record.timeframe;
				const interval = typeof intervalRaw === 'string' ? intervalRaw.trim() : '';
				return titleFromSymbolAndInterval(symbol, interval || undefined);
			}
		}
	}
	const data = record.data;
	if (Array.isArray(data) && data.length > 0) {
		const first = firstDateFieldBar(data);
		if (first?.hasOhlc) {
			const symbolRaw = record.symbol;
			const symbol =
				(typeof symbolRaw === 'string' ? symbolRaw.trim() : '') || first.symbol || '';
			if (symbol) {
				const intervalRaw = record.interval ?? record.timeframe;
				const interval = typeof intervalRaw === 'string' ? intervalRaw.trim() : '';
				return titleFromSymbolAndInterval(symbol, interval || undefined);
			}
		}
	}
	return {};
}

/**
 * Read explicit chart metadata from a fetch tool payload.
 * Accepts `{ title, label, result }`, `{ result: { title, label, bars } }`,
 * Hyperliquid `{ ohlcv: { coin, interval, candles } }`, GMX `{ symbol, timeframe, candles }`,
 * exchange `{ symbol, interval, klines }`, date-field historical
 * `{ symbol, historical: [{ date, open, … }] }` / `{ data: [{ symbol, date, open, … }] }`,
 * `{ symbol, timeframe, bars: [{ t, o, h, l, c }] }` / `{ bars: { TICKER: […] } }`,
 * or a markdown OHLCV table (plain string or MCP `{ content: [{ text }] }`).
 */
export function extractChartMetadataFromFetchPayload(payload: unknown): FetchChartMetadata {
	if (typeof payload === 'string') {
		return metadataFromMarkdownOhlcvTable(payload);
	}
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return {};
	}
	const record = payload as Record<string, unknown>;
	const direct = metadataFromRecord(record);
	if (direct.title || direct.label) {
		return direct;
	}
	const fromCoinbase = metadataFromCoinbaseCandlesFetch(record);
	if (fromCoinbase.title || fromCoinbase.label) {
		return fromCoinbase;
	}
	const fromFlat = metadataFromFlatDefiOhlcvFetch(record);
	if (fromFlat.title || fromFlat.label) {
		return fromFlat;
	}
	const fromDateField = metadataFromDateFieldHistoricalFetch(record);
	if (fromDateField.title || fromDateField.label) {
		return fromDateField;
	}
	const fromAlpaca = metadataFromAlpacaBarsFetch(record);
	if (fromAlpaca.title || fromAlpaca.label) {
		return fromAlpaca;
	}
	const ohlcv = record.ohlcv;
	if (ohlcv && typeof ohlcv === 'object' && !Array.isArray(ohlcv)) {
		const fromOhlcv = metadataFromOhlcvWrapper(ohlcv as Record<string, unknown>);
		if (fromOhlcv.title || fromOhlcv.label) {
			return fromOhlcv;
		}
	}
	const result = record.result;
	if (result && typeof result === 'object' && !Array.isArray(result)) {
		const fromResult = metadataFromRecord(result as Record<string, unknown>);
		if (fromResult.title || fromResult.label) {
			return fromResult;
		}
		const nestedOhlcv = (result as Record<string, unknown>).ohlcv;
		if (nestedOhlcv && typeof nestedOhlcv === 'object' && !Array.isArray(nestedOhlcv)) {
			return metadataFromOhlcvWrapper(nestedOhlcv as Record<string, unknown>);
		}
	}
	for (const blob of collectMarkdownOhlcvTextBlobs(record)) {
		const fromMarkdown = metadataFromMarkdownOhlcvTable(blob);
		if (fromMarkdown.title || fromMarkdown.label) {
			return fromMarkdown;
		}
	}
	return {};
}
