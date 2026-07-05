import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import {applyChartDrawings, preprocessApplyChartDrawingsInput} from '../core/chart/apply-chart-drawings.js';
import {listChartAnalysisOptions} from '../core/chart/analysis/analysis-catalog.js';
import {
	AnalyzeKeyLevelsInputSchema,
	AnalyzeKeyLevelsOutputSchema,
	AnalyzeMomentumInputSchema,
	AnalyzeMomentumOutputSchema,
	AnalyzeRangeVolatilityInputSchema,
	AnalyzeRangeVolatilityOutputSchema,
	AnalyzeTrendStructureInputSchema,
	AnalyzeTrendStructureOutputSchema,
	analyzeKeyLevels,
	analyzeMomentum,
	analyzeRangeVolatility,
	analyzeTrendStructure,
} from '../core/chart/analysis/analyze-tools.js';
import {
	AnalyzeCandlestickPatternsInputSchema,
	AnalyzeCandlestickPatternsOutputSchema,
	analyzeCandlestickPatterns,
} from '../core/chart/analysis/candlestick-patterns-tools.js';
import {
	AnalyzeChartPatternsInputSchema,
	AnalyzeChartPatternsOutputSchema,
	analyzeChartPatterns,
} from '../core/chart/analysis/chart-patterns-tools.js';
import {
	ApplyChartPatternDrawingsInputSchema,
	CalculateChartPatternDrawingsInputSchema,
	CalculateChartPatternDrawingsOutputSchema,
	applyChartPatternDrawings,
	calculateChartPatternDrawings,
} from '../core/chart/analysis/chart-patterns-drawings-tools.js';
import {
	AnalyzeTimeSeriesMomentumInputSchema,
	AnalyzeTimeSeriesMomentumOutputSchema,
	AnalyzeTimeSeriesStatsInputSchema,
	AnalyzeTimeSeriesStatsOutputSchema,
	AnalyzeTimeSeriesTrendInputSchema,
	AnalyzeTimeSeriesTrendOutputSchema,
	analyzeTimeSeriesMomentum,
	analyzeTimeSeriesStats,
	analyzeTimeSeriesTrend,
} from '../core/chart/analysis/time-series-analyze-tools.js';
import {listChartCustomizationOptions} from '../core/chart/customization-catalog.js';
import {
	CalculateFibonacciRangeInputSchema,
	CalculateFibonacciRangeOutputSchema,
	CalculateKeyLevelsInputSchema,
	CalculateKeyLevelsOutputSchema,
	CalculatePivotPointsInputSchema,
	CalculatePivotPointsOutputSchema,
	CalculateTrendLinesInputSchema,
	CalculateTrendLinesOutputSchema,
	calculateFibonacciRange,
	calculateKeyLevels,
	calculatePivotPoints,
	calculateTrendLines,
} from '../core/chart/levels/calculate-tools.js';
import {prepareChart} from '../core/chart/prepare.js';
import {
	PrepareChartFromRowsOutputSchema,
	prepareChartFromRows,
} from '../core/chart/prepare-from-rows.js';
import {
	ChartPrepareReplaySchema,
	PrepareChartInputSchema,
	PrepareChartOutputSchema,
} from '../core/chart/schemas.js';
import {ChartFibonacciOverlaySchema} from '../core/chart/overlay-schemas.js';
import {ChartLiveBindingSchema} from '../core/chart/live/schemas.js';
import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import type {SdkResult} from '../core/result.js';
import {AGENT_OHLCV_DATA_POLICY} from '../core/chart/analysis/analysis-meta.js';
import {camelToSnake, sdkResultToCallToolResult} from './tool-utils.js';

function prependMetaWarnings<T extends {meta?: {warnings?: string[]; dataPolicy?: string}}>(
	result: SdkResult<T>,
): CallToolResult {
	const toolResult = sdkResultToCallToolResult(result);
	if (!result.ok) {
		return toolResult;
	}
	const prefixLines = [result.data.meta?.dataPolicy ?? AGENT_OHLCV_DATA_POLICY];
	if (result.data.meta?.warnings?.length) {
		prefixLines.push(...result.data.meta.warnings);
	}
	const warningText = prefixLines.join('\n');
	const first = toolResult.content[0];
	if (first?.type === 'text') {
		return {
			...toolResult,
			content: [{type: 'text', text: `${warningText}\n${first.text}`}],
		};
	}
	return toolResult;
}

function chartToolResult<T extends {meta?: {warnings?: string[]; dataPolicy?: string}}>(
	result: SdkResult<T>,
): CallToolResult {
	return prependMetaWarnings(result);
}

