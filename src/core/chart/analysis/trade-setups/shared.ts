export type TradeSetupSide = 'long' | 'short' | 'neutral';

export type TradeSetupStatus = 'clear' | 'unclear';

export type TradeIdeaCompleteness = 'full' | 'partial' | 'none';

export type AnalysisTradeSetupKind =
	| 'chart_pattern'
	| 'candlestick'
	| 'key_levels'
	| 'key_level_fibonacci'
	| 'momentum'
	| 'divergence'
	| 'trend_structure'
	| 'elliott_waves'
	| 'range_volatility'
	| 'bollinger_bands'
	| 'donchian_breakout'
	| 'supertrend'
	| 'ichimoku'
	| 'z_score'
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
	analyze_divergence: {kind: 'divergence', field: 'divergenceTradeSetup'},
	analyze_trend_structure: {kind: 'trend_structure', field: 'trendStructureTradeSetup'},
	analyze_elliott_waves: {kind: 'elliott_waves', field: 'elliottWaveTradeSetup'},
	analyze_range_volatility: {kind: 'range_volatility', field: 'rangeVolatilityTradeSetup'},
	analyze_bollinger_bands: {kind: 'bollinger_bands', field: 'bollingerTradeSetup'},
	analyze_donchian_breakout: {kind: 'donchian_breakout', field: 'donchianTradeSetup'},
	analyze_supertrend: {kind: 'supertrend', field: 'supertrendTradeSetup'},
	analyze_ichimoku: {kind: 'ichimoku', field: 'ichimokuTradeSetup'},
	analyze_z_score: {kind: 'z_score', field: 'zScoreTradeSetup'},
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
	'divergence',
	'trend_structure',
	'elliott_waves',
	'range_volatility',
	'bollinger_bands',
	'donchian_breakout',
	'supertrend',
	'ichimoku',
	'z_score',
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

/**
 * When entry, target, and invalidation are all present, require strict
 * long: target > entry > invalidation, short: target < entry < invalidation.
 * Callers should pass post-desk-offset prices (entry == invalidation would stop out immediately).
 * Returns an unclearReason string, or undefined when the check does not apply / passes.
 */
export function tradeLevelOrderUnclearReason(input: {
	side: TradeSetupSide;
	entry?: number;
	target?: number;
	invalidation?: number;
}): string | undefined {
	if (input.side !== 'long' && input.side !== 'short') {
		return undefined;
	}
	const entry = input.entry;
	const target = input.target;
	const invalidation = input.invalidation;
	if (
		!isFiniteTradePrice(entry) ||
		!isFiniteTradePrice(target) ||
		!isFiniteTradePrice(invalidation)
	) {
		return undefined;
	}
	if (input.side === 'long') {
		if (!(target > entry && entry > invalidation)) {
			return 'Long setup requires target > entry > invalidation.';
		}
		return undefined;
	}
	if (!(target < entry && entry < invalidation)) {
		return 'Short setup requires target < entry < invalidation.';
	}
	return undefined;
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
