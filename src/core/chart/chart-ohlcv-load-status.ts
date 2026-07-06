import {extractOhlcvBarsFromUnknown} from './fetch-result.js';
import {extractLiveBindingFromFetchPayload} from './live/binding-extract.js';
import {inferBarPeriodSec} from './live/merge-tick.js';
import {barTimeSecFromRow, seriesHasTimestampGaps} from './live/bar-merge.js';
import {intervalLabelToBucketSec} from './live/interval.js';
import type {ChartLiveBinding} from './live/schemas.js';
import {
	expectedBarCountFromWindow,
	extractOhlcvFetchWindow,
	type OhlcvFetchWindow,
} from './ohlcv-window.js';
import {normalizeCandleRow} from './point-normalize.js';
import {summarizeOhlcvBars} from './chart-ohlcv-summary.js';
import {AGENT_OHLCV_DATA_POLICY} from './analysis/analysis-meta.js';
import {parseLookbackDaysFromChartTitle, resolveOhlcvFetchContext, resolveOhlcvWindowExpectation, formatWindowExpectation, type OhlcvWindowExpectation} from './ohlcv-window-expectations.js';
import type {PrepareChartOutput} from './schemas.js';

export type ChartOhlcvLoadStatus = {
	dataComplete: boolean;
	liveReady: boolean;
	barCount: number;
	/** Candlestick points rendered (maxPoints cap); may be less than barCount when window is large. */
	displayBarCount: number | null;
	expectedBarCount: number | null;
	windowExpectedBarCount: number | null;
	requestedLookbackDaysFromTitle: number | null;
	actualSpanDays: number | null;
	skippedBarCount: number;
	hasTimestampGaps: boolean;
	liveBindingAttached: boolean;
	liveBindingExpected: boolean;
	dataIssues: string[];
	liveIssues: string[];
	issues: string[];
};

const DATA_RELOAD_PROMPT =
	'Ask the operator whether to re-run the OHLCV fetch with the same parameters, or switch to another data source (provider, symbol, interval, or lookback).';

const LIVE_UNAVAILABLE_PROMPT =
	'If the chart UI shows live price as unavailable, ask whether to re-fetch OHLCV, try another provider, or continue with the static historical chart only.';

const NO_TRUNCATION_PROMPT =
	'Never shorten OHLCV arrays for the MCP context window — pass the complete fetch toolResult unchanged. The chart layer downsamples for display (maxPoints); truncating loses history and misleads the operator.';

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

function ohlcvRecordFromPayloadLocal(payload: unknown): Record<string, unknown> | null {
	if (!payload || typeof payload !== 'object') {
		return null;
	}
	const record = payload as Record<string, unknown>;
	if (record.ohlcv && typeof record.ohlcv === 'object' && !Array.isArray(record.ohlcv)) {
		return record.ohlcv as Record<string, unknown>;
	}
	if ('candles' in record || 'startTimeMs' in record || 'coin' in record || 'symbol' in record) {
		return record;
	}
	return null;
}

function liveBindingExpectedFromPayload(payload: unknown): boolean {
	const ohlcv = ohlcvRecordFromPayloadLocal(payload);
	if (ohlcv) {
		if (typeof ohlcv.coin === 'string' && ohlcv.coin.trim()) {
			return true;
		}
		if (typeof ohlcv.symbol === 'string' && ohlcv.symbol.trim()) {
			return true;
		}
	}
	if (!payload || typeof payload !== 'object') {
		return false;
	}
	const record = payload as Record<string, unknown>;
	if (Array.isArray(record.prices) && record.prices.length > 0) {
		return true;
	}
	return false;
}

function resolveIntervalSec(
	bars: Record<string, unknown>[],
	window: OhlcvFetchWindow | null,
	ohlcv: Record<string, unknown> | null,
): number | null {
	const inferred = inferBarPeriodSec(bars);
	if (inferred != null && inferred > 0) {
		return inferred;
	}
	if (window?.intervalSec != null) {
		return window.intervalSec;
	}
	const intervalRaw = ohlcv?.interval ?? ohlcv?.timeframe;
	if (typeof intervalRaw === 'string' && intervalRaw.trim()) {
		return intervalLabelToBucketSec(intervalRaw.trim());
	}
	return null;
}