function analysisToolResult<T extends {meta?: {warnings?: string[]; dataPolicy?: string}}>(
	result: SdkResult<T>,
): CallToolResult {
	return prependMetaWarnings(result);
}

const ApplyChartDrawingsInputSchema = z.preprocess(
	preprocessApplyChartDrawingsInput,
	z
		.object({
			title: z.string().trim().min(1).max(256).optional(),
			toolResult: z.unknown().optional(),
			rows: z.array(z.unknown()).min(1).optional(),
			prepareReplay: ChartPrepareReplaySchema.optional(),
			live: ChartLiveBindingSchema.optional(),
			horizontalLevels: z
			.array(
				z
					.object({
						price: z.number(),
						label: z.string().optional(),
						kind: z.enum(['support', 'resistance', 'level']).optional(),
					})
					.strict(),
			)
			.optional(),
		pivotLevels: z
			.array(z.object({id: z.string(), price: z.number()}).strict())
			.optional(),
		fibonacci: ChartFibonacciOverlaySchema.optional(),
		trendLines: z
			.array(
				z
					.object({
						kind: z.enum(['support', 'resistance']),
						pointA: z.object({time: z.number(), price: z.number()}).strict(),
						pointB: z.object({time: z.number(), price: z.number()}).strict(),
						label: z.string().optional(),
					})
					.strict(),
			)
			.optional(),
		removeDrawings: z.boolean().optional(),
	})
	.strict(),
);

/** MCP-facing schema: accept stringified JSON for rows/toolResult; full validation in prepareChartFromRows. */
const PrepareChartFromRowsMcpInputSchema = z
	.object({
		rows: z.union([z.array(z.unknown()), z.string()]).optional(),
		toolResult: z.unknown().optional(),
		title: z.string().trim().min(1).max(256),
		label: z.string().trim().min(1).max(128).optional(),
		height: z.number().int().min(120).max(800).optional(),
		options: z
			.object({
				maxPoints: z.number().int().min(2).max(5_000).optional(),
				bucketSec: z.number().int().min(60).max(86_400 * 7).optional(),
				skipDefaultOverlays: z.boolean().optional(),
				colorVolumeFromCandles: z.boolean().optional(),
			})
			.strict()
			.optional(),
	})
	.strict();

const ANALYSIS_ONLY_PREFIX =
	'Analysis only — returns JSON, never renders a chart. Do NOT call prepare_chart* unless the operator also asked to plot. ' +
	'Merges a live tick into the last bar by default (meta.liveMerge) for current-market requests; set mergeLive:false for historical backtests. ' +
	'Never invent prices — quote meta.ohlcvSummary and analysis fields from this response. ';

