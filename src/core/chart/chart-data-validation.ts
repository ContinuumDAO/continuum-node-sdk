import {barTimeSecFromRow} from './live/bar-merge.js';
import {timeSeriesPointTimeSec} from './analysis/time-series-input.js';
import {parseLookbackSpanFromChartTitle} from './ohlcv-window-expectations.js';
import {parseChartTime} from './point-normalize.js';

/** OHLCV bar array keys seen across DeFi and market-data providers. */
export const OHLCV_COLLECTION_KEYS = ['candles', 'klines', 'bars', 'candlesticks'] as const;

/** Line / metric point array keys (time series analysis and some chart sources). */
export const TIME_SERIES_COLLECTION_KEYS = ['series', 'points', 'values', 'data', 'list'] as const;

export const CHART_DATA_COLLECTION_KEYS = [
	...OHLCV_COLLECTION_KEYS,
	...TIME_SERIES_COLLECTION_KEYS,
] as const;

export const FETCH_WINDOW_MS_KEYS = ['startTimeMs', 'endTimeMs', 'startMs', 'endMs'] as const;

export const FETCH_LOOKBACK_KEYS = ['lookbackDays', 'lookbackHours'] as const;

export const FETCH_DECLARED_COUNT_KEYS = [
	'candleCount',
	'expectedBars',
	'barCount',
	'pointCount',
	'expectedPoints',
] as const;

export const MANGLED_CHART_DATA_REASON =
	'Chart data toolResult must be the full provider fetch MCP result — not hand-reconstructed rows. ' +
	'Run the provider fetch once and pass the structured JSON unchanged (timestamps and window metadata). ' +
	'Do not wrap arrays as `{ item: [...] }`.';

const TITLE_LOOKBACK_POINT_GRACE_SEC = 2 * 86_400;

function coerceCount(raw: unknown): number | null {
	if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
		return Math.floor(raw);
	}
	if (typeof raw === 'string') {
		const n = Number(raw.trim());
		if (Number.isFinite(n) && n > 0) {
			return Math.floor(n);
		}
	}
	return null;
}

function coerceMs(raw: unknown): number | null {
	if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
		return raw;
	}
	if (typeof raw === 'string') {
		const n = Number(raw.trim());
		if (Number.isFinite(n) && n > 0) {
			return n;
		}
	}
	return null;
}

/** Primary data record for interval-based OHLCV fetches (nested `ohlcv` or flat symbol envelope). */
export function intervalDataRecordFromPayload(payload: unknown): Record<string, unknown> | null {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return null;
	}
	const record = payload as Record<string, unknown>;
	if (record.ohlcv && typeof record.ohlcv === 'object' && !Array.isArray(record.ohlcv)) {
		return record.ohlcv as Record<string, unknown>;
	}
	for (const key of ['candles', 'startTimeMs', 'coin', 'symbol', 'timeframe', 'interval'] as const) {
		if (key in record) {
			return record;
		}
	}
	return null;
}

export function collectionIsItemWrapper(raw: unknown): boolean {
	return (
		raw != null &&
		typeof raw === 'object' &&
		!Array.isArray(raw) &&
		Array.isArray((raw as Record<string, unknown>).item)
	);
}

export function recordHasCollectionKey(
	record: Record<string, unknown>,
	keys: readonly string[],
): boolean {
	for (const key of keys) {
		if (key in record) {
			return true;
		}
	}
	return false;
}

/** Payload layers to scan for mangled `{ item: [...] }` collections. */
export function payloadRecordsForValidation(toolResult: unknown): Record<string, unknown>[] {
	if (!toolResult || typeof toolResult !== 'object' || Array.isArray(toolResult)) {
		return [];
	}
	const root = toolResult as Record<string, unknown>;
	const records: Record<string, unknown>[] = [root];
	const intervalRecord = intervalDataRecordFromPayload(toolResult);
	if (intervalRecord && intervalRecord !== root) {
		records.push(intervalRecord);
	}
	if (root.result && typeof root.result === 'object' && !Array.isArray(root.result)) {
		records.push(root.result as Record<string, unknown>);
	}
	return records;
}

