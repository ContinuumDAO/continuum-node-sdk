import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import {applyChartDrawings, preprocessApplyChartDrawingsInput} from '../core/chart/apply-chart-drawings.js';
import {listChartAnalysisOptions} from '../core/chart/analysis/analysis-catalog.js';
import {
	AnalyzeKeyLevelsInputSchema,
	AnalyzeKeyLevelsOutputSchema,
	AnalyzeKeyLevelFibonacciInputSchema,
	AnalyzeKeyLevelFibonacciOutputSchema,
	AnalyzeMomentumInputSchema,
	AnalyzeMomentumOutputSchema,
	AnalyzeRangeVolatilityInputSchema,
	AnalyzeRangeVolatilityOutputSchema,
	AnalyzeTrendStructureInputSchema,
	AnalyzeTrendStructureOutputSchema,
	analyzeKeyLevels,
	analyzeKeyLevelFibonacci,
	analyzeMomentum,
	analyzeRangeVolatility,
	analyzeTrendStructure,
} from '../core/chart/analysis/analyze-tools.js';
import {
	AnalyzeBollingerBandsInputSchema,
	AnalyzeBollingerBandsOutputSchema,
	analyzeBollingerBands,
} from '../core/chart/analysis/bollinger-analyze-tools.js';
import {
	AnalyzeMovingAveragesInputSchema,
	AnalyzeMovingAveragesOutputSchema,
	analyzeMovingAverages,
} from '../core/chart/analysis/moving-averages-analyze-tools.js';
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
	CalculateChartPatternDrawingsOutputSchema,
	applyChartPatternDrawings,
	calculateChartPatternDrawings,
} from '../core/chart/analysis/chart-patterns-drawings-tools.js';
import {
	ApplyKeyFibDrawingsInputSchema,
	applyKeyFibDrawings,
} from '../core/chart/analysis/key-fib-drawings-tools.js';
import {
	ApplyKeyLevelDrawingsInputSchema,
	applyKeyLevelDrawings,
} from '../core/chart/analysis/key-level-drawings-tools.js';
import {
	ApplyTrendLineDrawingsInputSchema,
	applyTrendLineDrawings,
} from '../core/chart/analysis/trend-line-drawings-tools.js';
import {stripChartPatternAnalysisForMcpApply} from '../core/chart/chart-pattern-session-store.js';
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
import {
	buildOhlcvSessionBindHint,
	getBoundOhlcvFetch,
} from '../core/chart/ohlcv-session-store.js';
import type {PrepareChartOutput} from '../core/chart/schemas.js';
import {getOhlcvSessionKey} from './ohlcv-session-context.js';
import {slimChartCallToolResult} from './ohlcv-session-wrapper.js';
import {slimAnalysisOutputForAgent} from '../core/chart/analysis/analysis-agent-view.js';
import {camelToSnake, mcpStructuredContent, sdkResultToCallToolResult} from './tool-utils.js';

function buildResponsePrefixLines<T extends {meta?: {warnings?: string[]; dataPolicy?: string}}>(
	data: T,
): string[] {
	const prefixLines = [data.meta?.dataPolicy ?? AGENT_OHLCV_DATA_POLICY];
	if (data.meta?.warnings?.length) {
		prefixLines.push(...data.meta.warnings);
	}
	return prefixLines;
}

function attachSessionBindMeta(data: Record<string, unknown>): Record<string, unknown> {
	const sessionKey = getOhlcvSessionKey();
	const bound = getBoundOhlcvFetch(sessionKey);
	const hint = bound ? buildOhlcvSessionBindHint(bound) : undefined;
	if (!hint) {
		return data;
	}
	const meta =
		data.meta && typeof data.meta === 'object' && !Array.isArray(data.meta)
			? {...(data.meta as Record<string, unknown>)}
			: {};
	meta.sessionBind = hint;
	return {...data, meta};
}

function chartToolResult(result: SdkResult<PrepareChartOutput>): CallToolResult {
	if (!result.ok) {
		return sdkResultToCallToolResult(result);
	}
	const prefixText = buildResponsePrefixLines(result.data).join('\n');
	return slimChartCallToolResult(result, prefixText);
}