export function registerChartTools(server: McpServer): void {
	server.registerTool(
		camelToSnake('prepareChartFromRows'),
		{
			description:
				'Plotting only — builds continuum/chart/v1 from OHLCV fetch toolResult or rows. ' +
				'Do NOT call for analysis-only requests; use analyze_* instead. ' +
				'Pass the **full, unmodified** fetch MCP JSON as toolResult — **never truncate candles** for context window (chart downsamples via maxPoints). ' +
				'Never invent OHLCV in chat — quote meta.ohlcvSummary from the tool response only. ' +
				'Match `title` lookback to fetch params (e.g. title "last 7d" requires lookbackDays: 7). ' +
				'REQUIRED: title plus rows or toolResult. Never {}.',
			inputSchema: PrepareChartFromRowsMcpInputSchema,
			outputSchema: PrepareChartFromRowsOutputSchema,
		},
		async (input) => chartToolResult(prepareChartFromRows(input as Parameters<typeof prepareChartFromRows>[0])),
	);

	server.registerTool(
		camelToSnake('prepareChart'),
		{
			description:
				'Advanced chart builder: multi-series candlestick/line/area/histogram plus overlays (sma, ema, bollinger, ' +
				'fibonacci, rsi, macd, stochasticrsi). For a single OHLCV feed after any fetch tool, prefer ' +
				'`prepare_chart_from_rows` with `rows` or `toolResult`. ' +
				'Shorthand: `bars`, `result`, `candles`, or `toolResult` from a prior fetch. Never `{}`.',
			inputSchema: PrepareChartInputSchema,
			outputSchema: PrepareChartOutputSchema,
		},
		async (input) => sdkResultToCallToolResult(prepareChart(input)),
	);

	server.registerTool(
		'list_chart_analysis_options',
		{
			description:
				'List chart analysis types (OHLCV + time-series). Use for interpret/analyze/outlook prompts without naming a type. ' +
				'After OHLCV fetch, call analyze_* only — do NOT call prepare_chart_from_rows for analysis-only requests. Does not render charts.',
			inputSchema: z.object({}).strict(),
			outputSchema: z.object({
				analyses: z.array(z.record(z.string(), z.unknown())),
				exampleUserPhrases: z.array(z.string()),
			}),
		},
		async () => sdkResultToCallToolResult({ok: true, data: listChartAnalysisOptions()}),
	);

	server.registerTool(
		'analyze_trend_structure',
		{
			description:
				ANALYSIS_ONLY_PREFIX +
				'Structured trend analysis from OHLCV toolResult or rows: bias, swing high/low, phases, structure. ' +
				'For on-chart trend lines: calculate_trend_lines + apply_chart_drawings (separate plot task).',
			inputSchema: AnalyzeTrendStructureInputSchema,
			outputSchema: AnalyzeTrendStructureOutputSchema,
		},
		async (input) => analysisToolResult(await analyzeTrendStructure(input)),
	);

	server.registerTool(
		'analyze_key_levels',
		{
			description:
				ANALYSIS_ONLY_PREFIX +
				'Structured support/resistance analysis from OHLCV. For on-chart levels: calculate_key_levels + apply_chart_drawings.',
			inputSchema: AnalyzeKeyLevelsInputSchema,
			outputSchema: AnalyzeKeyLevelsOutputSchema,
		},
		async (input) => analysisToolResult(await analyzeKeyLevels(input)),
	);

	server.registerTool(
		'analyze_momentum',
		{
			description: ANALYSIS_ONLY_PREFIX + 'RSI/MACD momentum analysis from OHLCV closes.',
			inputSchema: AnalyzeMomentumInputSchema,
			outputSchema: AnalyzeMomentumOutputSchema,
		},
		async (input) => analysisToolResult(await analyzeMomentum(input)),
	);

	server.registerTool(
		'analyze_range_volatility',
		{
			description:
				ANALYSIS_ONLY_PREFIX + 'Range, ATR-style volatility, and compression/expansion from OHLCV.',
			inputSchema: AnalyzeRangeVolatilityInputSchema,
			outputSchema: AnalyzeRangeVolatilityOutputSchema,
		},
		async (input) => analysisToolResult(await analyzeRangeVolatility(input)),
	);

	server.registerTool(
		'analyze_candlestick_patterns',
		{
			description:
				ANALYSIS_ONLY_PREFIX +
				'Recognize TA-Lib-style candlestick patterns (doji, hammer, engulfing, etc.) from OHLCV.',
			inputSchema: AnalyzeCandlestickPatternsInputSchema,
			outputSchema: AnalyzeCandlestickPatternsOutputSchema,
		},
		async (input) => analysisToolResult(await analyzeCandlestickPatterns(input)),
	);

	server.registerTool(
		'analyze_chart_patterns',
		{
			description:
				ANALYSIS_ONLY_PREFIX +
				'Detect classic multi-bar chart patterns (H&S, doubles, triangles, cup & handle, etc.) from OHLCV. ' +
				'For on-chart pattern overlay: calculate_chart_pattern_drawings + apply_chart_pattern_drawings (plot task).',
			inputSchema: AnalyzeChartPatternsInputSchema,
			outputSchema: AnalyzeChartPatternsOutputSchema,
		},
		async (input) => analysisToolResult(await analyzeChartPatterns(input)),
	);

	server.registerTool(
		'analyze_time_series_trend',
		{
			description:
				ANALYSIS_ONLY_PREFIX +
				'Trend analysis on line-only time series (TVL, fees, index levels) — not OHLC candles.',
			inputSchema: AnalyzeTimeSeriesTrendInputSchema,
			outputSchema: AnalyzeTimeSeriesTrendOutputSchema,
		},
		async (input) => sdkResultToCallToolResult(analyzeTimeSeriesTrend(input)),
	);

	server.registerTool(
		'analyze_time_series_momentum',
		{
			description: ANALYSIS_ONLY_PREFIX + 'RSI and rate-of-change on line-only time series.',
			inputSchema: AnalyzeTimeSeriesMomentumInputSchema,
			outputSchema: AnalyzeTimeSeriesMomentumOutputSchema,
		},
		async (input) => sdkResultToCallToolResult(analyzeTimeSeriesMomentum(input)),
	);

	server.registerTool(
		'analyze_time_series_stats',
		{
			description:
				ANALYSIS_ONLY_PREFIX + 'Min/max/mean, change %, volatility, compression on line-only time series.',
			inputSchema: AnalyzeTimeSeriesStatsInputSchema,
			outputSchema: AnalyzeTimeSeriesStatsOutputSchema,
		},
		async (input) => sdkResultToCallToolResult(analyzeTimeSeriesStats(input)),
	);

	server.registerTool(
		'list_chart_customization_options',
		{
			description:
				'List chart **plotting** customization options: indicators, drawing overlays (key levels, pivot points, Fibonacci, trend lines), ' +
				'and remove actions. For analysis without a chart, use list_chart_analysis_options instead.',
			inputSchema: z.object({}).strict(),
			outputSchema: z.object({
				indicators: z.array(z.record(z.string(), z.unknown())),
				drawings: z.array(z.record(z.string(), z.unknown())),
				removeActions: z.array(z.string()),
				currentDefaults: z.record(z.string(), z.number()),
				exampleUserPhrases: z.array(z.string()),
			}),
		},
		async () => sdkResultToCallToolResult({ok: true, data: listChartCustomizationOptions()}),
	);

	server.registerTool(
		'calculate_key_levels',
		{
			description:
				'Compute swing-based support/resistance levels from OHLCV `toolResult` or `rows`. ' +
				'Apply with apply_chart_drawings horizontalLevels.',
			inputSchema: CalculateKeyLevelsInputSchema,
			outputSchema: CalculateKeyLevelsOutputSchema,
		},
		async (input) => sdkResultToCallToolResult(calculateKeyLevels(input)),
	);

	server.registerTool(
		'calculate_pivot_points',
		{
			description:
				'Classic floor pivot points (PP, R1, S1, …) from last bar OHLC in `toolResult` or `rows`. ' +
				'Apply with apply_chart_drawings pivotLevels.',
			inputSchema: CalculatePivotPointsInputSchema,
			outputSchema: CalculatePivotPointsOutputSchema,
		},
		async (input) => sdkResultToCallToolResult(calculatePivotPoints(input)),
	);

	server.registerTool(
		'calculate_fibonacci_range',
		{
			description:
				'Detect swing high/low range for Fibonacci retracements from OHLCV. ' +
				'Apply with apply_chart_drawings fibonacci (highlightLevels default [0.618]).',
			inputSchema: CalculateFibonacciRangeInputSchema,
			outputSchema: CalculateFibonacciRangeOutputSchema,
		},
		async (input) => sdkResultToCallToolResult(calculateFibonacciRange(input)),
	);

	server.registerTool(
		'calculate_trend_lines',
		{
			description:
				'Detect diagonal support/resistance trend lines from swing pivot pairs in OHLCV `toolResult` or `rows`. ' +
				'Apply with apply_chart_drawings trendLines.',
			inputSchema: CalculateTrendLinesInputSchema,
			outputSchema: CalculateTrendLinesOutputSchema,
		},
		async (input) => sdkResultToCallToolResult(calculateTrendLines(input)),
	);

	server.registerTool(
		'calculate_chart_pattern_drawings',
		{
			description:
				'Compute chart overlay geometry for a detected classic pattern from OHLCV. ' +
				'Apply with apply_chart_pattern_drawings patternOverlay.',
			inputSchema: CalculateChartPatternDrawingsInputSchema,
			outputSchema: CalculateChartPatternDrawingsOutputSchema,
		},
		async (input) => sdkResultToCallToolResult(calculateChartPatternDrawings(input)),
	);

	server.registerTool(
		'apply_chart_pattern_drawings',
		{
			description:
				'Overlay a classic chart pattern on an existing chart. Pass **`prepareReplay`** and **`live`** from prior `prepare_chart_from_rows`, ' +
				'the **full, unmodified OHLCV `toolResult`** from the original fetch (keep Hyperliquid **`timestampMs`** — never rewrite `time`), ' +
				'and **`drawings`** from `calculate_chart_pattern_drawings` **or** `analysis` / `patternId` from `analyze_chart_patterns` (geometry is resolved automatically). ' +
				'**Do not call `prepare_chart_from_rows` again** for overlay-only requests — this tool returns the updated chart with pattern lines.',
			inputSchema: ApplyChartPatternDrawingsInputSchema,
			outputSchema: PrepareChartOutputSchema,
		},
		async (input) => chartToolResult(applyChartPatternDrawings(input)),
	);

	server.registerTool(
		camelToSnake('applyChartDrawings'),
		{
			description:
				'Add drawing overlays (trend lines, key levels, Fibonacci, pivots) to an existing chart. ' +
				'Pass **`prepareReplay`** and **`live`** from the prior `prepare_chart_from_rows` output, ' +
				'the **full, unmodified OHLCV `toolResult`** from the original fetch (keep Hyperliquid **`timestampMs`** — never rewrite `time`), ' +
				'and **`trendLines`** / other fields from `calculate_*`. Do not call `prepare_chart_from_rows` again for overlay-only requests.',
			inputSchema: ApplyChartDrawingsInputSchema,
			outputSchema: PrepareChartOutputSchema,
		},
		async (input) => chartToolResult(applyChartDrawings(input)),
	);
}
