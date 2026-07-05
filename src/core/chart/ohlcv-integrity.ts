import {z} from 'zod';
import type {SdkResult} from '../result.js';
import type {ChartOhlcvSummary} from './chart-ohlcv-summary.js';
import {summarizeOhlcvBars} from './chart-ohlcv-summary.js';
import {intervalLabelToBucketSec} from './live/interval.js';
import {normalizeCandleRow, parseChartTimeFromRow} from './point-normalize.js';

/** Body mid this many × median range away from prior bar → stale/wrong slice. */
const STALE_BODY_GAP_MULTIPLIER = 3;

/** Wick must exceed body by this factor before a stale-body composite is considered. */
const MIN_WICK_BODY_RATIO_FOR_COMPOSITE = 8;

/** Wick extreme must land within this × median range of the prior bar high/low. */
const WICK_NEAR_PRIOR_RANGE_MULTIPLIER = 4;

const MIN_BARS_FOR_MEDIAN = 8;

export const OhlcvFingerprintSchema = z
	.object({
		version: z.literal(1),
		barCount: z.number().int(),
		timeStartSec: z.number(),
		timeEndSec: z.number(),
		low: z.number(),
		high: z.number(),
		lastClose: z.number(),
		/** Stable id — compare across chart + analyze on the same fetch. */
		digest: z.string(),
	})
	.strict();

export type OhlcvFingerprint = z.infer<typeof OhlcvFingerprintSchema>;

export type InvalidOhlcvBarReport = {
	index: number;
	timeSec: number | null;
	open: number;
	high: number;
	low: number;
	close: number;
	issues: string[];
};

export const ROWS_ONLY_WITHOUT_TOOL_RESULT_REASON =
	'OHLCV `rows` without fetch `toolResult` are not trusted for charts or analysis. ' +
	'Re-run the OHLCV fetch and pass the full MCP JSON as `toolResult` unchanged (Hyperliquid, GMX, CoinGecko, CMC, etc.). ' +
	'Do not hand-copy candle arrays into chat or `rows`.';

