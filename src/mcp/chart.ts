import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import {applyChartDrawings} from '../core/chart/apply-chart-drawings.js';
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
import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import type {SdkResult} from '../core/result.js';
import {camelToSnake, sdkResultToCallToolResult} from './tool-utils.js';

function chartToolResult<T extends {meta?: {warnings?: string[]}}>(
	result: SdkResult<T>,
): CallToolResult {
	const toolResult = sdkResultToCallToolResult(result);
	if (!result.ok || !result.data.meta?.warnings?.length) {
		return toolResult;
	}
	const warningText = result.data.meta.warnings.join('\n');
	const first = toolResult.content[0];
	if (first?.type === 'text') {
		return {
			...toolResult,
			content: [{type: 'text', text: `${warningText}\n${first.text}`}],
		};
	}
	return toolResult;
}

const ApplyChartDrawingsInputSchema = z
	.object({
		title: z.string().trim().min(1).max(256).optional(),
		toolResult: z.unknown().optional(),
		rows: z.array(z.unknown()).min(1).optional(),
		prepareReplay: ChartPrepareReplaySchema.optional(),
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
	.strict();

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

export function registerChartTools(server: McpServer): void {
	server.registerTool(
		camelToSnake('prepareChartFromRows'),
		{
			description:
				'Build a continuum/chart/v1 payload from OHLCV rows returned by any price fetch tool ' +
				'(CoinGecko execute, ctm_*_fetch_ohlcv, coinmarketcap-public get_kline_candles, etc.). ' +
				'REQUIRED: `title` (asset, interval, window) plus `rows` (array) OR `toolResult` (object — pass the full prior MCP JSON object, not a string). ' +
				'After get_kline_candles, pass the entire tool result as `toolResult`. Never `{}`. ' +
				'Adds default EMA(50), RSI(14), and volume pane when rows include volume.',
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
				'List chart analysis types (OHLCV: trend, key levels, momentum, range; ' +
				'time-series: trend, momentum, stats on line-only metrics). ' +
				'Call when the user asks to analyze or interpret data without naming a specific type — ' +
				'then present a numbered text menu from the catalog. Does not render a chart.',
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
				'Structured trend analysis from OHLCV `toolResult` or `rows`: bias, swing high/low, phases, structure. ' +
				'Returns JSON only — does not render a chart. For visuals use calculate_trend_lines + apply_chart_drawings.',
			inputSchema: AnalyzeTrendStructureInputSchema,
			outputSchema: AnalyzeTrendStructureOutputSchema,
		},
		async (input) => sdkResultToCallToolResult(analyzeTrendStructure(input)),
	);

	server.registerTool(
		'analyze_key_levels',
		{
			description:
				'Structured support/resistance analysis from OHLCV. Returns JSON only — not a chart. ' +
				'For on-chart levels use calculate_key_levels + apply_chart_drawings.',
			inputSchema: AnalyzeKeyLevelsInputSchema,
			outputSchema: AnalyzeKeyLevelsOutputSchema,
		},
		async (input) => sdkResultToCallToolResult(analyzeKeyLevels(input)),
	);

	server.registerTool(
		'analyze_momentum',
		{
			description:
				'RSI/MACD momentum analysis from OHLCV closes. Returns JSON only — not a chart.',
			inputSchema: AnalyzeMomentumInputSchema,
			outputSchema: AnalyzeMomentumOutputSchema,
		},
		async (input) => sdkResultToCallToolResult(analyzeMomentum(input)),
	);

	server.registerTool(
		'analyze_range_volatility',
		{
			description:
				'Range, ATR-style volatility, and compression/expansion analysis from OHLCV. Returns JSON only.',
			inputSchema: AnalyzeRangeVolatilityInputSchema,
			outputSchema: AnalyzeRangeVolatilityOutputSchema,
		},
		async (input) => sdkResultToCallToolResult(analyzeRangeVolatility(input)),
	);

	server.registerTool(
		'analyze_candlestick_patterns',
		{
			description:
				'Recognize TA-Lib-style candlestick patterns (doji, hammer, engulfing, morning star, etc.) from OHLCV ' +
				'toolResult or rows. Returns detected pattern names, descriptions, buy/sell/hold recommendation, and confidence. JSON only.',
			inputSchema: AnalyzeCandlestickPatternsInputSchema,
			outputSchema: AnalyzeCandlestickPatternsOutputSchema,
		},
		async (input) => sdkResultToCallToolResult(analyzeCandlestickPatterns(input)),
	);

	server.registerTool(
		'analyze_chart_patterns',
		{
			description:
				'Detect classic multi-bar chart patterns (H&S, doubles, triangles, cup & handle, wedges, flags, etc.) from OHLCV. ' +
				'Returns pattern geometry, 5-level classification (bullish … bearish), and agent-facing interpretation. JSON only.',
			inputSchema: AnalyzeChartPatternsInputSchema,
			outputSchema: AnalyzeChartPatternsOutputSchema,
		},
		async (input) => sdkResultToCallToolResult(analyzeChartPatterns(input)),
	);

	server.registerTool(
		'analyze_time_series_trend',
		{
			description:
				'Trend analysis on line-only time series (`{ time, value }` or tuples). ' +
				'For TVL, fees, index levels, custom metrics — not OHLC candles. Returns JSON only.',
			inputSchema: AnalyzeTimeSeriesTrendInputSchema,
			outputSchema: AnalyzeTimeSeriesTrendOutputSchema,
		},
		async (input) => sdkResultToCallToolResult(analyzeTimeSeriesTrend(input)),
	);

	server.registerTool(
		'analyze_time_series_momentum',
		{
			description:
				'RSI and rate-of-change momentum on line-only time series. Returns JSON only — not a chart.',
			inputSchema: AnalyzeTimeSeriesMomentumInputSchema,
			outputSchema: AnalyzeTimeSeriesMomentumOutputSchema,
		},
		async (input) => sdkResultToCallToolResult(analyzeTimeSeriesMomentum(input)),
	);

	server.registerTool(
		'analyze_time_series_stats',
		{
			description:
				'Min/max/mean, change %, return volatility, and compression on line-only time series. JSON only.',
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
				'Overlay a classic chart pattern on a chart. Pass `prepareReplay` from prior `prepare_chart_from_rows`, ' +
				'OHLCV `toolResult`/`rows`, and the **`drawings` object** from `calculate_chart_pattern_drawings` unchanged ' +
				'(do not copy `pattern.levels` into `horizontalLevels` — neckline kinds are normalized automatically). ' +
				'Alternatively pass `analysis` from `analyze_chart_patterns` (`{ pattern, patterns? }`). ' +
				'JSON strings for `analysis`, `drawings`, and `prepareReplay` are coerced.',
			inputSchema: ApplyChartPatternDrawingsInputSchema,
			outputSchema: PrepareChartOutputSchema,
		},
		async (input) => chartToolResult(applyChartPatternDrawings(input)),
	);

	server.registerTool(
		camelToSnake('applyChartDrawings'),
		{
			description:
				'Update an existing chart with drawing overlays: key levels, pivot points, Fibonacci, trend lines. ' +
				'Pass same `toolResult`/`rows` as the chart plus `prepareReplay` from prior prepare output when available.',
			inputSchema: ApplyChartDrawingsInputSchema,
			outputSchema: PrepareChartOutputSchema,
		},
		async (input) => chartToolResult(applyChartDrawings(input)),
	);
}
