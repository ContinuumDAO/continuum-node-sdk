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
	const coinRaw = ohlcv.coin ?? ohlcv.symbol;
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

/** GMX fetch_ohlcv: `{ symbol, timeframe, candles }` at top level (not nested under ohlcv). */
function metadataFromFlatDefiOhlcvFetch(record: Record<string, unknown>): FetchChartMetadata {
	if (!('candles' in record)) {
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

/**
 * Read explicit chart metadata from a fetch tool payload.
 * Accepts `{ title, label, result }`, `{ result: { title, label, bars } }`,
 * Hyperliquid `{ ohlcv: { coin, interval, candles } }`, or GMX `{ symbol, timeframe, candles }`.
 */
export function extractChartMetadataFromFetchPayload(payload: unknown): FetchChartMetadata {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return {};
	}
	const record = payload as Record<string, unknown>;
	const direct = metadataFromRecord(record);
	if (direct.title || direct.label) {
		return direct;
	}
	const fromFlat = metadataFromFlatDefiOhlcvFetch(record);
	if (fromFlat.title || fromFlat.label) {
		return fromFlat;
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
	return {};
}
