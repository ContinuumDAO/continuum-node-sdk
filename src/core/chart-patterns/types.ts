import type {ChartTime} from '../chart/schemas.js';

export type ChartPatternDirection = 'bullish' | 'bearish' | 'neutral';

export type ChartPatternClassification =
	| 'bullish'
	| 'moderately_bullish'
	| 'neutral'
	| 'moderately_bearish'
	| 'bearish';

export type ChartPatternCategory = 'reversal' | 'continuation';

export type ChartPatternId =
	| 'head_and_shoulders'
	| 'inverse_head_and_shoulders'
	| 'double_top'
	| 'double_bottom'
	| 'double_bottom_adam_eve'
	| 'ascending_triangle'
	| 'descending_triangle'
	| 'symmetrical_triangle'
	| 'pennant_bullish'
	| 'pennant_bearish'
	| 'flag_bullish'
	| 'flag_bearish'
	| 'rising_wedge'
	| 'falling_wedge'
	| 'channel_up'
	| 'channel_down'
	| 'cup_and_handle'
	| 'trendline_breakout_bullish'
	| 'trendline_breakout_bearish'
	| 'trendline_breakout_retest_bullish'
	| 'trendline_breakout_retest_bearish';

export type ChartPatternPoint = {
	timeSec: number;
	price: number;
	label?: string;
	role?: string;
};

export type ChartPatternLineKind =
	| 'support'
	| 'resistance'
	| 'neckline'
	| 'boundary'
	| 'flagpole';

export type ChartPatternLine = {
	pointA: ChartPatternPoint;
	pointB: ChartPatternPoint;
	label?: string;
	kind?: ChartPatternLineKind;
};

export type ChartPatternLevel = {
	price: number;
	label?: string;
	kind?: 'support' | 'resistance' | 'neckline' | 'level';
};

export type ChartPatternBarSpan = {
	fromIndex: number;
	toIndex: number;
	fromTimeSec: number;
	toTimeSec: number;
};

export type NormalizedBar = {
	index: number;
	time: ChartTime;
	timeSec: number;
	open: number;
	high: number;
	low: number;
	close: number;
};

export type OrderedSwing = {
	barIndex: number;
	timeSec: number;
	price: number;
	kind: 'support' | 'resistance';
};

export type ChartPatternHit = {
	id: ChartPatternId;
	name: string;
	variant?: string;
	category: ChartPatternCategory;
	direction: ChartPatternDirection;
	confidence: number;
	classification: ChartPatternClassification;
	barSpan: ChartPatternBarSpan;
	points: ChartPatternPoint[];
	lines: ChartPatternLine[];
	levels?: ChartPatternLevel[];
	description: string;
	interpretation: string;
	completionState?: 'forming' | 'completed';
};

export type ChartPatternCatalogEntry = {
	id: ChartPatternId;
	name: string;
	category: ChartPatternCategory;
	direction: ChartPatternDirection;
	minBars: number;
	description: string;
	interpretation: string;
};

export type ScanChartPatternsOptions = {
	patternIds?: ChartPatternId[];
	focusWindow?: 'last' | number;
	minConfidence?: number;
	swingLookback?: number;
	/** Smooth highs/lows before H&S swing detection (default true). */
	smoothHeadShoulders?: boolean;
	/** Savitzky-Golay window for H&S smoothing (3 or 5, default 5). */
	smoothWindow?: 3 | 5;
	/** Retest tolerance as fraction of breakout excursion (default 0.10 = 10%). */
	retestTolerancePct?: number;
	/** ATR period for retest band (default 14). */
	retestAtrPeriod?: number;
	/** ATR multiplier for retest band; combined with excursion as max(excursion, ATR×mult) (default 1). */
	retestAtrMultiplier?: number;
};

export type ChartPatternAnalysis = {
	summary: string;
	classification: ChartPatternClassification | null;
	interpretation: string;
	primaryPattern: {
		id: ChartPatternId;
		name: string;
		classification: ChartPatternClassification;
		confidence: number;
		interpretation: string;
	} | null;
	pattern: ChartPatternHit | null;
	patterns: ChartPatternHit[];
	rationale: string;
};
