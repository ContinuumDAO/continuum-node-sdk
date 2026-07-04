export type CmcKlineCandle = {
	time: number;
	open: number;
	high: number;
	low: number;
	close: number;
	volume?: number;
	traders?: number;
};

/** CMC k-line tuple: `[open, high, low, close, volume, timestamp, traders]`. */
export function normalizeKlineCandleTuple(raw: unknown): CmcKlineCandle | null {
	if (!Array.isArray(raw) || raw.length < 6) {
		return null;
	}
	const open = Number(raw[0]);
	const high = Number(raw[1]);
	const low = Number(raw[2]);
	const close = Number(raw[3]);
	const volumeRaw = raw[4];
	const timestampRaw = raw[5];
	const tradersRaw = raw[6];
	if (
		!Number.isFinite(open) ||
		!Number.isFinite(high) ||
		!Number.isFinite(low) ||
		!Number.isFinite(close)
	) {
		return null;
	}
	const timestamp = Number(timestampRaw);
	if (!Number.isFinite(timestamp)) {
		return null;
	}
	const time = timestamp > 1e12 ? Math.floor(timestamp / 1000) : Math.floor(timestamp);
	const volume = volumeRaw == null ? undefined : Number(volumeRaw);
	const traders = tradersRaw == null ? undefined : Number(tradersRaw);
	return {
		time,
		open,
		high,
		low,
		close,
		...(volume != null && Number.isFinite(volume) ? {volume} : {}),
		...(traders != null && Number.isFinite(traders) ? {traders} : {}),
	};
}

export function normalizeKlineCandles(raw: unknown): CmcKlineCandle[] {
	if (!Array.isArray(raw)) {
		return [];
	}
	const candles: CmcKlineCandle[] = [];
	for (const row of raw) {
		const candle = normalizeKlineCandleTuple(row);
		if (candle) {
			candles.push(candle);
		}
	}
	return candles;
}
