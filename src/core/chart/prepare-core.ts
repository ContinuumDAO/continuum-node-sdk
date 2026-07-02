import type {SdkResult} from '../result.js';
import {
	CHART_V1_KIND,
	DEFAULT_CHART_HEIGHT,
	DEFAULT_CHART_MAX_POINTS,
	type ChartSeriesType,
	type ChartTime,
	type PrepareChartInput,
	type PrepareChartOutput,
} from './schemas.js';
import {applyVolumeDirectionFromCandles} from './volume-direction.js';
import {buildPaneLayout} from './panes.js';
import {
	normalizeCandleRow,
	normalizeHistogramRow,
	normalizeLineRow,
	ohlcvTupleToRow,
} from './point-normalize.js';

export {parseChartTime, parseChartTimeFromRow, coerceFiniteNumber, ohlcvTupleToRow} from './point-normalize.js';

function timeSortKey(time: ChartTime): number {
	if (typeof time === 'number') {
		return time;
	}
	return time.year * 10_000 + time.month * 100 + time.day;
}

function timesEqual(a: ChartTime, b: ChartTime): boolean {
	if (typeof a === 'number' && typeof b === 'number') {
		return a === b;
	}
	if (typeof a === 'object' && typeof b === 'object') {
		return a.year === b.year && a.month === b.month && a.day === b.day;
	}
	return false;
}

function normalizeLinePoint(
	raw: Record<string, unknown>,
): {time: ChartTime; value: number} | null {
	return normalizeLineRow(raw);
}

function normalizeCandlePoint(
	raw: Record<string, unknown> | unknown[],
): {time: ChartTime; open: number; high: number; low: number; close: number} | null {
	const row =
		Array.isArray(raw) ? ohlcvTupleToRow(raw) : (raw as Record<string, unknown>);
	if (!row) {
		return null;
	}
	const candle = normalizeCandleRow(row);
	if (!candle) {
		return null;
	}
	const {time, open, high, low, close} = candle;
	return {time, open, high, low, close};
}

function normalizeHistogramPoint(
	raw: Record<string, unknown>,
): {time: ChartTime; value: number; color?: string} | null {
	return normalizeHistogramRow(raw);
}

function dedupeSortedByTime<T extends {time: ChartTime}>(rows: T[]): T[] {
	const out: T[] = [];
	for (const row of rows) {
		const last = out.at(-1);
		if (last && timesEqual(last.time, row.time)) {
			out[out.length - 1] = row;
			continue;
		}
		out.push(row);
	}
	return out;
}

function normalizeSeriesData(
	type: ChartSeriesType,
	rawRows: Array<Record<string, unknown> | unknown[]>,
	maxPoints: number,
): SdkResult<Record<string, unknown>[]> {
	const normalized: Record<string, unknown>[] = [];
	for (const raw of rawRows) {
		if (type === 'candlestick') {
			const candle = normalizeCandlePoint(raw);
			if (candle) {
				normalized.push(candle);
			}
			continue;
		}
		if (type === 'histogram') {
			const bar = normalizeHistogramPoint(
				Array.isArray(raw) ? (ohlcvTupleToRow(raw) ?? {}) : raw,
			);
			if (bar) {
				normalized.push(bar);
			}
			continue;
		}
		const line = normalizeLinePoint(Array.isArray(raw) ? {} : raw);
		if (line) {
			normalized.push(line);
		}
	}

	if (normalized.length === 0) {
		return {
			ok: false,
			reason: `Series type "${type}" has no valid data points (each point needs a valid time and numeric fields).`,
		};
	}

	normalized.sort(
		(a, b) =>
			timeSortKey(a.time as ChartTime) - timeSortKey(b.time as ChartTime),
	);
	const deduped = dedupeSortedByTime(normalized as {time: ChartTime}[]);
	const capped =
		deduped.length > maxPoints ? deduped.slice(deduped.length - maxPoints) : deduped;

	return {ok: true, data: capped};
}

/** Browser-safe prepareChart (no TA overlays). MCP/server uses prepare.ts which adds overlays. */
export function prepareChartCore(input: PrepareChartInput): SdkResult<PrepareChartOutput> {
	const maxPoints = input.options?.maxPoints ?? DEFAULT_CHART_MAX_POINTS;
	const seriesOut: PrepareChartOutput['chart']['series'] = [];

	for (const series of input.series) {
		const dataResult = normalizeSeriesData(series.type, series.data, maxPoints);
		if (!dataResult.ok) {
			return {
				ok: false,
				reason: `Series "${series.id}": ${dataResult.reason}`,
			};
		}
		seriesOut.push({
			id: series.id,
			type: series.type,
			label: series.label,
			data: dataResult.data,
			...(series.priceScaleId ? {priceScaleId: series.priceScaleId} : {}),
			...(series.paneId ? {paneId: series.paneId} : {}),
			...(series.overlay != null ? {overlay: series.overlay} : {}),
			...(series.style ? {style: series.style} : {}),
		});
	}

	const colorVolumeFromCandles = input.options?.colorVolumeFromCandles ?? true;
	const seriesWithVolumeDirection = applyVolumeDirectionFromCandles(
		seriesOut,
		colorVolumeFromCandles,
	);

	const chartPayload = buildPaneLayout({
		...(input.title?.trim() ? {title: input.title.trim()} : {}),
		height: input.height ?? DEFAULT_CHART_HEIGHT,
		series: seriesWithVolumeDirection,
	});

	return {
		ok: true,
		data: {
			kind: CHART_V1_KIND,
			chart: chartPayload,
		},
	};
}

export function isChartV1Payload(value: unknown): value is PrepareChartOutput {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const o = value as Record<string, unknown>;
	return o.kind === CHART_V1_KIND && typeof o.chart === 'object' && o.chart != null;
}
