import {coerceFiniteNumber, normalizeCandleRow} from './point-normalize.js';

export type ChartOhlcvSummary = {
	barCount: number;
	timeStartSec: number;
	timeEndSec: number;
	low: number;
	high: number;
	lastClose: number;
};

export function summarizeOhlcvBars(bars: Record<string, unknown>[]): ChartOhlcvSummary | null {
	let timeStartSec: number | null = null;
	let timeEndSec: number | null = null;
	let low: number | null = null;
	let high: number | null = null;
	let lastClose: number | null = null;

	for (const raw of bars) {
		const candle = normalizeCandleRow(raw);
		if (!candle) {
			continue;
		}
		const timeSec = typeof candle.time === 'number' ? candle.time : null;
		if (timeSec == null) {
			continue;
		}
		timeStartSec = timeStartSec == null ? timeSec : Math.min(timeStartSec, timeSec);
		timeEndSec = timeEndSec == null ? timeSec : Math.max(timeEndSec, timeSec);
		low = low == null ? candle.low : Math.min(low, candle.low);
		high = high == null ? candle.high : Math.max(high, candle.high);
		lastClose = candle.close;
	}

	if (timeStartSec == null || timeEndSec == null || low == null || high == null || lastClose == null) {
		return null;
	}

	return {
		barCount: bars.length,
		timeStartSec,
		timeEndSec,
		low,
		high,
		lastClose,
	};
}

export function formatChartOhlcvSummary(summary: ChartOhlcvSummary): string {
	return (
		`Chart data: ${summary.barCount} bars, ` +
		`time ${summary.timeStartSec}–${summary.timeEndSec}, ` +
		`low ${summary.low.toFixed(2)}, high ${summary.high.toFixed(2)}, last ${summary.lastClose.toFixed(2)}`
	);
}
