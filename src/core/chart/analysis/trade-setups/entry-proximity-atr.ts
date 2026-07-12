import {averageTrueRangeSeries} from '../../../chart-patterns/atr.js';
import type {NormalizedBar} from '../../../chart-patterns/types.js';
import {coerceFiniteNumber} from '../../point-normalize.js';
import {DEFAULT_ENTRY_PROXIMITY_ATR_PERIOD} from './trade-desk-defaults.js';

/** Latest finite ATR from OHLCV rows (Wilder-style SMA of TR). */
export function entryProximityAtrFromOhlcvRows(
	bars: Record<string, unknown>[] | undefined,
	period = DEFAULT_ENTRY_PROXIMITY_ATR_PERIOD,
): number | null {
	if (!bars?.length || period < 1) {
		return null;
	}
	const normalized: NormalizedBar[] = [];
	for (let i = 0; i < bars.length; i++) {
		const close = coerceFiniteNumber(bars[i]!.close);
		const high = coerceFiniteNumber(bars[i]!.high);
		const low = coerceFiniteNumber(bars[i]!.low);
		const time = coerceFiniteNumber(bars[i]!.time);
		if (close == null || high == null || low == null || time == null) {
			continue;
		}
		normalized.push({index: i, time, timeSec: time, open: close, high, low, close});
	}
	if (!normalized.length) {
		return null;
	}
	const series = averageTrueRangeSeries(normalized, period);
	for (let i = series.length - 1; i >= 0; i--) {
		const v = series[i];
		if (v != null && Number.isFinite(v) && v > 0) {
			return v;
		}
	}
	return null;
}
