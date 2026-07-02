import {coerceFiniteNumber, parseChartTime} from './point-normalize.js';

export type PriceVolumeSeriesPoint = [number, number];

export type BuiltOhlcvBar = {
	time: number;
	open: number;
	high: number;
	low: number;
	close: number;
	volume?: number;
};

export type BuildOhlcvBarsFromPriceVolumeOptions = {
	/** Bucket width in seconds (e.g. 4 * 3600 for 4h). Omit to keep input resolution. */
	bucketSec?: number;
	/** Keep newest N bars after bucketing. */
	maxPoints?: number;
};

function parseSeriesPoint(raw: unknown): {timeSec: number; value: number} | null {
	if (Array.isArray(raw) && raw.length >= 2) {
		const timeSec = parseChartTime(raw[0]);
		const value = coerceFiniteNumber(raw[1]);
		if (timeSec == null || typeof timeSec !== 'number' || value == null) {
			return null;
		}
		return {timeSec, value};
	}
	if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
		const row = raw as Record<string, unknown>;
		const timeSec = parseChartTime(row.timeMs ?? row.time ?? row.t ?? row.timestampMs);
		const value = coerceFiniteNumber(row.value ?? row.close ?? row.c ?? row.price);
		if (timeSec == null || typeof timeSec !== 'number' || value == null) {
			return null;
		}
		return {timeSec, value};
	}
	return null;
}

function volumeMapKey(timeSec: number): number {
	return timeSec;
}

/**
 * Build OHLCV bars from spot price + volume time series (any indexer with close + volume).
 * Typical input: CoinGecko `marketChart.prices` + `marketChart.total_volumes`.
 */
export function buildOhlcvBarsFromPriceVolumeSeries(
	prices: unknown[],
	volumes: unknown[] | undefined,
	options: BuildOhlcvBarsFromPriceVolumeOptions = {},
): BuiltOhlcvBar[] {
	const volByTime = new Map<number, number>();
	for (const raw of volumes ?? []) {
		const point = parseSeriesPoint(raw);
		if (!point) {
			continue;
		}
		volByTime.set(volumeMapKey(point.timeSec), point.value);
	}

	const hourly: BuiltOhlcvBar[] = [];
	for (let i = 0; i < prices.length; i++) {
		const point = parseSeriesPoint(prices[i]);
		if (!point) {
			continue;
		}
		const close = point.value;
		const prevClose = i > 0 ? parseSeriesPoint(prices[i - 1])?.value ?? close : close;
		hourly.push({
			time: point.timeSec,
			open: prevClose,
			high: Math.max(prevClose, close),
			low: Math.min(prevClose, close),
			close,
			volume: volByTime.get(volumeMapKey(point.timeSec)) ?? 0,
		});
	}

	let bars = hourly;
	if (options.bucketSec != null && options.bucketSec > 0) {
		const buckets = new Map<number, BuiltOhlcvBar>();
		for (const bar of hourly) {
			const bucket = Math.floor(bar.time / options.bucketSec) * options.bucketSec;
			const existing = buckets.get(bucket);
			if (!existing) {
				buckets.set(bucket, {...bar, time: bucket});
				continue;
			}
			existing.high = Math.max(existing.high, bar.high);
			existing.low = Math.min(existing.low, bar.low);
			existing.close = bar.close;
			existing.volume = (existing.volume ?? 0) + (bar.volume ?? 0);
		}
		bars = [...buckets.values()].sort((a, b) => a.time - b.time);
	}

	const maxPoints = options.maxPoints;
	if (maxPoints != null && maxPoints > 0 && bars.length > maxPoints) {
		bars = bars.slice(-maxPoints);
	}

	return bars;
}
