import {coerceFiniteNumber, parseChartTimeFromRow} from './point-normalize.js';
import type {ChartTime} from './schemas.js';

export type DayHighLow = {
	dayHigh: number;
	dayLow: number;
	dayLabelUtc: string;
	barCount: number;
};

function timeToUtcSec(time: ChartTime): number | null {
	if (typeof time === 'number') {
		return time;
	}
	return Math.floor(Date.UTC(time.year, time.month - 1, time.day) / 1000);
}

function utcDayBoundsFromSec(sec: number): {startSec: number; endSec: number; label: string} {
	const d = new Date(sec * 1000);
	const y = d.getUTCFullYear();
	const m = d.getUTCMonth();
	const day = d.getUTCDate();
	const startSec = Math.floor(Date.UTC(y, m, day) / 1000);
	const endSec = startSec + 86_400;
	const label = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')} UTC`;
	return {startSec, endSec, label};
}

/** UTC calendar-day high/low for the day containing the latest candlestick bar. */
export function computeDayHighLowFromBars(
	bars: Record<string, unknown>[],
): DayHighLow | null {
	if (!bars.length) {
		return null;
	}

	let latestSec: number | null = null;
	for (const bar of bars) {
		const time = parseChartTimeFromRow(bar);
		if (time == null) {
			continue;
		}
		const sec = timeToUtcSec(time);
		if (sec != null && (latestSec == null || sec > latestSec)) {
			latestSec = sec;
		}
	}
	if (latestSec == null) {
		return null;
	}

	const {startSec, endSec, label} = utcDayBoundsFromSec(latestSec);
	let dayHigh = Number.NEGATIVE_INFINITY;
	let dayLow = Number.POSITIVE_INFINITY;
	let barCount = 0;

	for (const bar of bars) {
		const time = parseChartTimeFromRow(bar);
		if (time == null) {
			continue;
		}
		const sec = timeToUtcSec(time);
		if (sec == null || sec < startSec || sec >= endSec) {
			continue;
		}
		const high = coerceFiniteNumber(bar.high);
		const low = coerceFiniteNumber(bar.low);
		if (high == null || low == null) {
			continue;
		}
		dayHigh = Math.max(dayHigh, high);
		dayLow = Math.min(dayLow, low);
		barCount++;
	}

	if (barCount === 0 || !Number.isFinite(dayHigh) || !Number.isFinite(dayLow)) {
		return null;
	}
	return {dayHigh, dayLow, dayLabelUtc: label, barCount};
}

/** From a prepared chart's primary candlestick series rows. */
export function computeDayHighLowFromCandlestickSeries(
	series: Array<{type: string; data: Record<string, unknown>[]}>,
): DayHighLow | null {
	const candle = series.find(s => s.type === 'candlestick');
	if (!candle?.data.length) {
		return null;
	}
	return computeDayHighLowFromBars(candle.data);
}