function resolveExpectedBarCount(
	ohlcv: Record<string, unknown> | null,
	window: OhlcvFetchWindow | null,
): {expected: number | null; windowExpected: number | null} {
	const declared =
		ohlcv != null ? coerceCount(ohlcv.candleCount ?? ohlcv.expectedBars) : null;
	const windowExpected = window != null ? expectedBarCountFromWindow(window) : null;

	const lookbackDays = ohlcv != null ? coerceCount(ohlcv.lookbackDays) : null;
	const lookbackHours = ohlcv != null ? coerceCount(ohlcv.lookbackHours) : null;
	let fromLookback: number | null = null;
	const intervalSec = window?.intervalSec ?? null;
	if (intervalSec != null && intervalSec > 0) {
		if (lookbackDays != null) {
			fromLookback = Math.ceil((lookbackDays * 86_400) / intervalSec);
		} else if (lookbackHours != null) {
			fromLookback = Math.ceil((lookbackHours * 3_600) / intervalSec);
		}
	}

	const candidates = [declared, windowExpected, fromLookback].filter(
		(n): n is number => n != null && n > 0,
	);
	if (!candidates.length) {
		return {expected: null, windowExpected};
	}
	return {expected: Math.max(...candidates), windowExpected};
}

function actualSpanDaysFromBars(
	bars: Record<string, unknown>[],
	intervalSec: number | null,
): number | null {
	if (bars.length < 1 || intervalSec == null || intervalSec <= 0) {
		return null;
	}
	const firstSec = barTimeSecFromRow(bars[0]!);
	const lastSec = barTimeSecFromRow(bars[bars.length - 1]!);
	if (firstSec == null || lastSec == null) {
		return null;
	}
	return (lastSec - firstSec + intervalSec) / 86_400;
}

function countNormalizableBars(bars: Record<string, unknown>[]): number {
	let count = 0;
	for (const bar of bars) {
		if (normalizeCandleRow(bar)) {
			count += 1;
		}
	}
	return count;
}

function countRawFetchCandles(toolResult: unknown): number | null {
	if (toolResult == null) {
		return null;
	}
	const raw = extractOhlcvBarsFromUnknown(toolResult, {maxPoints: 10_000});
	return raw?.length ?? null;
}

