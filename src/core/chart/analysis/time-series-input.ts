/** Vendor-agnostic time-series point extraction ({ time, value } line data). */

import {parseJsonIfString} from '../fetch-result.js';
import {coerceFiniteNumber, normalizeLineRow, parseChartTime} from '../point-normalize.js';
import type {ChartTime} from '../schemas.js';

export type TimeSeriesPoint = {timeSec: number; value: number};

const NESTED_SERIES_KEYS = [
	'series',
	'points',
	'values',
	'data',
	'result',
	'rows',
	'list',
] as const;

const MAX_WRAPPER_DEPTH = 6;

function chartTimeToSec(time: ChartTime): number | null {
	if (typeof time === 'number' && Number.isFinite(time)) {
		return Math.floor(time);
	}
	if (typeof time === 'object' && time != null && 'year' in time) {
		return Math.floor(Date.UTC(time.year, time.month - 1, time.day) / 1000);
	}
	return null;
}

function lineTupleToRow(raw: unknown): Record<string, unknown> | null {
	if (!Array.isArray(raw) || raw.length < 2) {
		return null;
	}
	return {time: raw[0], value: raw[1]};
}

/** True when a row normalizes to a line point (not OHLC). */
export function looksLikeLinePoint(row: unknown): boolean {
	if (lineTupleToRow(row)) {
		const tuple = row as unknown[];
		return coerceFiniteNumber(tuple[1]) != null;
	}
	if (!row || typeof row !== 'object' || Array.isArray(row)) {
		return false;
	}
	const record = row as Record<string, unknown>;
	if (
		coerceFiniteNumber(record.open) != null &&
		coerceFiniteNumber(record.high) != null &&
		coerceFiniteNumber(record.low) != null
	) {
		return false;
	}
	const mapped =
		record.value == null && record.close != null ? {...record, value: record.close} : record;
	return normalizeLineRow(mapped) != null;
}

function pointArrayFromParsed(parsed: unknown): unknown[] | null {
	if (!Array.isArray(parsed) || parsed.length === 0) {
		return null;
	}
	if (looksLikeLinePoint(parsed[0])) {
		return parsed;
	}
	return null;
}

function normalizePointRow(raw: unknown): TimeSeriesPoint | null {
	const row = Array.isArray(raw) ? lineTupleToRow(raw) : raw;
	if (!row || typeof row !== 'object' || Array.isArray(row)) {
		return null;
	}
	const record = row as Record<string, unknown>;
	const mapped =
		record.value == null && record.close != null ? {...record, value: record.close} : record;
	const normalized = normalizeLineRow(mapped);
	if (!normalized) {
		return null;
	}
	const timeSec = chartTimeToSec(normalized.time);
	if (timeSec == null) {
		return null;
	}
	return {timeSec, value: normalized.value};
}

function extractRawTimeSeriesRows(payload: unknown, depth = 0): unknown[] | null {
	const parsed = parseJsonIfString(payload);
	const direct = pointArrayFromParsed(parsed);
	if (direct?.length) {
		return direct;
	}
	if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
		return extractTimeSeriesFromRecord(parsed as Record<string, unknown>, depth);
	}
	return null;
}

function extractTimeSeriesFromRecord(
	record: Record<string, unknown>,
	depth: number,
): unknown[] | null {
	if (depth > MAX_WRAPPER_DEPTH) {
		return null;
	}
	for (const key of NESTED_SERIES_KEYS) {
		if (!(key in record)) {
			continue;
		}
		const nested = extractRawTimeSeriesRows(record[key], depth + 1);
		if (nested?.length) {
			return nested;
		}
	}
	for (const value of Object.values(record)) {
		if (Array.isArray(value)) {
			const direct = pointArrayFromParsed(value);
			if (direct?.length) {
				return direct;
			}
			continue;
		}
		if (value && typeof value === 'object') {
			const nested = extractTimeSeriesFromRecord(value as Record<string, unknown>, depth + 1);
			if (nested?.length) {
				return nested;
			}
		}
	}
	return null;
}

/**
 * Pull `{ time, value }` points from a metric/line fetch payload.
 * Returns `null` when the payload looks like OHLCV candles instead.
 */
export function extractTimeSeriesFromUnknown(
	payload: unknown,
	depth = 0,
): TimeSeriesPoint[] | null {
	const rawRows = extractRawTimeSeriesRows(payload, depth);
	if (!rawRows?.length) {
		return null;
	}
	if (rawRows.some(row => {
		if (!row || typeof row !== 'object' || Array.isArray(row)) {
			return false;
		}
		const r = row as Record<string, unknown>;
		return (
			coerceFiniteNumber(r.open) != null &&
			coerceFiniteNumber(r.high) != null &&
			coerceFiniteNumber(r.low) != null
		);
	})) {
		return null;
	}
	const points: TimeSeriesPoint[] = [];
	for (const row of rawRows) {
		const point = normalizePointRow(row);
		if (point) {
			points.push(point);
		}
	}
	return points.length > 0 ? points : null;
}

/** Parse chart time from arbitrary row for sorting (fallback). */
export function timeSeriesPointTimeSec(raw: Record<string, unknown>): number | null {
	const mapped =
		raw.value == null && raw.close != null ? {...raw, value: raw.close} : raw;
	const time = parseChartTime(
		mapped.time ?? mapped.t ?? mapped.timestampMs ?? mapped.timestamp ?? mapped.timeSec,
	);
	if (time == null) {
		return null;
	}
	if (typeof time === 'number') {
		return Math.floor(time);
	}
	return chartTimeToSec(time);
}
