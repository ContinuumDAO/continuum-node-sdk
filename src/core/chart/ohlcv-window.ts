import {barTimeSecFromRow} from './live/bar-merge.js';
import {intervalLabelToBucketSec} from './live/interval.js';
import {parseChartTime} from './point-normalize.js';

/** Read all bars from fetch toolResult for validation; chart display uses separate maxPoints. */
export const OHLCV_EXTRACT_MAX_BARS = 10_000;

export type OhlcvFetchWindow = {
	startTimeMs: number;
	endTimeMs: number;
	intervalSec?: number;
};

function ohlcvRecordFromPayload(payload: unknown): Record<string, unknown> | null {
	if (!payload || typeof payload !== 'object') {
		return null;
	}
	const record = payload as Record<string, unknown>;
	if (record.ohlcv && typeof record.ohlcv === 'object' && !Array.isArray(record.ohlcv)) {
		return record.ohlcv as Record<string, unknown>;
	}
	if ('candles' in record || 'startTimeMs' in record || 'coin' in record) {
		return record;
	}
	return null;
}

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

/** Drop agent-added `time` when vendor `timestampMs` is present (prevents dual-timeline live merge). */
export function sanitizeOhlcvBarRows(bars: Record<string, unknown>[]): Record<string, unknown>[] {
	return bars.map(bar => {
		if (bar.timestampMs == null || !('time' in bar)) {
			return bar;
		}
		const rest = {...bar};
		delete rest.time;
		return rest;
	});
}

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
	const toleranceSec = 86_400;
	return Math.abs(msSec - timeSec) > toleranceSec;
}

