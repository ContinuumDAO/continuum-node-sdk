import {z} from 'zod';
import {
	expectedBarCountFromWindow,
	extractOhlcvFetchWindow,
} from './ohlcv-window.js';
import {intervalLabelToBucketSec} from './live/interval.js';
import {OHLCV_TRUNCATION_MYTH} from './ohlcv-integrity-messages.js';

export type LookbackSpan = {
	label: string;
	spanSec: number;
};

export const OhlcvFetchContextSchema = z
	.object({
		interval: z.string().nullable(),
		intervalSec: z.number().nullable(),
		lookbackDays: z.number().nullable(),
		lookbackHours: z.number().nullable(),
		lookbackLabel: z.string().nullable(),
		coin: z.string().nullable(),
		declaredBarCount: z.number().nullable(),
		windowExpectedBarCount: z.number().nullable(),
		expectedBarCount: z.number().nullable(),
	})
	.strict();

export type OhlcvFetchContext = z.infer<typeof OhlcvFetchContextSchema>;

export const OhlcvWindowExpectationSchema = z
	.object({
		interval: z.string().nullable(),
		intervalSec: z.number().nullable(),
		lookbackLabel: z.string().nullable(),
		expectedBarCount: z.number().int().nullable(),
		minBarCount: z.number().int().nullable(),
		sources: z.array(z.string()),
	})
	.strict();

export type OhlcvWindowExpectation = z.infer<typeof OhlcvWindowExpectationSchema>;

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

function ohlcvRecordFromPayload(payload: unknown): Record<string, unknown> | null {
	if (!payload || typeof payload !== 'object') {
		return null;
	}
	const record = payload as Record<string, unknown>;
	if (record.ohlcv && typeof record.ohlcv === 'object' && !Array.isArray(record.ohlcv)) {
		return record.ohlcv as Record<string, unknown>;
	}
	if (
		'candles' in record ||
		'interval' in record ||
		'timeframe' in record ||
		'coin' in record ||
		'symbol' in record
	) {
		return record;
	}
	return null;
}

function resolveFetchIntervalLabel(toolResult: unknown): string | null {
	const ohlcv = ohlcvRecordFromPayload(toolResult);
	const raw = ohlcv?.interval ?? ohlcv?.timeframe;
	if (typeof raw !== 'string' || !raw.trim()) {
		return null;
	}
	return raw.trim().toLowerCase();
}

/** Parse bar interval from title: 15m, 4H, 1d, 1w, etc. (not lookback phrases). */
export function parseIntervalLabelFromChartTitle(title: string): string | null {
	const trimmed = title.trim();
	if (!trimmed) {
		return null;
	}
	const withoutLookback = trimmed
		.replace(/\blast\s+\d+\s*hours?\b/gi, '')
		.replace(/\blast\s+\d+\s*days?\b/gi, '')
		.replace(/\blast\s+\d+\s*d\b/gi, '')
		.replace(/\blast\s+\d+\s*weeks?\b/gi, '')
		.replace(/\blast\s+\d+\s*months?\b/gi, '')
		.replace(/\blast\s+\d+\s*mo\b/gi, '')
		.trim();

	const minMatch = withoutLookback.match(/\b(\d+)\s*m(?:in|inute|inutes)?\b/i);
	if (minMatch?.[1]) {
		const mins = Number(minMatch[1]);
		if (Number.isFinite(mins) && mins > 0 && mins <= 1440) {
			return `${Math.floor(mins)}m`;
		}
	}

	const hourMatch =
		withoutLookback.match(/\b(\d+)\s*h(?:our|ours|rs?)?\b/i) ??
		withoutLookback.match(/\b(\d+)h\b/i);
	if (hourMatch?.[1]) {
		const hours = Number(hourMatch[1]);
		if (Number.isFinite(hours) && hours > 0 && hours <= 168) {
			return `${Math.floor(hours)}h`;
		}
	}

	const dayInterval = withoutLookback.match(/\b(\d+)\s*d(?:ay)?\b/i);
	if (dayInterval?.[1]) {
		const days = Number(dayInterval[1]);
		if (Number.isFinite(days) && days > 0 && days <= 30) {
			return `${Math.floor(days)}d`;
		}
	}

	const weekMatch = withoutLookback.match(/\b(\d+)\s*w(?:eek|eeks)?\b/i);
	if (weekMatch?.[1]) {
		const weeks = Number(weekMatch[1]);
		if (Number.isFinite(weeks) && weeks > 0 && weeks <= 52) {
			return `${Math.floor(weeks)}w`;
		}
	}

	const monthInterval = withoutLookback.match(/\b(\d+)\s*M\b/);
	if (monthInterval?.[1]) {
		return `${monthInterval[1]}M`;
	}

	return null;
}

