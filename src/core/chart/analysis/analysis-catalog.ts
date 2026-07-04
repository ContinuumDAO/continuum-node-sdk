export type ChartAnalysisCatalog = {
	analyses: Array<{
		id: string;
		label: string;
		description: string;
		analyzeTool: string;
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
				optionalSkill: 'chart-analysis-trend',
				relatedDrawing: {calculateTool: 'calculate_trend_lines', applyField: 'trendLines'},
			},
			{
				id: 'key_levels',
				label: 'Key levels',
				description: 'Ranked support and resistance with distance from last close',
				analyzeTool: 'analyze_key_levels',
				optionalSkill: 'chart-analysis-levels',
				relatedDrawing: {calculateTool: 'calculate_key_levels', applyField: 'horizontalLevels'},
			},
			{
				id: 'momentum',
				label: 'Momentum',
				description: 'RSI and MACD readings, overbought/oversold flags, crossover state',
				analyzeTool: 'analyze_momentum',
				optionalSkill: 'chart-analysis-momentum',
			},
			{
				id: 'range_volatility',
				label: 'Range / volatility',
				description: 'Price range bounds, compression vs expansion, ATR-style stats',
				analyzeTool: 'analyze_range_volatility',
				optionalSkill: 'chart-analysis-range',
			},
		],
		exampleUserPhrases: [
			'interpret this chart',
			'analyze ETH',
			'what does the price action mean',
			'trend analysis',
			'run momentum analysis',
			'which analysis can you do',
		],
	};
}