/** Parse "1H", "12 hour", "4h", etc. from chart title. */
export function parseIntervalLabelFromChartTitle(title: string): string | null {
	const trimmed = title.trim();
	if (!trimmed) {
		return null;
	}
	const hourMatch =
		trimmed.match(/\b(\d+)\s*h(?:our|ours|rs?)?\b/i) ?? trimmed.match(/\b(\d+)h\b/i);
	if (hourMatch?.[1]) {
		const hours = Number(hourMatch[1]);
		if (Number.isFinite(hours) && hours > 0 && hours <= 168) {
			return `${Math.floor(hours)}h`;
		}
	}
	const minMatch = trimmed.match(/\b(\d+)\s*m(?:in|inute|inutes)?\b/i);
	if (minMatch?.[1]) {
		const mins = Number(minMatch[1]);
		if (Number.isFinite(mins) && mins > 0 && mins <= 1440) {
			return `${Math.floor(mins)}m`;
		}
	}
	const dayMatch = trimmed.match(/\b(\d+)\s*d(?:ay|ays)?\b/i);
	if (dayMatch?.[1]) {
		const days = Number(dayMatch[1]);
		if (Number.isFinite(days) && days > 0 && days <= 30) {
			return `${Math.floor(days)}d`;
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
	if ('candles' in record || 'interval' in record || 'timeframe' in record || 'coin' in record) {
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

/** Hard-fail when title says 1H but fetch returned 12h (prevents wrong-interval charts after retry loops). */
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
			`Chart title interval (${titleInterval}) does not match fetch interval (${fetchInterval}). ` +
			`Re-fetch OHLCV with interval: ${titleInterval} and pass the full toolResult unchanged. ` +
			'Do not switch to a coarser interval or retry prepare_chart after a failed fetch — that wastes tool rounds.',
	};
}

function hasFetchPayload(input: {
	toolResult?: unknown;
	executeResult?: unknown;
	fetchResult?: unknown;
}): boolean {
	return (
		input.toolResult != null || input.executeResult != null || input.fetchResult != null
	);
}

/** Reject hand-copied rows when no fetch payload is present (all vendors). */
export function rejectRowsOnlyWithoutFetch(
	input: {
		toolResult?: unknown;
		executeResult?: unknown;
		fetchResult?: unknown;
		rows?: unknown[];
		allowRowsOnly?: boolean;
	},
): {ok: true} | {ok: false; reason: string} {
	if (input.allowRowsOnly) {
		return {ok: true};
	}
	const hasRows = Array.isArray(input.rows) && input.rows.length > 0;
	if (hasRows && !hasFetchPayload(input)) {
		return {ok: false, reason: ROWS_ONLY_WITHOUT_TOOL_RESULT_REASON};
	}
	return {ok: true};
}

function formatTimeSec(timeSec: number | null): string {
	if (timeSec == null) {
		return '?';
	}
	return new Date(timeSec * 1000).toISOString();
}

function structuralOhlcIssues(open: number, high: number, low: number, close: number): string[] {
	const issues: string[] = [];
	if (high < low) {
		issues.push('high < low');
	}
	if (high < open) {
		issues.push('high < open');
	}
	if (high < close) {
		issues.push('high < close');
	}
	if (low > open) {
		issues.push('low > open');
	}
	if (low > close) {
		issues.push('low > close');
	}
	return issues;
}

/** Stale body at wrong price level while wick reaches prior-bar range (mixed feed composite). */
function staleCompositeIssues(
	open: number,
	high: number,
	low: number,
	close: number,
	prev: {open: number; high: number; low: number; close: number} | null,
	medianRange: number | null,
): string[] {
	if (!prev || medianRange == null || medianRange <= 0) {
		return [];
	}
	const body = Math.abs(close - open);
	const mid = (open + close) / 2;
	const minBody = Math.max(mid * 1e-4, 1e-6);
	const prevMid = (prev.open + prev.close) / 2;
	const bodyGap = Math.abs(mid - prevMid);
	if (bodyGap <= medianRange * STALE_BODY_GAP_MULTIPLIER) {
		return [];
	}

	const issues: string[] = [];
	const upperWick = high - Math.max(open, close);
	const lowerWick = Math.min(open, close) - low;
	const nearPrior = medianRange * WICK_NEAR_PRIOR_RANGE_MULTIPLIER;

	if (body >= minBody && upperWick > body * MIN_WICK_BODY_RATIO_FOR_COMPOSITE) {
		if (high >= prev.high - nearPrior && high <= prev.high + nearPrior) {
			issues.push(
				`body near ${mid.toFixed(1)} but high ${high.toFixed(1)} matches prior bar while body gap is ${bodyGap.toFixed(1)} — likely stale/mixed composite OHLC`,
			);
		}
	}
	if (body >= minBody && lowerWick > body * MIN_WICK_BODY_RATIO_FOR_COMPOSITE) {
		if (low <= prev.low + nearPrior && low >= prev.low - nearPrior) {
			issues.push(
				`body near ${mid.toFixed(1)} but low ${low.toFixed(1)} matches prior bar while body gap is ${bodyGap.toFixed(1)} — likely stale/mixed composite OHLC`,
			);
		}
	}
	return issues;
}

function medianBarRange(candles: Array<{high: number; low: number}>): number | null {
	if (candles.length < MIN_BARS_FOR_MEDIAN) {
		return null;
	}
	const ranges = candles.map(c => c.high - c.low).filter(r => r > 0).sort((a, b) => a - b);
	if (!ranges.length) {
		return null;
	}
	const mid = Math.floor(ranges.length / 2);
	return ranges.length % 2 ? ranges[mid]! : (ranges[mid - 1]! + ranges[mid]!) / 2;
}

/** Validate every bar: structural OHLC + wick/outlier heuristics (all data sources). */
export function validateOhlcvBarIntegrity(
	bars: Record<string, unknown>[],
	options: {maxReport?: number} = {},
): {ok: true} | {ok: false; reason: string; invalidBars: InvalidOhlcvBarReport[]} {
	const normalized: Array<{
		index: number;
		timeSec: number | null;
		open: number;
		high: number;
		low: number;
		close: number;
	}> = [];

	for (let index = 0; index < bars.length; index++) {
		const candle = normalizeCandleRow(bars[index]!);
		if (!candle) {
			continue;
		}
		const timeSec =
			typeof candle.time === 'number'
				? candle.time
				: parseChartTimeFromRow(bars[index] as Record<string, unknown>);
		normalized.push({
			index,
			timeSec: typeof timeSec === 'number' ? timeSec : null,
			open: candle.open,
			high: candle.high,
			low: candle.low,
			close: candle.close,
		});
	}

	const medianRange = medianBarRange(normalized);
	const invalidBars: InvalidOhlcvBarReport[] = [];
	const maxReport = options.maxReport ?? 3;

	for (let i = 0; i < normalized.length; i++) {
		const bar = normalized[i]!;
		const prev = i > 0 ? normalized[i - 1]! : null;
		const issues = [
			...structuralOhlcIssues(bar.open, bar.high, bar.low, bar.close),
			...staleCompositeIssues(bar.open, bar.high, bar.low, bar.close, prev, medianRange),
		];
		if (issues.length) {
			invalidBars.push({
				index: bar.index,
				timeSec: bar.timeSec,
				open: bar.open,
				high: bar.high,
				low: bar.low,
				close: bar.close,
				issues,
			});
		}
	}

	if (!invalidBars.length) {
		return {ok: true};
	}

	const sample = invalidBars.slice(0, maxReport);
	const detail = sample
		.map(
			b =>
				`bar #${b.index + 1} (${formatTimeSec(b.timeSec)} O=${b.open} H=${b.high} L=${b.low} C=${b.close}): ${b.issues.join('; ')}`,
		)
		.join(' | ');

	return {
		ok: false,
		reason:
			`Invalid or corrupt OHLCV (${invalidBars.length} bar(s)): ${detail}. ` +
			'Re-fetch OHLCV and pass the full fetch toolResult unchanged — do not hand-copy rows.',
		invalidBars,
	};
}

export function buildOhlcvFingerprint(bars: Record<string, unknown>[]): OhlcvFingerprint | null {
	const summary = summarizeOhlcvBars(bars);
	if (!summary) {
		return null;
	}

	let firstAnchor = '';
	let lastAnchor = '';
	for (const raw of bars) {
		const c = normalizeCandleRow(raw);
		if (!c || typeof c.time !== 'number') {
			continue;
		}
		const anchor = `${c.time}:${c.open.toFixed(4)}:${c.high.toFixed(4)}:${c.low.toFixed(4)}:${c.close.toFixed(4)}`;
		if (!firstAnchor) {
			firstAnchor = anchor;
		}
		lastAnchor = anchor;
	}

	const digest = [
		summary.barCount,
		summary.timeStartSec,
		summary.timeEndSec,
		summary.low.toFixed(2),
		summary.high.toFixed(2),
		summary.lastClose.toFixed(2),
		firstAnchor,
		lastAnchor,
	].join('|');

	return {
		version: 1,
		barCount: summary.barCount,
		timeStartSec: summary.timeStartSec,
		timeEndSec: summary.timeEndSec,
		low: summary.low,
		high: summary.high,
		lastClose: summary.lastClose,
		digest: `v1:${digest}`,
	};
}

const GEOMETRY_MISMATCH_FAIL =
	'Pattern geometry prices fall outside loaded OHLCV summary — analysis and chart likely use different data. ' +
	'Re-fetch once and pass the same full toolResult to prepare_chart_from_rows and analyze_* (compare meta.ohlcvFingerprint).';

/** Hard-fail when referenced prices are outside the loaded bar range (mixed fetches). */
export function rejectGeometryOutsideOhlcvSummary(
	summary: ChartOhlcvSummary,
	prices: number[],
	tolerance = 0.5,
): {ok: true} | {ok: false; reason: string} {
	if (!prices.length) {
		return {ok: true};
	}
	const max = Math.max(...prices);
	const min = Math.min(...prices);
	if (max > summary.high + tolerance) {
		return {
			ok: false,
			reason:
				`Referenced price ${max.toFixed(2)} is above loaded OHLCV high ${summary.high.toFixed(2)}. ${GEOMETRY_MISMATCH_FAIL}`,
		};
	}
	if (min < summary.low - tolerance) {
		return {
			ok: false,
			reason:
				`Referenced price ${min.toFixed(2)} is below loaded OHLCV low ${summary.low.toFixed(2)}. ${GEOMETRY_MISMATCH_FAIL}`,
		};
	}
	return {ok: true};
}

export type OhlcvPipelineInput = {
	toolResult?: unknown;
	executeResult?: unknown;
	fetchResult?: unknown;
	rows?: unknown[];
	allowRowsOnly?: boolean;
};

/** Provenance + per-bar integrity — run before chart prep or analysis. */
export function runOhlcvIntegrityPipeline(
	bars: Record<string, unknown>[],
	input: OhlcvPipelineInput,
): SdkResult<{fingerprint: OhlcvFingerprint | null}> {
	const provenance = rejectRowsOnlyWithoutFetch(input);
	if (!provenance.ok) {
		return provenance;
	}
	const integrity = validateOhlcvBarIntegrity(bars);
	if (!integrity.ok) {
		return {ok: false, reason: integrity.reason};
	}
	return {ok: true, data: {fingerprint: buildOhlcvFingerprint(bars)}};
}
