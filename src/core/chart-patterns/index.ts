export {
	CHART_PATTERN_CATALOG,
	filterChartPatternIds,
	getChartPatternCatalogEntry,
	maxChartPatternMinBars,
	chartPatternsScannedCount,
} from './catalog.js';
export {
	analyzeChartPatternsFromBars,
	scanChartPatterns,
} from './scan.js';
export {
	chartPatternHitToHorizontalLevels,
	chartPatternHitToOverlay,
	chartPatternHitToTrendLines,
	normalizeChartPatternOverlay,
	normalizeHorizontalLevelKind,
	remapOverlayTimesFromBarIndices,
} from './geometry-to-overlay.js';
export {buildChartPatternAnalysis} from './recommendation.js';
export type {
	ChartPatternAnalysis,
	ChartPatternClassification,
	ChartPatternHit,
	ChartPatternId,
	ScanChartPatternsOptions,
} from './types.js';
