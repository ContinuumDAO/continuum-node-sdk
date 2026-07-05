import {barTimeSecFromRow} from './live/bar-merge.js';
import {intervalLabelToBucketSec} from './live/interval.js';

export type OhlcvFetchWindow = {
	startTimeMs: number;
	endTimeMs: number;
	intervalSec?: number;
};

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
	const fetchWindow = extractOhlcvFetchWindow(toolResult);
	if (!fetchWindow) {
		return {ok: true};
	}
	return validateBarsAgainstFetchWindow(bars, fetchWindow);
}