/** Parse calendar lookback from title: 7d, 24h, 4 weeks, 6 months, etc. */
export function parseLookbackSpanFromChartTitle(title: string): LookbackSpan | null {
	const trimmed = title.trim();
	if (!trimmed) {
		return null;
	}

	// Drop bar-interval token so "ETH 1d — 6 months" resolves to 6mo, not 1d.
	const withoutInterval = stripIntervalLabelFromChartTitle(trimmed);

	const hourPatterns = [
		/\blast\s+(\d+)\s*hours?\b/i,
		/\b(?:last|past)\s+(\d+)\s*h\b/i,
		/\b(\d+)\s*hours?\s+(?:of\s+)?data\b/i,
	];
	for (const pattern of hourPatterns) {
		const match = withoutInterval.match(pattern);
		if (match?.[1]) {
			const hours = Number(match[1]);
			if (Number.isFinite(hours) && hours > 0 && hours <= 8760) {
				const h = Math.floor(hours);
				return {label: `${h}h`, spanSec: h * 3_600};
			}
		}
	}

	const monthPatterns = [
		/\blast\s+(\d+)\s*months?\b/i,
		/\b(\d+)\s*months?\b/i,
		/\b(\d+)\s*mo\b/i,
	];
	for (const pattern of monthPatterns) {
		const match = withoutInterval.match(pattern);
		if (match?.[1]) {
			const months = Number(match[1]);
			if (Number.isFinite(months) && months > 0 && months <= 24) {
				const m = Math.floor(months);
				return {label: `${m}mo`, spanSec: m * 30 * 86_400};
			}
		}
	}

	const weekPatterns = [/\blast\s+(\d+)\s*weeks?\b/i, /\b(\d+)\s*weeks?\b/i, /\b(\d+)\s*w\b/i];
	for (const pattern of weekPatterns) {
		const match = withoutInterval.match(pattern);
		if (match?.[1]) {
			const weeks = Number(match[1]);
			if (Number.isFinite(weeks) && weeks > 0 && weeks <= 52) {
				const w = Math.floor(weeks);
				return {label: `${w}w`, spanSec: w * 7 * 86_400};
			}
		}
	}

	const dayPatterns = [
		/\blast\s+(\d+)\s*days?\b/i,
		/\b(?:last|past)\s+(\d+)\s*d\b/i,
		/\b(\d+)\s*-\s*day\b/i,
		/\b(\d+)\s*days?\b/i,
		/\b(\d+)\s*d\b/i,
	];
	for (const pattern of dayPatterns) {
		const match = withoutInterval.match(pattern);
		if (match?.[1]) {
			const days = Number(match[1]);
			if (Number.isFinite(days) && days > 0 && days <= 365) {
				const d = Math.floor(days);
				return {label: `${d}d`, spanSec: d * 86_400};
			}
		}
	}

	return null;
}