function validateHyperliquidShape(
	toolResult: unknown,
	bars: Record<string, unknown>[],
): {ok: true} | {ok: false; reason: string} {
	const ohlcv = ohlcvRecordFromPayload(toolResult);
	if (!ohlcv || typeof ohlcv.coin !== 'string' || !ohlcv.coin.trim()) {
		return {ok: true};
	}
	for (const bar of bars) {
		if (barTimeTimestampConflict(bar)) {
			return {
				ok: false,
				reason:
					'Hyperliquid candles have conflicting `time` and `timestampMs` fields. ' +
					'Pass the full fetch toolResult unchanged — do not rewrite candle timestamps.',
			};
		}
		if (bar.timestampMs == null && !('openTime' in bar) && 'time' in bar) {
			return {
				ok: false,
				reason:
					'Hyperliquid OHLCV candles must keep `timestampMs` from the fetch result. ' +
					'Pass the full fetch toolResult unchanged — do not replace with generic `time` fields.',
			};
		}
	}
	const expected = coerceCount(ohlcv.candleCount ?? ohlcv.expectedBars);
	if (expected != null && Math.abs(bars.length - expected) > 1) {
		return {
			ok: false,
			reason:
				`Bar count (${bars.length}) does not match fetch candleCount (${expected}). ` +
				'Pass the full OHLCV fetch toolResult unchanged.',
		};
	}
	return {ok: true};
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

function windowFromOhlcvRecord(record: Record<string, unknown>): OhlcvFetchWindow | null {
	const startTimeMs = coerceMs(record.startTimeMs ?? record.startMs);
	const endTimeMs = coerceMs(record.endTimeMs ?? record.endMs);
	if (startTimeMs == null || endTimeMs == null) {
		return null;
	}
	const intervalRaw = record.interval ?? record.timeframe;
	const intervalSec =
		typeof intervalRaw === 'string' && intervalRaw.trim()
			? intervalLabelToBucketSec(intervalRaw.trim())
			: undefined;
	return {
		startTimeMs,
		endTimeMs,
		...(intervalSec != null ? {intervalSec} : {}),
	};
}

/** Expected bar count from fetch window metadata (start/end + interval). */
export function expectedBarCountFromWindow(window: OhlcvFetchWindow): number | null {
	if (window.intervalSec == null || window.intervalSec <= 0) {
		return null;
	}
	const spanMs = window.endTimeMs - window.startTimeMs;
	if (spanMs <= 0) {
		return null;
	}
	return Math.ceil(spanMs / 1000 / window.intervalSec);
}

/** Read Hyperliquid/GMX-style fetch window metadata when present on the payload. */
export function extractOhlcvFetchWindow(payload: unknown): OhlcvFetchWindow | null {
	const parsed = payload;
	if (!parsed || typeof parsed !== 'object') {
		return null;
	}
	const record = parsed as Record<string, unknown>;
	const direct = windowFromOhlcvRecord(record);
	if (direct) {
		return direct;
	}
	const ohlcv = record.ohlcv;
	if (ohlcv && typeof ohlcv === 'object' && !Array.isArray(ohlcv)) {
		return windowFromOhlcvRecord(ohlcv as Record<string, unknown>);
	}
	return null;
}

export function validateBarsAgainstFetchWindow(
	bars: Record<string, unknown>[],
	window: OhlcvFetchWindow,
): {ok: true} | {ok: false; reason: string} {
	if (!bars.length) {
		return {ok: true};
	}
	const startSec = Math.floor(window.startTimeMs / 1000);
	const endSec = Math.floor(window.endTimeMs / 1000);
	const firstSec = barTimeSecFromRow(bars[0]!);
	const lastSec = barTimeSecFromRow(bars[bars.length - 1]!);
	if (firstSec == null || lastSec == null) {
		return {ok: true};
	}
	const toleranceSec = window.intervalSec ?? 86_400;
	const spanSec = Math.max(endSec - startSec, toleranceSec);
	// Bars wholly outside the fetch window (common when agents rewrite `time` fields).
	if (lastSec < startSec - toleranceSec || firstSec > endSec + toleranceSec) {
		return {
			ok: false,
			reason:
				`Candle times (${firstSec}–${lastSec}) do not match fetch window (${startSec}–${endSec}). ` +
				'Pass the full OHLCV fetch toolResult unchanged — do not rewrite candle `time` fields.',
		};
	}
	// Contiguous series fully inside the fetch window.
	if (firstSec >= startSec - toleranceSec && lastSec <= endSec + toleranceSec) {
		return {ok: true};
	}
	let inside = 0;
	for (const bar of bars) {
		const t = barTimeSecFromRow(bar);
		if (t != null && t >= startSec - toleranceSec && t <= endSec + toleranceSec) {
			inside += 1;
		}
	}
	// Mixed timelines: most bars fall outside the fetch window (rewritten `time` + live tail).
	if (bars.length >= 3 && inside > 0 && inside < bars.length * 0.9) {
		return {
			ok: false,
			reason:
				'Most candle timestamps fall outside the fetch startTimeMs/endTimeMs window. ' +
				'Pass the full OHLCV fetch toolResult unchanged (keep Hyperliquid timestampMs candles).',
		};
	}
	// Dual timeline: wide span with a small in-window tail.
	const expectedSpanSec =
		window.intervalSec != null && bars.length > 1
			? (bars.length - 1) * window.intervalSec
			: null;
	if (
		expectedSpanSec != null &&
		firstSec < startSec - toleranceSec &&
		lastSec - firstSec > expectedSpanSec * 2 &&
		inside < bars.length * 0.8
	) {
		return {
			ok: false,
			reason:
				'Candle timestamps span a much wider range than the fetch window (likely mixed wrong `time` values and live data). ' +
				'Pass the full OHLCV fetch toolResult unchanged (keep Hyperliquid timestampMs candles).',
		};
	}
	// Partial overlap with large drift — e.g. wrong historical cluster only.
	const overlapStart = Math.max(firstSec, startSec - toleranceSec);
	const overlapEnd = Math.min(lastSec, endSec + toleranceSec);
	const overlap = Math.max(0, overlapEnd - overlapStart);
	if (overlap < spanSec * 0.5) {
		return {
			ok: false,
			reason:
				'Most candle timestamps fall outside the fetch startTimeMs/endTimeMs window. ' +
				'Pass the full OHLCV fetch toolResult unchanged (keep Hyperliquid timestampMs candles).',
		};
	}
	return {ok: true};
}

/** When fetch metadata includes startTimeMs/endTimeMs, reject mangled candle timestamps. */
export function validateOhlcvBarsFromToolResult(
	bars: Record<string, unknown>[],
	toolResult: unknown,
): {ok: true} | {ok: false; reason: string} {
	const hyperliquid = validateHyperliquidShape(toolResult, bars);
	if (!hyperliquid.ok) {
		return hyperliquid;
	}
	const fetchWindow = extractOhlcvFetchWindow(toolResult);
	if (!fetchWindow) {
		return {ok: true};
	}
	return validateBarsAgainstFetchWindow(bars, fetchWindow);
}

export function invalidStringToolResultReason(): string {
	return (
		'`toolResult` must be the full fetch JSON object or a complete JSON string. ' +
		'Truncated or invalid JSON cannot be charted — re-run the OHLCV fetch and pass the MCP result unchanged.'
	);
}

/** True when a string looks like JSON but did not parse (truncated agent copy). */
export function isUnparsedJsonString(value: unknown): boolean {
	if (typeof value !== 'string') {
		return false;
	}
	const trimmed = value.trim();
	if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
		return false;
	}
	try {
		JSON.parse(trimmed);
		return false;
	} catch {
		return true;
	}
}
