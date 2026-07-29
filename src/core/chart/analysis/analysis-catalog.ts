export type ChartAnalysisDataKind = 'ohlcv' | 'time_series';

export type ChartAnalysisCatalogEntry = {
	id: string;
	label: string;
	description: string;
	analyzeTool: string;
	dataKind: ChartAnalysisDataKind;
	optionalSkill?: string;
	relatedDrawing?: {calculateTool: string; applyField: string};
};

export type ChartAnalysisCatalog = {
	analyses: ChartAnalysisCatalogEntry[];
	exampleUserPhrases: string[];
};

export type ListChartAnalysisOptionsInput = {
	/** When set, only return analyses that can run on this session data kind. */
	dataKind?: ChartAnalysisDataKind;
};

/** Bollinger accepts OHLCV bars or line-only points. */
const ANALYSES_FOR_BOTH_DATA_KINDS = new Set(['analyze_bollinger_bands']);

export function chartAnalysisMatchesDataKind(
	entry: Pick<ChartAnalysisCatalogEntry, 'analyzeTool' | 'dataKind'>,
	dataKind: ChartAnalysisDataKind | undefined,
): boolean {
	if (!dataKind) {
		return true;
	}
	if (ANALYSES_FOR_BOTH_DATA_KINDS.has(entry.analyzeTool)) {
		return true;
	}
	return entry.dataKind === dataKind;
}