/** Assess whether OHLCV loaded completely and whether live tick updates are likely to work. */
export function assessChartOhlcvLoad(input: {
	bars: Record<string, unknown>[];
	toolResult?: unknown;
	live?: ChartLiveBinding;
	bucketSec?: number;
	title?: string;
}): ChartOhlcvLoadStatus {
	const bars = input.bars;
	const barCount = bars.length;
	const ohlcv = input.toolResult != null ? ohlcvRecordFromPayloadLocal(input.toolResult) : null;
	const window = input.toolResult != null ? extractOhlcvFetchWindow(input.toolResult) : null;
	const {expected: expectedBarCount, windowExpected: windowExpectedBarCount} =
		resolveExpectedBarCount(ohlcv, window);
	const rawFetchCount =
		input.toolResult != null ? countRawFetchCandles(input.toolResult) : null;
	const normalizableCount = countNormalizableBars(bars);
	const skippedBarCount = Math.max(
		0,
		(rawFetchCount ?? barCount) - normalizableCount,
		(rawFetchCount ?? 0) - barCount,
	);

	const intervalSec = resolveIntervalSec(bars, window, ohlcv);
	const hasTimestampGaps =
		intervalSec != null ? seriesHasTimestampGaps(bars, intervalSec) : false;
	const requestedLookbackDaysFromTitle =
		input.title != null ? parseLookbackDaysFromChartTitle(input.title) : null;
	const actualSpanDays = actualSpanDaysFromBars(bars, intervalSec);

	const liveBindingAttached = Boolean(
		input.live ??
			(input.toolResult != null
				? extractLiveBindingFromFetchPayload(input.toolResult, {
						...(input.bucketSec != null ? {bucketSec: input.bucketSec} : {}),
					})
				: undefined),
	);
	const liveBindingExpected =
		input.toolResult != null ? liveBindingExpectedFromPayload(input.toolResult) : false;

	const dataIssues: string[] = [];
	const liveIssues: string[] = [];

	let truncationSuspected = false;

	if (expectedBarCount != null && barCount + 1 < expectedBarCount) {
		dataIssues.push(
			`Incomplete OHLCV: charted ${barCount} bars but ~${expectedBarCount} expected for the fetch window.`,
		);
		truncationSuspected = true;
	}

	if (
		requestedLookbackDaysFromTitle != null &&
		actualSpanDays != null &&
		actualSpanDays + 0.5 < requestedLookbackDaysFromTitle * 0.85
	) {
		dataIssues.push(
			`Chart title requests ~${requestedLookbackDaysFromTitle} day(s) but data spans ~${actualSpanDays.toFixed(1)} day(s) (${barCount} bars). ` +
				`Re-fetch with lookbackDays: ${requestedLookbackDaysFromTitle} (or matching interval/window) and pass the full toolResult.`,
		);
		truncationSuspected = true;
	}

	if (truncationSuspected) {
		dataIssues.push(NO_TRUNCATION_PROMPT);
	}

	if (skippedBarCount > 0) {
		dataIssues.push(
			`${skippedBarCount} candle row(s) could not be parsed — the chart may be missing prices.`,
		);
	}

	if (hasTimestampGaps && intervalSec != null) {
		dataIssues.push(
			`OHLCV timestamp gaps detected (expected every ${intervalSec}s) — the historical series is incomplete.`,
		);
	}

	if (window && intervalSec != null && barCount > 0) {
		const firstSec = barTimeSecFromRow(bars[0]!);
		const lastSec = barTimeSecFromRow(bars[barCount - 1]!);
		const startSec = Math.floor(window.startTimeMs / 1000);
		const endSec = Math.floor(window.endTimeMs / 1000);
		if (firstSec != null && firstSec > startSec + intervalSec * 2) {
			dataIssues.push(
				`First candle is later than the requested fetch window (missing ~${Math.round((firstSec - startSec) / intervalSec)} early bars).`,
			);
		}
		if (lastSec != null && lastSec < endSec - intervalSec * 2) {
			const lagBars = Math.round((endSec - lastSec) / intervalSec);
			dataIssues.push(
				`Last candle is ~${lagBars} bar(s) behind the requested fetch end — recent history may be missing.`,
			);
		}
	}

	const dataComplete = dataIssues.length === 0;
	const liveReady =
		liveBindingAttached &&
		!hasTimestampGaps &&
		skippedBarCount === 0 &&
		(expectedBarCount == null || barCount + 1 >= expectedBarCount) &&
		dataComplete;

	if (liveBindingExpected && !liveBindingAttached) {
		liveIssues.push(
			'Live price updates were expected for this fetch but no tick binding could be attached — chart is static historical data only.',
		);
	}

	if (liveBindingAttached && !liveReady) {
		liveIssues.push(
			'Live price updates may not work on this chart (UI may show live price as unavailable).',
		);
		if (hasTimestampGaps) {
			liveIssues.push('Timestamp gaps in OHLCV can prevent live ticks from merging into the series.');
		}
	}

	return {
		dataComplete,
		liveReady,
		barCount,
		displayBarCount: null,
		expectedBarCount,
		windowExpectedBarCount,
		requestedLookbackDaysFromTitle,
		actualSpanDays,
		skippedBarCount,
		hasTimestampGaps,
		liveBindingAttached,
		liveBindingExpected,
		dataIssues,
		liveIssues,
		issues: [...dataIssues, ...liveIssues],
	};
}