function stripIntervalLabelFromChartTitle(title: string): string {
	const interval = parseIntervalLabelFromChartTitle(title);
	if (!interval) {
		return title;
	}
	const parsed = interval.match(/^(\d+)(m|h|d|w|M)$/);
	if (!parsed) {
		return title;
	}
	const [, num, unit] = parsed;
	const unitPatterns: Record<string, RegExp> = {
		m: new RegExp(`\\b${num}\\s*m(?:in(?:ute)?s?)?\\b`, 'i'),
		h: new RegExp(`\\b${num}\\s*h(?:our|ours|rs?)?\\b|\\b${num}h\\b`, 'i'),
		d: new RegExp(`\\b${num}\\s*d(?:ay)?\\b`, 'i'),
		w: new RegExp(`\\b${num}\\s*w(?:eek|eeks)?\\b`, 'i'),
		M: new RegExp(`\\b${num}\\s*M\\b`),
	};
	const pattern = unitPatterns[unit];
	if (!pattern) {
		return title;
	}
	return title.replace(pattern, ' ').replace(/\s+/g, ' ').trim();
}

/** @deprecated Use parseLookbackSpanFromChartTitle — returns whole days when span is day-based. */
export function parseLookbackDaysFromChartTitle(title: string): number | null {
	const span = parseLookbackSpanFromChartTitle(title);
	if (!span) {
		return null;
	}
	return Math.max(1, Math.round(span.spanSec / 86_400));
}

function lookbackLabelFromFetch(ohlcv: Record<string, unknown>): string | null {
	const days = coerceCount(ohlcv.lookbackDays);
	if (days != null) {
		return `${days}d`;
	}
	const hours = coerceCount(ohlcv.lookbackHours);
	if (hours != null) {
		return `${hours}h`;
	}
	return null;
}

function expectedFromFetchLookback(
	ohlcv: Record<string, unknown>,
	intervalSec: number | null,
): number | null {
	if (intervalSec == null || intervalSec <= 0) {
		return null;
	}
	const days = coerceCount(ohlcv.lookbackDays);
	if (days != null) {
		return Math.ceil((days * 86_400) / intervalSec);
	}
	const hours = coerceCount(ohlcv.lookbackHours);
	if (hours != null) {
		return Math.ceil((hours * 3_600) / intervalSec);
	}
	return null;
}

/** Read interval, lookback, and expected bar count from any vendor fetch payload. */
export function resolveOhlcvFetchContext(toolResult: unknown): OhlcvFetchContext | null {
	const ohlcv = ohlcvRecordFromPayload(toolResult);
	if (!ohlcv) {
		return null;
	}
	const interval = resolveFetchIntervalLabel(toolResult);
	const intervalSec = interval != null ? intervalLabelToBucketSec(interval) : null;
	const lookbackDays = coerceCount(ohlcv.lookbackDays);
	const lookbackHours = coerceCount(ohlcv.lookbackHours);
	const coinRaw = ohlcv.coin ?? ohlcv.symbol;
	const coin = typeof coinRaw === 'string' && coinRaw.trim() ? coinRaw.trim() : null;
	const declaredBarCount = coerceCount(ohlcv.candleCount ?? ohlcv.expectedBars);
	const window = extractOhlcvFetchWindow(toolResult);
	const windowExpectedBarCount = window != null ? expectedBarCountFromWindow(window) : null;
	const fromLookback = expectedFromFetchLookback(ohlcv, intervalSec);

	const candidates = [declaredBarCount, windowExpectedBarCount, fromLookback].filter(
		(n): n is number => n != null && n > 0,
	);
	const expectedBarCount = candidates.length ? Math.max(...candidates) : null;

	return {
		interval,
		intervalSec,
		lookbackDays,
		lookbackHours,
		lookbackLabel: lookbackLabelFromFetch(ohlcv),
		coin,
		declaredBarCount,
		windowExpectedBarCount,
		expectedBarCount,
	};
}