/** Interval OHLCV envelope: symbol + bar interval + bar collection. */
export function structuredIntervalEnvelopeRecord(toolResult: unknown): Record<string, unknown> | null {
	const record = intervalDataRecordFromPayload(toolResult);
	if (!record) {
		return null;
	}
	const symbolRaw = record.coin ?? record.symbol;
	const hasSymbol = typeof symbolRaw === 'string' && symbolRaw.trim().length > 0;
	const intervalRaw = record.interval ?? record.timeframe;
	const hasInterval = typeof intervalRaw === 'string' && intervalRaw.trim().length > 0;
	if (!hasSymbol || !hasInterval || !recordHasCollectionKey(record, OHLCV_COLLECTION_KEYS)) {
		return null;
	}
	return record;
}

/** Time-series envelope: explicit fetch title + point collection (metric / line charts). */
export function structuredTimeSeriesEnvelopeRecord(toolResult: unknown): Record<string, unknown> | null {
	if (!toolResult || typeof toolResult !== 'object' || Array.isArray(toolResult)) {
		return null;
	}
	const root = toolResult as Record<string, unknown>;
	const title =
		typeof root.title === 'string' && root.title.trim()
			? root.title.trim()
			: typeof (root.result as Record<string, unknown> | undefined)?.title === 'string'
				? String((root.result as Record<string, unknown>).title).trim()
				: '';
	if (!title) {
		return null;
	}
	for (const record of payloadRecordsForValidation(toolResult)) {
		if (recordHasCollectionKey(record, TIME_SERIES_COLLECTION_KEYS)) {
			return record;
		}
	}
	if (recordHasCollectionKey(root, TIME_SERIES_COLLECTION_KEYS)) {
		return root;
	}
	return null;
}

function hasFetchWindowMs(record: Record<string, unknown>): boolean {
	const start = coerceMs(record.startTimeMs ?? record.startMs);
	const end = coerceMs(record.endTimeMs ?? record.endMs);
	return start != null && end != null;
}

export function fetchMetadataPresent(
	toolResult: unknown,
	record: Record<string, unknown>,
): boolean {
	const layers = [record, ...payloadRecordsForValidation(toolResult)];
	for (const layer of layers) {
		if (hasFetchWindowMs(layer)) {
			return true;
		}
		for (const key of FETCH_LOOKBACK_KEYS) {
			if (coerceCount(layer[key]) != null) {
				return true;
			}
		}
		for (const key of FETCH_DECLARED_COUNT_KEYS) {
			if (coerceCount(layer[key]) != null) {
				return true;
			}
		}
	}
	return false;
}

/** Reject agent-reconstructed chart fetch payloads (OHLCV or time series). */
export function rejectMangledChartDataToolResult(
	toolResult: unknown,
): {ok: true} | {ok: false; reason: string} {
	if (!toolResult || typeof toolResult !== 'object') {
		return {ok: true};
	}
	for (const record of payloadRecordsForValidation(toolResult)) {
		for (const key of CHART_DATA_COLLECTION_KEYS) {
			if (collectionIsItemWrapper(record[key])) {
				return {ok: false, reason: MANGLED_CHART_DATA_REASON};
			}
		}
	}
	const intervalEnvelope = structuredIntervalEnvelopeRecord(toolResult);
	if (intervalEnvelope && !fetchMetadataPresent(toolResult, intervalEnvelope)) {
		return {ok: false, reason: MANGLED_CHART_DATA_REASON};
	}
	return {ok: true};
}

/** @deprecated Alias — use rejectMangledChartDataToolResult */
export const rejectMangledVendorFetchToolResult = rejectMangledChartDataToolResult;

function barTimeTimestampConflict(bar: Record<string, unknown>): boolean {
	if (bar.timestampMs == null || !('time' in bar)) {
		return false;
	}
	const fromMs = parseChartTime(bar.timestampMs);
	const fromTime = parseChartTime(bar.time);
	if (fromMs == null || fromTime == null) {
		return false;
	}
	const msSec = typeof fromMs === 'number' ? fromMs : null;
	const timeSec = typeof fromTime === 'number' ? fromTime : null;
	if (msSec == null || timeSec == null) {
		return false;
	}
	return Math.abs(msSec - timeSec) > 86_400;
}

