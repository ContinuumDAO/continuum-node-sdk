export type TradeSetupSide = 'long' | 'short' | 'neutral';

export type TradeSetupStatus = 'clear' | 'unclear';

export type TradeIdeaCompleteness = 'full' | 'partial' | 'none';

export type AnalysisTradeSetupKind =
	| 'chart_pattern'
	| 'candlestick'
	| 'key_levels'
	| 'key_level_fibonacci'
	| 'momentum'
	| 'trend_structure'
	| 'range_volatility'
	| 'bollinger_bands'
	| 'moving_averages'
	| 'time_series_trend'
	| 'time_series_momentum'
	| 'time_series_stats';

export type NormalizedTradeLevel = {
	price: number;
	label?: string;
};

export const ANALYZE_TOOL_SETUP_FIELDS: Record<
	string,
	{kind: AnalysisTradeSetupKind; field: string}
> = {
	analyze_chart_patterns: {kind: 'chart_pattern', field: 'chartPatternTradeSetup'},
	analyze_candlestick_patterns: {kind: 'candlestick', field: 'candlestickTradeSetup'},
	analyze_key_levels: {kind: 'key_levels', field: 'keyLevelsTradeSetup'},
	analyze_key_level_fibonacci: {kind: 'key_level_fibonacci', field: 'keyLevelFibTradeSetup'},
	analyze_momentum: {kind: 'momentum', field: 'momentumTradeSetup'},
	analyze_trend_structure: {kind: 'trend_structure', field: 'trendStructureTradeSetup'},
	analyze_range_volatility: {kind: 'range_volatility', field: 'rangeVolatilityTradeSetup'},
	analyze_bollinger_bands: {kind: 'bollinger_bands', field: 'bollingerTradeSetup'},
	analyze_moving_averages: {kind: 'moving_averages', field: 'movingAveragesTradeSetup'},
	analyze_time_series_trend: {kind: 'time_series_trend', field: 'timeSeriesTrendTradeSetup'},
	analyze_time_series_momentum: {
		kind: 'time_series_momentum',
		field: 'timeSeriesMomentumTradeSetup',
	},
	analyze_time_series_stats: {kind: 'time_series_stats', field: 'timeSeriesStatsTradeSetup'},
};

export const OHLCV_TIED_ANALYSIS_TYPES = new Set<AnalysisTradeSetupKind>([
	'chart_pattern',
	'candlestick',
	'key_levels',
	'key_level_fibonacci',
	'momentum',
	'trend_structure',
	'range_volatility',
	'bollinger_bands',
	'moving_averages',
]);

export function toolNameForAnalysisKind(kind: AnalysisTradeSetupKind): string {
	for (const [toolName, entry] of Object.entries(ANALYZE_TOOL_SETUP_FIELDS)) {
		if (entry.kind === kind) {
			return toolName;
		}
	}
	return `analyze_${kind}`;
}

export function isFiniteTradePrice(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

export function deriveCompleteness(input: {
	entry?: NormalizedTradeLevel;
	target?: NormalizedTradeLevel;
	invalidation?: NormalizedTradeLevel;
}): TradeIdeaCompleteness {
	const hasEntry = input.entry != null && isFiniteTradePrice(input.entry.price);
	const hasTarget = input.target != null && isFiniteTradePrice(input.target.price);
	const hasInvalidation =
		input.invalidation != null && isFiniteTradePrice(input.invalidation.price);
	if (hasEntry && hasTarget && hasInvalidation) {
		return 'full';
	}
	if (hasEntry) {
		return 'partial';
	}
	return 'none';
}