export function formatDisplayDownsampleWarning(
	status: ChartOhlcvLoadStatus,
	windowExpectation?: OhlcvWindowExpectation | null,
): string {
	const windowClause = windowExpectation
		? ` for ${formatWindowExpectation(windowExpectation)}`
		: '';
	return (
		`Full fetch window loaded (${status.barCount} bars${windowClause}); ` +
		`chart displays the newest ${status.displayBarCount} bars (maxPoints). ` +
		'Display downsampling is normal — do not re-fetch at a coarser interval or truncate candles because of payload size.'
	);
}

export function chartLoadAgentWarnings(
	status: ChartOhlcvLoadStatus,
	windowExpectation?: OhlcvWindowExpectation | null,
): string[] {
	const warnings: string[] = [];

	if (status.dataIssues.length > 0) {
		warnings.push(...status.dataIssues);
		warnings.push(
			'Requested OHLCV did not fully load — do not describe this chart as covering the full requested period. ' +
				DATA_RELOAD_PROMPT,
		);
	} else if (
		status.displayBarCount != null &&
		status.barCount > status.displayBarCount &&
		status.dataComplete
	) {
		warnings.push(formatDisplayDownsampleWarning(status, windowExpectation));
	}

	const liveRelevant = status.liveBindingAttached || status.liveBindingExpected;
	if (liveRelevant) {
		if (status.liveIssues.length > 0) {
			warnings.push(...status.liveIssues);
		}
		if (status.liveBindingAttached) {
			warnings.push(
				'Live price binding is attached — the node UI polls for current price separately from the historical fetch. ' +
					'Do not tell the operator live updates are active unless the chart header confirms it. ' +
					LIVE_UNAVAILABLE_PROMPT,
			);
		} else if (status.liveBindingExpected) {
			warnings.push(
				'This data source typically supports live price on charts, but no live binding was attached. ' +
					LIVE_UNAVAILABLE_PROMPT,
			);
		}
	}

	return warnings;
}

export function attachChartLoadMeta(
	output: PrepareChartOutput,
	bars: Record<string, unknown>[],
	options: {
		toolResult?: unknown;
		bucketSec?: number;
		title?: string;
		ohlcvFingerprint?: import('./ohlcv-integrity.js').OhlcvFingerprint | null;
	} = {},
): PrepareChartOutput {
	const statusBase = assessChartOhlcvLoad({
		bars,
		toolResult: options.toolResult,
		live: output.live,
		bucketSec: options.bucketSec,
		title: options.title ?? output.chart.title,
	});
	const candleSeries = output.chart.series.find(s => s.type === 'candlestick');
	const displayBarCount = candleSeries?.data.length ?? null;
	const status: ChartOhlcvLoadStatus = {
		...statusBase,
		displayBarCount,
	};
	const windowExpectation = resolveOhlcvWindowExpectation(
		options.title ?? output.chart.title,
		options.toolResult,
	);
	const loadWarnings = chartLoadAgentWarnings(status, windowExpectation);
	const ohlcvSummary = summarizeOhlcvBars(bars) ?? output.meta?.ohlcvSummary;
	const fetchContext =
		options.toolResult != null ? resolveOhlcvFetchContext(options.toolResult) : null;
	const warnings = [...(output.meta?.warnings ?? []), ...loadWarnings];
	return {
		...output,
		meta: {
			...(output.meta ?? {}),
			...(ohlcvSummary ? {ohlcvSummary} : {}),
			...(fetchContext ? {fetchContext} : {}),
			...(windowExpectation ? {windowExpectation} : {}),
			...(options.ohlcvFingerprint ? {ohlcvFingerprint: options.ohlcvFingerprint} : {}),
			dataPolicy: output.meta?.dataPolicy ?? AGENT_OHLCV_DATA_POLICY,
			...(warnings.length ? {warnings} : {}),
			loadStatus: status,
		},
	};
}

export {parseLookbackDaysFromChartTitle} from './ohlcv-window-expectations.js';