/** Merge title + fetch metadata into one bar-count expectation (any interval × any lookback). */
export function resolveOhlcvWindowExpectation(
	title: string | undefined,
	toolResult: unknown | undefined,
): OhlcvWindowExpectation | null {
	const fetchCtx = toolResult != null ? resolveOhlcvFetchContext(toolResult) : null;
	const titleInterval = title?.trim() ? parseIntervalLabelFromChartTitle(title) : null;
	const titleLookback = title?.trim() ? parseLookbackSpanFromChartTitle(title) : null;

	const interval = titleInterval ?? fetchCtx?.interval ?? null;
	const intervalSec =
		(interval != null ? intervalLabelToBucketSec(interval) : null) ??
		fetchCtx?.intervalSec ??
		null;

	if (intervalSec == null || intervalSec <= 0) {
		return null;
	}

	const candidates: number[] = [];
	const sources: string[] = [];

	if (titleLookback) {
		const fromTitle = Math.ceil(titleLookback.spanSec / intervalSec);
		candidates.push(fromTitle);
		sources.push(`title:${interval ?? '?'}×${titleLookback.label}`);
	}

	if (fetchCtx?.expectedBarCount != null) {
		candidates.push(fetchCtx.expectedBarCount);
		if (fetchCtx.lookbackLabel) {
			sources.push(`fetch:${interval ?? fetchCtx.interval ?? '?'}×${fetchCtx.lookbackLabel}`);
		} else if (fetchCtx.declaredBarCount != null) {
			sources.push('fetch:declaredBarCount');
		} else if (fetchCtx.windowExpectedBarCount != null) {
			sources.push('fetch:window');
		}
	}

	if (!candidates.length) {
		return null;
	}

	const expectedBarCount = Math.max(...candidates);
	const lookbackLabel = titleLookback?.label ?? fetchCtx?.lookbackLabel ?? null;

	return {
		interval,
		intervalSec,
		lookbackLabel,
		expectedBarCount,
		minBarCount: Math.max(1, Math.floor(expectedBarCount * 0.85)),
		sources,
	};
}

export function formatWindowExpectation(expectation: OhlcvWindowExpectation): string {
	const interval = expectation.interval ?? '?';
	const lookback = expectation.lookbackLabel ?? '?';
	return `${interval} × ${lookback} (~${expectation.expectedBarCount} bars)`;
}

/** Hard-fail when title interval ≠ fetch interval. */
export function rejectIntervalMismatchTitleVsFetch(
	title: string,
	toolResult: unknown | undefined,
): {ok: true} | {ok: false; reason: string} {
	if (toolResult == null) {
		return {ok: true};
	}
	const titleInterval = parseIntervalLabelFromChartTitle(title);
	if (!titleInterval) {
		return {ok: true};
	}
	const fetchInterval = resolveFetchIntervalLabel(toolResult);
	if (!fetchInterval) {
		return {ok: true};
	}
	const titleSec = intervalLabelToBucketSec(titleInterval);
	const fetchSec = intervalLabelToBucketSec(fetchInterval);
	if (titleSec == null || fetchSec == null || titleSec === fetchSec) {
		return {ok: true};
	}
	return {
		ok: false,
		reason:
			`Title interval (${titleInterval}) does not match fetch interval (${fetchInterval}). ` +
			`Re-fetch OHLCV with interval: ${titleInterval} and pass the full toolResult unchanged. ` +
			'Do not switch to a coarser interval for “truncation”. ' +
			OHLCV_TRUNCATION_MYTH,
	};
}

