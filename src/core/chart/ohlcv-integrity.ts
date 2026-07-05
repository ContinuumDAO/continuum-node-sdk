import {z} from 'zod';
import type {SdkResult} from '../result.js';
import type {ChartOhlcvSummary} from './chart-ohlcv-summary.js';
import {summarizeOhlcvBars} from './chart-ohlcv-summary.js';
import {normalizeCandleRow, parseChartTimeFromRow} from './point-normalize.js';

/** Upper/lower wick larger than this multiple of body → corrupt composite bar (e.g. stale body + live high). */
const MAX_WICK_TO_BODY_RATIO = 12;

/** Single-bar range larger than this × median range → outlier / mixed feed. */
const OUTLIER_RANGE_MULTIPLIER = 4;

const MIN_BARS_FOR_OUTLIER = 8;

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

function candleIssues(
	open: number,
	high: number,
	low: number,
	close: number,
	medianRange: number | null,
): string[] {
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

	const body = Math.abs(close - open);
	const mid = (open + close) / 2;
	const minBody = Math.max(mid * 1e-4, 1e-6);
	const upperWick = high - Math.max(open, close);
	const lowerWick = Math.min(open, close) - low;

	if (body >= minBody) {
		if (upperWick > body * MAX_WICK_TO_BODY_RATIO) {
			issues.push(
				`upper wick (${upperWick.toFixed(2)}) is ${(upperWick / body).toFixed(0)}× body — likely mixed/corrupt OHLC`,
			);
		}
		if (lowerWick > body * MAX_WICK_TO_BODY_RATIO) {
			issues.push(
				`lower wick (${lowerWick.toFixed(2)}) is ${(lowerWick / body).toFixed(0)}× body — likely mixed/corrupt OHLC`,
			);
		}
	}

	const range = high - low;
	if (medianRange != null && medianRange > 0 && range > medianRange * OUTLIER_RANGE_MULTIPLIER) {
		issues.push(
			`range ${range.toFixed(2)} is ${(range / medianRange).toFixed(1)}× the series median — outlier / mixed feed`,
		);
	}

	return issues;
}

function medianBarRange(candles: Array<{high: number; low: number}>): number | null {
	if (candles.length < MIN_BARS_FOR_OUTLIER) {
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

	for (const bar of normalized) {
		const issues = candleIssues(bar.open, bar.high, bar.low, bar.close, medianRange);
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