/** Validate declared bar count and timestamp field consistency for interval OHLCV fetches. */
export function validateStructuredIntervalFetchShape(
	toolResult: unknown,
	bars: Record<string, unknown>[],
): {ok: true} | {ok: false; reason: string} {
	const record = intervalDataRecordFromPayload(toolResult);
	if (!record) {
		return {ok: true};
	}
	const symbolRaw = record.coin ?? record.symbol;
	if (typeof symbolRaw !== 'string' || !symbolRaw.trim()) {
		return {ok: true};
	}
	const fetchUsesTimestampMs = bars.some(bar => bar.timestampMs != null);
	for (const bar of bars) {
		if (barTimeTimestampConflict(bar)) {
			return {
				ok: false,
				reason:
					'OHLCV rows have conflicting `time` and `timestampMs` fields. ' +
					'Pass the full fetch toolResult unchanged — do not rewrite timestamps.',
			};
		}
		if (
			fetchUsesTimestampMs &&
			bar.timestampMs == null &&
			!('openTime' in bar) &&
			'time' in bar
		) {
			return {
				ok: false,
				reason:
					'OHLCV rows must keep vendor timestamp fields from the fetch result. ' +
					'Pass the full fetch toolResult unchanged — do not replace with generic `time` fields.',
			};
		}
	}
	let expected: number | null = null;
	for (const key of FETCH_DECLARED_COUNT_KEYS) {
		const n = coerceCount(record[key]);
		if (n != null) {
			expected = expected == null ? n : Math.max(expected, n);
		}
	}
	if (expected != null && Math.abs(bars.length - expected) > 1) {
		return {
			ok: false,
			reason:
				`Row count (${bars.length}) does not match fetch declared count (${expected}). ` +
				'Pass the full chart data fetch toolResult unchanged.',
		};
	}
	return {ok: true};
}

/** Hard-fail when point times disagree with chart title lookback (OHLCV bars or line series). */
export function rejectTitleLookbackVsPointTimes(
	title: string | undefined,
	rows: Record<string, unknown>[],
	timeSecFromRow: (row: Record<string, unknown>) => number | null,
): {ok: true} | {ok: false; reason: string} {
	if (!title?.trim() || rows.length < 2) {
		return {ok: true};
	}
	const lookback = parseLookbackSpanFromChartTitle(title);
	if (!lookback) {
		return {ok: true};
	}
	const firstSec = timeSecFromRow(rows[0]!);
	const lastSec = timeSecFromRow(rows[rows.length - 1]!);
	if (firstSec == null || lastSec == null) {
		return {ok: true};
	}
	const nowSec = Math.floor(Date.now() / 1000);
	const graceSec = TITLE_LOOKBACK_POINT_GRACE_SEC;
	const earliestAllowed = nowSec - lookback.spanSec - graceSec;
	if (firstSec < earliestAllowed) {
		return {
			ok: false,
			reason:
				`First point is too old for chart title lookback (${lookback.label}). ` +
				'Run the provider fetch for the requested window and pass the full MCP toolResult unchanged — do not paste rows from memory.',
		};
	}
	if (lastSec < nowSec - lookback.spanSec - graceSec) {
		return {
			ok: false,
			reason:
				`Latest point is too stale for chart title lookback (${lookback.label}). ` +
				'Re-run the provider fetch and pass the full MCP result unchanged.',
		};
	}
	const actualSpanSec = Math.max(0, lastSec - firstSec);
	if (actualSpanSec > lookback.spanSec * 1.35) {
		return {
			ok: false,
			reason:
				`Point span (~${Math.round(actualSpanSec / 86_400)}d) exceeds chart title lookback (${lookback.label}) — likely mixed timelines. ` +
				'Pass the full fetch toolResult unchanged; do not merge old and new data.',
		};
	}
	return {ok: true};
}

export function rejectTitleLookbackVsBarTimes(
	title: string | undefined,
	bars: Record<string, unknown>[],
): {ok: true} | {ok: false; reason: string} {
	return rejectTitleLookbackVsPointTimes(title, bars, barTimeSecFromRow);
}

export function rejectTitleLookbackVsTimeSeriesPoints(
	title: string | undefined,
	points: Record<string, unknown>[],
): {ok: true} | {ok: false; reason: string} {
	return rejectTitleLookbackVsPointTimes(title, points, timeSeriesPointTimeSec);
}

/** When toolResult is present, reject mangled fetches and title/point timeline mismatches. */
export function validateTimeSeriesPointsFromToolResult(
	points: Record<string, unknown>[],
	toolResult: unknown,
	title?: string,
): {ok: true} | {ok: false; reason: string} {
	const mangled = rejectMangledChartDataToolResult(toolResult);
	if (!mangled.ok) {
		return mangled;
	}
	return rejectTitleLookbackVsTimeSeriesPoints(title, points);
}