function analysisToolResult<T extends {meta?: {warnings?: string[]; dataPolicy?: string}; analysis?: unknown}>(
	result: SdkResult<T>,
): CallToolResult {
	if (!result.ok) {
		return sdkResultToCallToolResult(result);
	}
	const prefixText = buildResponsePrefixLines(result.data).join('\n');
	const structured = attachSessionBindMeta(mcpStructuredContent(result.data));
	const slimStructured =
		result.data.analysis && typeof result.data.analysis === 'object'
			? slimAnalysisOutputForAgent({
					analysis: result.data.analysis as Record<string, unknown>,
					meta: structured.meta as Record<string, unknown> | undefined,
				})
			: structured;
	return {
		content: [{type: 'text', text: `${prefixText}\n${JSON.stringify(slimStructured)}`}],
		structuredContent: structured,
	};
}

const ApplyChartDrawingsInputSchema = z.preprocess(
	preprocessApplyChartDrawingsInput,
	z
		.object({
			title: z.string().trim().min(1).max(256).optional(),
			label: z.string().trim().min(1).max(128).optional(),
			ohlcvDigest: z.string().trim().min(1).max(512).optional(),
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

const chartPatternAnalysisMcpSchema = z
	.object({
		pattern: z.record(z.string(), z.unknown()).nullable().optional(),
		patterns: z.array(z.record(z.string(), z.unknown())).optional(),
		primaryPattern: z.record(z.string(), z.unknown()).nullable().optional(),
		highestConfidencePattern: z.record(z.string(), z.unknown()).nullable().optional(),
		patternId: z.string().trim().min(1).max(64).optional(),
		patternIndex: z.number().int().min(0).optional(),
		selectionMode: z.enum(['primary', 'highest_confidence']).optional(),
	})
	.strict()
	.optional();

/** MCP-facing schema: flat object so agents can pass nested `analysis` without preprocess stripping keys. */
const CalculateChartPatternDrawingsMcpInputSchema = z
	.object({
		title: z.string().trim().min(1).max(256).optional(),
		label: z.string().trim().min(1).max(128).optional(),
		ohlcvDigest: z.string().trim().min(1).max(512).optional(),
		toolResult: z.unknown().optional(),
		rows: z.union([z.array(z.unknown()), z.string()]).optional(),
		patternId: z.string().trim().min(1).max(64).optional(),
		patternIndex: z.number().int().min(0).optional(),
		selectionMode: z.enum(['primary', 'highest_confidence']).optional(),
		usePrimary: z.boolean().optional(),
		showVolumeConfirmation: z.boolean().optional(),
		showVolumeProfile: z.boolean().optional(),
		analysis: chartPatternAnalysisMcpSchema,
		patterns: z.array(z.string().trim().min(1).max(64)).optional(),
		focusWindow: z.union([z.literal('last'), z.number().int().min(0)]).optional(),
		minConfidence: z.number().min(0).max(1).optional(),
		swingLookback: z.number().int().min(2).max(20).optional(),
		smoothHeadShoulders: z.boolean().optional(),
		smoothWindow: z.union([z.literal(3), z.literal(5)]).optional(),
		retestTolerancePct: z.number().min(0.01).max(0.5).optional(),
		retestAtrPeriod: z.number().int().min(2).max(50).optional(),
		retestAtrMultiplier: z.number().min(0.1).max(5).optional(),
		mergeLive: z.boolean().optional(),
	})
	.strict();

const ApplyChartPatternDrawingsMcpInputSchema = z.preprocess(
	(raw: unknown) => {
		if (typeof raw !== 'object' || raw == null) {
			return raw;
		}
		const input = {...(raw as Record<string, unknown>)};
		if (input.analysis != null) {
			input.analysis = stripChartPatternAnalysisForMcpApply(input.analysis);
		}
		return input;
	},
	z
	.object({
		title: z.string().trim().min(1).max(256).optional(),
		label: z.string().trim().min(1).max(128).optional(),
		ohlcvDigest: z.string().trim().min(1).max(512).optional(),
		toolResult: z.unknown().optional(),
		rows: z.union([z.array(z.unknown()), z.string()]).optional(),
		prepareReplay: z.union([ChartPrepareReplaySchema, z.string()]).optional(),
		live: z.union([ChartLiveBindingSchema, z.string()]).optional(),
		patternId: z.string().trim().min(1).max(64).optional(),
		patternIndex: z.number().int().min(0).optional(),
		patternNumber: z.number().int().min(1).max(64).optional(),
		selectionMode: z.enum(['primary', 'highest_confidence']).optional(),
		usePrimary: z.boolean().optional(),
		showVolumeConfirmation: z.boolean().optional(),
		showVolumeProfile: z.boolean().optional(),
		pattern: z.record(z.string(), z.unknown()).optional(),
		drawings: z
			.object({
				patternOverlay: z.record(z.string(), z.unknown()),
			})
			.strict()
			.optional(),
		analysis: chartPatternAnalysisMcpSchema,
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
		ohlcvDigest: z.string().trim().min(1).max(512).optional(),
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
	'Analysis only — JSON output, no chart. Follow-ups: `{ title, ohlcvDigest }` from meta.sessionBind (same session). ' +
	'mergeLive:false for historical windows. Quote meta.* and analysis fields only. ' +
	'Never deliver interpretive analysis in prose without calling this tool (or list_chart_analysis_options first). ';

export function registerChartTools(server: McpServer): void {
	server.registerTool(
		camelToSnake('prepareChartFromRows'),
		{
			description:
				'Plotting only — builds continuum/chart/v1 from OHLCV fetch toolResult or rows. ' +
				'First call: pass full fetch object as toolResult. Follow-ups in the same session: `{ title, ohlcvDigest }` from meta.sessionBind — do not re-paste candle JSON. ' +
				'Title must include interval + lookback (e.g. `ETH-PERP 1H — last 7d`). ' +
				'REQUIRED: title plus (toolResult | ohlcvDigest | rows). Never {}.',
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
				'Present this catalog to the operator — do not invent your own analysis menu in prose. ' +
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
				'Structured trend analysis from OHLCV: bias, swing high/low, phases, ranked trendLineMenu (touchCount, score, barSpan). ' +
				'Draw on chart with apply_trend_line_drawings and trendLineNumber from the menu.',
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
				'Nearest support/resistance vs last close: levelMenu, keyLevelsTradeSetup (bounce/rejection, next-level targets only). ' +
				'Draw with apply_key_level_drawings and levelNumber (horizontal line only — no Fib). ' +
				'For Fib 0.618 retrace on outer range, use analyze_key_level_fibonacci.',
			inputSchema: AnalyzeKeyLevelsInputSchema,
			outputSchema: AnalyzeKeyLevelsOutputSchema,
		},
		async (input) => analysisToolResult(await analyzeKeyLevels(input)),
	);

	server.registerTool(
		'analyze_key_level_fibonacci',
		{
			description:
				ANALYSIS_ONLY_PREFIX +
				'Outer concentric key-level Fib range and 0.618 retracement trade setup from the same swing dataset. ' +
				'Draw with apply_key_fib_drawings and fibPairNumber from fibPairs. ' +
				'Set removeFibPair true to clear a Fib range overlay via apply_key_fib_drawings.',
			inputSchema: AnalyzeKeyLevelFibonacciInputSchema,
			outputSchema: AnalyzeKeyLevelFibonacciOutputSchema,
		},
		async (input) => analysisToolResult(await analyzeKeyLevelFibonacci(input)),
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
		'analyze_bollinger_bands',
		{
			description:
				ANALYSIS_ONLY_PREFIX +
				'Bollinger bands and band-to-band fade trade setup from OHLCV or time-series values.',
			inputSchema: AnalyzeBollingerBandsInputSchema,
			outputSchema: AnalyzeBollingerBandsOutputSchema,
		},
		async (input) => analysisToolResult(await analyzeBollingerBands(input)),
	);

	server.registerTool(
		'analyze_moving_averages',
		{
			description:
				ANALYSIS_ONLY_PREFIX +
				'Fast/slow moving average crossover and proximity+retest trade setup from OHLCV (default SMA 50/200).',
			inputSchema: AnalyzeMovingAveragesInputSchema,
			outputSchema: AnalyzeMovingAveragesOutputSchema,
		},
		async (input) => analysisToolResult(await analyzeMovingAverages(input)),
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
				'Present analysis.patternMenu as a numbered list with UTC windows and key levels from tool JSON only. ' +
				'When the operator replies with a menu number or asks to draw/overlay/add a pattern, your next tool call MUST be apply_chart_pattern_drawings with patternNumber — never prose claiming the chart updated.',
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
				'Compute canonical drawingSpec + patternOverlay for a classic pattern from OHLCV. ' +
				'Supports selectionMode (primary | highest_confidence), patternId aliases, patternIndex, or nested analysis.patternId. ' +
				'Follow-ups: `{ title, ohlcvDigest }` from meta.sessionBind. ' +
				'Apply with apply_chart_pattern_drawings (patternOverlay only — no separate trendLines/horizontalLevels).',
			inputSchema: CalculateChartPatternDrawingsMcpInputSchema,
			outputSchema: CalculateChartPatternDrawingsOutputSchema,
		},
		async (input) => sdkResultToCallToolResult(await calculateChartPatternDrawings(input)),
	);

	server.registerTool(
		'apply_chart_pattern_drawings',
		{
			description:
				'Overlay a classic chart pattern on an existing chart. Pass `prepareReplay` + `live` from prior prepare_chart_from_rows (injected in agent chat when bound), ' +
				'`patternNumber` (1-based menu # from analyze_chart_patterns), `patternId`, `selectionMode`, nested `analysis`, or `drawings` from calculate_chart_pattern_drawings, and `{ title, ohlcvDigest }` from meta.sessionBind. ' +
				'Do not call prepare_chart_from_rows again. Do not claim the pattern is drawn until this tool succeeds.',
			inputSchema: ApplyChartPatternDrawingsMcpInputSchema,
			outputSchema: PrepareChartOutputSchema,
		},
		async (input) => chartToolResult(await applyChartPatternDrawings(input)),
	);

	server.registerTool(
		'apply_trend_line_drawings',
		{
			description:
				'Overlay one ranked trend line on an existing chart. Pass `prepareReplay` + `live` from prior prepare_chart_from_rows, ' +
				'`trendLineNumber` (1-based menu # from analyze_trend_structure trendLineMenu), and bound `analysis` with drawableTrendLines. ' +
				'Set removeTrendLine true to remove one line; removeAllTrendLines true to clear all trend overlays. ' +
				'Do not call prepare_chart_from_rows again.',
			inputSchema: ApplyTrendLineDrawingsInputSchema,
			outputSchema: PrepareChartOutputSchema,
		},
		async (input) => chartToolResult(await applyTrendLineDrawings(input)),
	);

	server.registerTool(
		'apply_key_level_drawings',
		{
			description:
				'Overlay nearest key level horizontal line(s) on an existing chart (analyze_key_levels only). ' +
				'Pass levelNumber from levelMenu. Pass `prepareReplay` + `live` from prior prepare_chart_from_rows and bound `analysis`. ' +
				'Set removeLevel or removeAllLevels to clear level horizontals. For Fib ranges use apply_key_fib_drawings.',
			inputSchema: ApplyKeyLevelDrawingsInputSchema,
			outputSchema: PrepareChartOutputSchema,
		},
		async (input) => chartToolResult(await applyKeyLevelDrawings(input)),
	);

	server.registerTool(
		'apply_key_fib_drawings',
		{
			description:
				'Overlay Fibonacci range retracement lines on an existing chart (analyze_key_level_fibonacci only). ' +
				'Pass fibPairNumber from fibPairs — required; never auto-applies primaryFibPair. ' +
				'Draws Fib 0 / 0.618 / 1 only (no nearest Level # horizontals). ' +
				'Pass `prepareReplay` + `live` from prior prepare_chart_from_rows and bound `analysis` with fibPairs. ' +
				'Set removeFibPair or removeAllFibPairs to clear Fib overlays.',
			inputSchema: ApplyKeyFibDrawingsInputSchema,
			outputSchema: PrepareChartOutputSchema,
		},
		async (input) => chartToolResult(await applyKeyFibDrawings(input)),
	);

	server.registerTool(
		camelToSnake('applyChartDrawings'),
		{
			description:
				'Add drawing overlays to an existing chart. Pass `prepareReplay` + `live` from prior prepare_chart_from_rows, ' +
				'calculate_* fields, and `{ title, ohlcvDigest }` from meta.sessionBind. Do not call prepare_chart_from_rows again.',
			inputSchema: ApplyChartDrawingsInputSchema,
			outputSchema: PrepareChartOutputSchema,
		},
		async (input) => chartToolResult(applyChartDrawings(input)),
	);
}
