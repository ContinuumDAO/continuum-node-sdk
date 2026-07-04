import type {ChartLiveTick} from './schemas.js';
import {coerceFiniteNumber, parseChartTimeFromRow} from '../point-normalize.js';

export type MergeLiveTickOptions = {
	bucketSec: number;
	maxPoints?: number;
};

function barTimeSec(row: Record<string, unknown>): number | null {
	const time = parseChartTimeFromRow(row);
	if (time == null) {
		return null;
	}
	if (typeof time === 'number') {
		return time;
	}
	return Math.floor(Date.UTC(time.year, time.month - 1, time.day) / 1000);
}


function bucketStartSec(timeSec: number, bucketSec: number): number {
	return Math.floor(timeSec / bucketSec) * bucketSec;
}

function cloneBar(row: Record<string, unknown>): Record<string, unknown> {
	return {...row};
}

/** Infer bar period from the most recent spacing in the series (preferred over binding bucketSec). */
export function inferBarPeriodSec(bars: Record<string, unknown>[]): number | null {
	if (bars.length < 2) {
		return null;
	}
	const prev = barTimeSec(bars[bars.length - 2]!);
	const last = barTimeSec(bars[bars.length - 1]!);
	if (prev == null || last == null || last <= prev) {
		return null;
	}
	return last - prev;
}

/**
 * Merge a normalized live tick into OHLCV bar rows (same shape as normalizeCandleRow output).
 * Updates the forming bar in the current period, or appends exactly one bar on single-period rollover.
 * Does not synthesize bars across multi-period gaps — missing OHLCV must be fetched separately.
 */
export function mergeLiveTickIntoBars(
	bars: Record<string, unknown>[],
	tick: ChartLiveTick,
	options: MergeLiveTickOptions,
): {bars: Record<string, unknown>[]; barRolledOver: boolean} {
	if (bars.length === 0) {
		const timeSec = bucketStartSec(Math.floor(tick.timeMs / 1000), options.bucketSec);
		const row: Record<string, unknown> = {
			time: timeSec,
			open: tick.price,
			high: tick.price,
			low: tick.price,
			close: tick.price,
		};
		if (tick.volume != null) {
			row.volume = tick.volume;
		}
		return {bars: [row], barRolledOver: true};
	}

	const tickSec = Math.floor(tick.timeMs / 1000);
	const out = bars.map(cloneBar);
	let last = out[out.length - 1]!;
	const lastSec = barTimeSec(last);
	if (lastSec == null) {
		return {bars: out, barRolledOver: false};
	}

	const barPeriod = inferBarPeriodSec(out) ?? options.bucketSec;
	let barRolledOver = false;

	if (tickSec < lastSec) {
		return {bars: trimBars(out, options.maxPoints), barRolledOver: false};
	}

	// More than one missing bar — fetch OHLCV; never bridge with mid-prices.
	if (tickSec >= lastSec + barPeriod * 2) {
		return {bars: trimBars(out, options.maxPoints), barRolledOver: false};
	}

	if (tickSec >= lastSec + barPeriod) {
		const prevClose = coerceFiniteNumber(last.close);
		if (prevClose == null) {
			return {bars: trimBars(out, options.maxPoints), barRolledOver: false};
		}
		const newBarTime = lastSec + barPeriod;
		const newBar: Record<string, unknown> = {
			time: newBarTime,
			open: prevClose,
			high: Math.max(prevClose, tick.price),
			low: Math.min(prevClose, tick.price),
			close: tick.price,
		};
		if (tick.volume != null) {
			newBar.volume = tick.volume;
		}
		out.push(newBar);
		last = newBar;
		barRolledOver = true;
	}

	const high = coerceFiniteNumber(last.high) ?? tick.price;
	const low = coerceFiniteNumber(last.low) ?? tick.price;
	last.high = Math.max(high, tick.price);
	last.low = Math.min(low, tick.price);
	last.close = tick.price;
	if (tick.volume != null) {
		const prevVol = coerceFiniteNumber(last.volume) ?? 0;
		last.volume = prevVol + tick.volume;
	}

	return {bars: trimBars(out, options.maxPoints), barRolledOver};
}

function trimBars(
	bars: Record<string, unknown>[],
	maxPoints?: number,
): Record<string, unknown>[] {
	if (maxPoints == null || maxPoints <= 0 || bars.length <= maxPoints) {
		return bars;
	}
	return bars.slice(bars.length - maxPoints);
}

/** Extract normalized bar rows from a chart's primary candlestick series. */
export function candlestickBarsFromChart(
	series: Array<{type: string; data: Record<string, unknown>[]}>,
): Record<string, unknown>[] {
	const candle = series.find(s => s.type === 'candlestick');
	if (!candle) {
		return [];
	}
	return candle.data.map(row => ({...row}));
}
