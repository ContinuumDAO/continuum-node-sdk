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

export type MeasuredMove = {
	targetPrice: number;
	referencePrice: number;
	height: number;
	direction: 'up' | 'down';
	formula: string;
	status: 'projected' | 'active';
};

export type VolumeConfirmationEvent = {
	barIndex: number;
	timeSec: number;
	role: string;
	volume: number;
	ratioToBaseline: number;
	verdict: 'confirming' | 'neutral' | 'weak';
};

export type VolumeConfirmation = {
	status: 'confirming' | 'mixed' | 'weak' | 'unavailable';
	summary: string;
	baseline: {barCount: number; avgVolume: number};
	events: VolumeConfirmationEvent[];
};

export type PatternDrawingElementStyle = {
	lineStyle?: 'solid' | 'dotted' | 'dashed';
	lineWidth?: number;
	color?: string;
};

export type PatternDrawingElement =
	| {
			kind: 'segment';
			pointA: ChartPatternPoint;
			pointB: ChartPatternPoint;
			label?: string;
			role?: string;
			style?: PatternDrawingElementStyle;
	  }
	| {
			kind: 'level';
			price: number;
			label?: string;
			role?: string;
			span?: ChartPatternBarSpan;
			style?: PatternDrawingElementStyle;
	  }
	| {
			kind: 'marker';
			timeSec: number;
			price: number;
			label?: string;
			role?: string;
			style?: PatternDrawingElementStyle;
	  }
	| {
			kind: 'polyline';
			points: ChartPatternPoint[];
			label?: string;
			role?: string;
			style?: PatternDrawingElementStyle;
	  }
	| {
			kind: 'target';
			price: number;
			label?: string;
			role: 'measured_move';
			status: 'projected' | 'active';
			style?: PatternDrawingElementStyle;
	  };

export type PatternDrawingSpec = {
	version: 1;
	patternId: ChartPatternId;
	barSpan: ChartPatternBarSpan;
	elements: PatternDrawingElement[];
	legend: string[];
};

export type PatternMenuEntry = {
	index: number;
	id: ChartPatternId;
	name: string;
	confidence: number;
	completionState?: 'forming' | 'completed';
	classification: ChartPatternClassification;
	drawable: boolean;
	isPrimary: boolean;
	isHighestConfidence: boolean;
	barSpan: {
		fromTimeSec: number;
		toTimeSec: number;
		barCount: number;
	};
	keyLevels: Array<{
		label: string;
		price: number;
		timeSec?: number;
	}>;
	measuredMove?: PatternMeasuredMoveSummary;
};

export type PatternMeasuredMoveSummary = {
	targetPrice: number;
	referencePrice: number;
	direction: 'up' | 'down';
	status: 'projected' | 'active';
	formula: string;
};

export type ChartPatternHitSummary = {
	id: ChartPatternId;
	name: string;
	classification: ChartPatternClassification;
	confidence: number;
	interpretation: string;
	barSpan: {
		fromTimeSec: number;
		toTimeSec: number;
		barCount: number;
	};
	keyLevels: Array<{
		label: string;
		price: number;
		timeSec?: number;
	}>;
	measuredMove?: PatternMeasuredMoveSummary;
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

export type EnrichedChartPatternHit = ChartPatternHit & {
	drawingSpec: PatternDrawingSpec;
	drawable: boolean;
	measuredMove?: MeasuredMove;
	volumeConfirmation?: VolumeConfirmation;
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
	/** Re-bind trade setup to patternMenu #N from persisted tradeSetupSelection. */
	tradePatternNumber?: number;
};

export type TradeSetupSide = 'long' | 'short' | 'neutral';

export type {ChartPatternTradeSetup} from '../chart/analysis/trade-setups/chart-pattern-trade-setup.js';

export type ChartPatternAnalysis = {
	summary: string;
	classification: ChartPatternClassification | null;
	interpretation: string;
	primaryPattern: ChartPatternHitSummary | null;
	highestConfidencePattern: ChartPatternHitSummary | null;
	patternMenu: PatternMenuEntry[];
	pattern: EnrichedChartPatternHit | null;
	patterns: EnrichedChartPatternHit[];
	rationale: string;
	chartPatternTradeSetup: import('../chart/analysis/trade-setups/chart-pattern-trade-setup.js').ChartPatternTradeSetup | null;
};