const ALL_CHART_ANALYSES: ChartAnalysisCatalogEntry[] = [
	{
		id: 'trend_structure',
		label: 'Trend structure',
		description: 'Swing phases, higher-high / lower-low structure, bias, key swings',
		analyzeTool: 'analyze_trend_structure',
		dataKind: 'ohlcv',
		optionalSkill: 'chart-analysis-trend',
		relatedDrawing: {calculateTool: 'calculate_trend_lines', applyField: 'trendLines'},
	},
	{
		id: 'elliott_waves',
		label: 'Elliott Wave',
		description:
			'Fibonacci-driven impulse/correction count with projection targets, invalidation, and wave labels',
		analyzeTool: 'analyze_elliott_waves',
		dataKind: 'ohlcv',
		optionalSkill: 'chart-analysis-elliott',
		relatedDrawing: {
			calculateTool: 'calculate_elliott_wave_drawings',
			applyField: 'elliottWavesOverlay',
		},
	},
	{
		id: 'key_levels',
		label: 'Key levels (level to level)',
		description:
			'Closest support below and resistance above last close; bounce/rejection trade (no Fib targets)',
		analyzeTool: 'analyze_key_levels',
		dataKind: 'ohlcv',
		optionalSkill: 'chart-analysis-levels',
		relatedDrawing: {calculateTool: 'calculate_key_levels', applyField: 'horizontalLevels'},
	},
	{
		id: 'key_level_fibonacci',
		label: 'Key level Fibonacci',
		description:
			'Strongest key level below and above last close; 0.618 retracement entry and range-leg targets',
		analyzeTool: 'analyze_key_level_fibonacci',
		dataKind: 'ohlcv',
		optionalSkill: 'chart-analysis-levels',
		relatedDrawing: {calculateTool: 'calculate_key_levels', applyField: 'horizontalLevels'},
	},
	{
		id: 'momentum',
		label: 'Momentum',
		description: 'RSI and MACD readings, overbought/oversold flags, crossover state',
		analyzeTool: 'analyze_momentum',
		dataKind: 'ohlcv',
		optionalSkill: 'chart-analysis-momentum',
	},
	{
		id: 'divergence',
		label: 'Divergence detector',
		description:
			'Regular/hidden RSI and Stochastic RSI divergences; primary long/short with pivot-structure levels',
		analyzeTool: 'analyze_divergence',
		dataKind: 'ohlcv',
		optionalSkill: 'chart-analysis-divergence',
		relatedDrawing: {
			calculateTool: 'calculate_divergence_drawings',
			applyField: 'divergenceOverlay',
		},
	},
	{
		id: 'range_volatility',
		label: 'Range / volatility',
		description: 'Price range bounds, compression vs expansion, ATR-style stats',
		analyzeTool: 'analyze_range_volatility',
		dataKind: 'ohlcv',
		optionalSkill: 'chart-analysis-range',
	},
	{
		id: 'bollinger_bands',
		label: 'Bollinger analysis',
		description:
			'Bollinger bands on OHLCV or line metrics; band-to-band fade trade when price is near an outer band',
		analyzeTool: 'analyze_bollinger_bands',
		dataKind: 'ohlcv',
		optionalSkill: 'chart-analysis-bollinger',
	},
	{
		id: 'donchian_breakout',
		label: 'Donchian breakout',
		description:
			'N-bar high/low channel breakout with retest (default) or immediate entry; period from trade desk (default 20)',
		analyzeTool: 'analyze_donchian_breakout',
		dataKind: 'ohlcv',
		optionalSkill: 'chart-analysis-donchian',
	},
	{
		id: 'supertrend',
		label: 'Supertrend',
		description:
			'ATR trailing Supertrend flip or retest trade; period/multiplier from trade desk (default 10, 3)',
		analyzeTool: 'analyze_supertrend',
		dataKind: 'ohlcv',
		optionalSkill: 'chart-analysis-supertrend',
	},
	{
		id: 'ichimoku',
		label: 'Ichimoku cloud',
		description:
			'Tenkan/Kijun cross and cloud position trade setups; classic 9/26/52/26 from trade desk',
		analyzeTool: 'analyze_ichimoku',
		dataKind: 'ohlcv',
		optionalSkill: 'chart-analysis-ichimoku',
	},
	{
		id: 'z_score',
		label: 'Z-score mean reversion',
		description:
			'Z-score fade when |Z| ≥ entry threshold; target at Z-exit near mean; ATR stop (desk defaults period 20, entry 2, exit 0.5)',
		analyzeTool: 'analyze_z_score',
		dataKind: 'ohlcv',
		optionalSkill: 'chart-analysis-z-score',
	},
	{
		id: 'moving_averages',
		label: 'Moving averages',
		description:
			'Fast/slow MA crossover and proximity+retest trade setups from OHLCV (default SMA 50/200)',
		analyzeTool: 'analyze_moving_averages',
		dataKind: 'ohlcv',
		optionalSkill: 'chart-analysis-moving-averages',
	},
	{
		id: 'candlestick_patterns',
		label: 'Candlestick patterns',
		description:
			'TA-Lib-style pattern recognition (doji, hammer, engulfing, etc.) with buy/sell/hold and confidence',
		analyzeTool: 'analyze_candlestick_patterns',
		dataKind: 'ohlcv',
		optionalSkill: 'chart-analysis-patterns',
	},
	{
		id: 'chart_patterns',
		label: 'Classic chart patterns',
		description:
			'Multi-bar geometry patterns (H&S, doubles, triangles, cup & handle, etc.) with 5-level classification and interpretation',
		analyzeTool: 'analyze_chart_patterns',
		dataKind: 'ohlcv',
		optionalSkill: 'chart-analysis-classic-patterns',
		relatedDrawing: {
			calculateTool: 'calculate_chart_pattern_drawings',
			applyField: 'patternOverlay',
		},
	},
	{
		id: 'time_series_trend',
		label: 'Time-series trend',
		description: 'Direction bias, slope, and value peaks/troughs on line-only metrics',
		analyzeTool: 'analyze_time_series_trend',
		dataKind: 'time_series',
		optionalSkill: 'chart-analysis-time-series',
	},
	{
		id: 'time_series_momentum',
		label: 'Time-series momentum',
		description: 'RSI and rate-of-change on line-only metrics (TVL, fees, index levels)',
		analyzeTool: 'analyze_time_series_momentum',
		dataKind: 'time_series',
		optionalSkill: 'chart-analysis-time-series',
	},
	{
		id: 'time_series_stats',
		label: 'Time-series stats',
		description: 'Min/max/mean, period change %, return volatility, compression',
		analyzeTool: 'analyze_time_series_stats',
		dataKind: 'time_series',
		optionalSkill: 'chart-analysis-time-series',
	},
];

export function listChartAnalysisOptions(
	input: ListChartAnalysisOptionsInput = {},
): ChartAnalysisCatalog {
	const dataKind = input.dataKind;
	const analyses = ALL_CHART_ANALYSES.filter(entry =>
		chartAnalysisMatchesDataKind(entry, dataKind),
	);
	return {
		analyses,
		exampleUserPhrases: [
			'interpret this chart',
			'analyze ETH',
			'what does the price action mean',
			'trend analysis',
			'run momentum analysis',
			'divergence analysis',
			'RSI divergence',
			'candlestick patterns',
			'hammer or doji on this chart',
			'chart patterns',
			'head and shoulders',
			'cup and handle',
			'analyze TVL trend',
			'which analysis can you do',
		],
	};
}
