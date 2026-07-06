import {z} from 'zod';
import {normalizeCandleRow} from './point-normalize.js';

export type ChartOhlcvSummary = {
	barCount: number;
	timeStartSec: number;
	timeEndSec: number;
	low: number;
	high: number;
	lastClose: number;
};

export const ChartOhlcvSummarySchema = z
	.object({
		barCount: z.number().int(),
		timeStartSec: z.number(),
		timeEndSec: z.number(),
		low: z.number(),
		high: z.number(),
		lastClose: z.number(),
	})
	.strict();

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

const GEOMETRY_MISMATCH_PROMPT =
	'Re-fetch OHLCV and pass the same full toolResult to prepare_chart_from_rows, analyze_*, and apply_chart_pattern_drawings.';

/** Warn when pattern geometry prices fall outside the loaded bar range (mixed fetches / stale rows). */
export function geometryPricesOutsideOhlcvSummary(
	summary: ChartOhlcvSummary,
	prices: number[],
	tolerance = 0.5,
): string[] {
	if (!prices.length) {
		return [];
	}
	const max = Math.max(...prices);
	const min = Math.min(...prices);
	const warnings: string[] = [];
	if (max > summary.high + tolerance) {
		warnings.push(
			`Referenced price ${max.toFixed(2)} is above loaded OHLCV high ${summary.high.toFixed(2)} — ` +
				`pattern geometry and bars are likely from different data. ${GEOMETRY_MISMATCH_PROMPT}`,
		);
	}
	if (min < summary.low - tolerance) {
		warnings.push(
			`Referenced price ${min.toFixed(2)} is below loaded OHLCV low ${summary.low.toFixed(2)} — ` +
				`pattern geometry and bars are likely from different data. ${GEOMETRY_MISMATCH_PROMPT}`,
		);
	}
	return warnings;
}

export function collectChartPatternHitPrices(
	hits: Array<{
		points?: Array<{price: number}>;
		levels?: Array<{price: number}>;
	}>,
): number[] {
	const prices: number[] = [];
	for (const hit of hits) {
		for (const point of hit.points ?? []) {
			prices.push(point.price);
		}
		for (const level of hit.levels ?? []) {
			prices.push(level.price);
		}
	}
	return prices;
}

export function collectChartPatternOverlayPrices(overlay: {
	points?: Array<{price: number}>;
	lines?: Array<{pointA: {price: number}; pointB: {price: number}}>;
	levels?: Array<{price: number; role?: string; label?: string}>;
	markers?: Array<{price: number}>;
	polylines?: Array<{points: Array<{price: number}>}>;
}): number[] {
	const prices: number[] = [];
	for (const point of overlay.points ?? []) {
		prices.push(point.price);
	}
	for (const line of overlay.lines ?? []) {
		prices.push(line.pointA.price, line.pointB.price);
	}
	for (const level of overlay.levels ?? []) {
		if (level.role === 'measured_move' || level.label?.toLowerCase().includes('target')) {
			continue;
		}
		prices.push(level.price);
	}
	for (const marker of overlay.markers ?? []) {
		prices.push(marker.price);
	}
	for (const poly of overlay.polylines ?? []) {
		for (const pt of poly.points) {
			prices.push(pt.price);
		}
	}
	return prices;
}