/** Hard-fail when chart title lookback ≠ fetch lookback/window (e.g. title "3d" after lookbackDays: 7). */
export function rejectTitleLookbackMismatchVsFetch(
	title: string,
	toolResult: unknown | undefined,
): {ok: true} | {ok: false; reason: string} {
	if (toolResult == null || !title.trim()) {
		return {ok: true};
	}
	const titleLookback = parseLookbackSpanFromChartTitle(title);
	if (!titleLookback) {
		return {ok: true};
	}
	const fetchCtx = resolveOhlcvFetchContext(toolResult);
	const window = extractOhlcvFetchWindow(toolResult);

	let fetchSpanSec: number | null = null;
	let fetchLabel = fetchCtx?.lookbackLabel ?? null;

	if (fetchCtx?.lookbackDays != null) {
		fetchSpanSec = fetchCtx.lookbackDays * 86_400;
	} else if (fetchCtx?.lookbackHours != null) {
		fetchSpanSec = fetchCtx.lookbackHours * 3_600;
	} else if (window != null) {
		fetchSpanSec = (window.endTimeMs - window.startTimeMs) / 1000;
		if (!fetchLabel && fetchSpanSec >= 86_400) {
			fetchLabel = `${Math.max(1, Math.round(fetchSpanSec / 86_400))}d`;
		} else if (!fetchLabel && fetchSpanSec >= 3_600) {
			fetchLabel = `${Math.max(1, Math.round(fetchSpanSec / 3_600))}h`;
		}
	}

	if (fetchSpanSec == null || fetchSpanSec <= 0) {
		return {ok: true};
	}

	const toleranceSec = Math.max(3_600, Math.min(titleLookback.spanSec, fetchSpanSec) * 0.12);
	if (Math.abs(titleLookback.spanSec - fetchSpanSec) <= toleranceSec) {
		return {ok: true};
	}

	const fetchDesc = fetchLabel ?? `${Math.max(1, Math.round(fetchSpanSec / 86_400))}d`;
	const titleDays = parseLookbackDaysFromChartTitle(title);
	const refetchHint =
		titleDays != null
			? `Re-fetch with lookbackDays: ${titleDays} and title "… — last ${titleLookback.label}". `
			: '';

	return {
		ok: false,
		reason:
			`Chart title lookback (${titleLookback.label}) does not match fetch window (${fetchDesc}). ` +
			refetchHint +
			'Do not retitle to a shorter window when the operator asked for a longer lookback. ' +
			OHLCV_TRUNCATION_MYTH,
	};
}

/** Hard-fail when loaded bar count is far below title/fetch window (truncated or wrong refetch). */
export function rejectOhlcvWindowBarCountMismatch(
	title: string | undefined,
	barCount: number,
	toolResult: unknown | undefined,
): {ok: true} | {ok: false; reason: string} {
	const expectation = resolveOhlcvWindowExpectation(title, toolResult);
	if (!expectation?.expectedBarCount || expectation.minBarCount == null) {
		return {ok: true};
	}
	if (barCount >= expectation.minBarCount) {
		return {ok: true};
	}
	return {
		ok: false,
		reason:
			`Expected ~${expectation.expectedBarCount} bars for ${formatWindowExpectation(expectation)} but only ${barCount} loaded. ` +
			'Pass the same full fetch toolResult as the chart/analysis request — do not re-fetch at a different interval or truncate. ' +
			OHLCV_TRUNCATION_MYTH,
	};
}

/** Interval + bar-count checks for chart and analyze (all vendors, all intervals/lookbacks). */
export function rejectOhlcvWindowMismatch(input: {
	title?: string;
	barCount: number;
	toolResult?: unknown;
}): {ok: true} | {ok: false; reason: string} {
	if (input.title?.trim()) {
		const lookbackCheck = rejectTitleLookbackMismatchVsFetch(input.title, input.toolResult);
		if (!lookbackCheck.ok) {
			return lookbackCheck;
		}
		const intervalCheck = rejectIntervalMismatchTitleVsFetch(input.title, input.toolResult);
		if (!intervalCheck.ok) {
			return intervalCheck;
		}
	}
	return rejectOhlcvWindowBarCountMismatch(input.title, input.barCount, input.toolResult);
}

/** @deprecated Use rejectOhlcvWindowBarCountMismatch */
export function rejectTitleLookbackBarCountMismatch(
	title: string,
	barCount: number,
	toolResult: unknown | undefined,
): {ok: true} | {ok: false; reason: string} {
	return rejectOhlcvWindowBarCountMismatch(title, barCount, toolResult);
}
