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
	buildPatternDrawingSpec,
	drawingSpecToOverlay,
	PATTERN_OVERLAY_STYLE,
} from './drawing-spec.js';
export {enrichChartPatternHit, enrichChartPatternHits} from './pattern-enrich.js';
export {normalizeChartPatternId} from './pattern-id-aliases.js';
export {computeMeasuredMove} from './measured-move.js';
export {
	computeVolumeConfirmation,
	computePatternVolumeProfile,
} from './volume-confirmation.js';
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
	ChartPatternHitSummary,
	ChartPatternId,
	EnrichedChartPatternHit,
	MeasuredMove,
	PatternDrawingSpec,
	PatternMenuEntry,
	ScanChartPatternsOptions,
	VolumeConfirmation,
} from './types.js';
