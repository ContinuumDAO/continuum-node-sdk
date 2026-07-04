export {PATTERN_CATALOG, getPatternCatalogEntry, resolvePatternId, minBarsRequired, maxLookback} from './catalog.js';
export {
	barsToSeries,
	candleAverage,
	candleColor,
	candleRange,
	DEFAULT_CANDLE_SETTINGS,
	realBody,
	upperShadow,
	lowerShadow,
} from './candle-settings.js';
export {DETECTORS} from './patterns/detect.js';
export {buildPatternRecommendation} from './recommendation.js';
export {directionFromSignal, filterPatternIds, scanCandlestickPatterns} from './scan.js';
export type {
	OhlcBar,
	OhlcSeries,
	PatternCatalogEntry,
	PatternHit,
	PatternId,
	PatternRecommendation,
	PatternSignal,
	TradeBias,
} from './types.js';
