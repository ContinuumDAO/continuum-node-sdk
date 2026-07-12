export type ChartAnalysisDataKind = 'ohlcv' | 'time_series';

export type ChartAnalysisCatalog = {
	analyses: Array<{
		id: string;
		label: string;
		description: string;
		analyzeTool: string;
		dataKind: ChartAnalysisDataKind;
		optionalSkill?: string;
		relatedDrawing?: {calculateTool: string; applyField: string};
	}>;
	exampleUserPhrases: string[];
};

export function listChartAnalysisOptions(): ChartAnalysisCatalog {
	return {
		analyses: [
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
					'Outer concentric swing range; 0.618 retracement entry and range-leg targets',
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
		],
		exampleUserPhrases: [
			'interpret this chart',
			'analyze ETH',
			'what does the price action mean',
			'trend analysis',
			'run momentum analysis',
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
