/**
 * Elliott Wave types — ported from SmarterSystems/ElliottWavesEngine (MIT).
 * @see https://github.com/SmarterSystems/ElliottWavesEngine
 */

export type EffectiveWaveDegree = 'minor' | 'intermediate' | 'primary';

export type WaveNumber =
	| 'One'
	| 'Two'
	| 'Three'
	| 'Four'
	| 'Five'
	| 'A'
	| 'B'
	| 'C'
	| 'D'
	| 'E'
	| 'W'
	| 'X1'
	| 'Y'
	| 'X2'
	| 'Z';

export type PointType = 'High' | 'Low';

export type PatternType = 'Impulse' | 'Diagonal' | 'ZigZag' | 'Flat' | 'Triangle' | 'Complex';

export type PatternSubType =
	| 'Extended1'
	| 'Extended3'
	| 'Extended5'
	| 'Truncation'
	| 'LeadingDiagonal'
	| 'EndingDiagonal';

export type TrendDirection = 'up' | 'down';

export type ElliottDataStatus = 'ok' | 'insufficient_data';

export type OhlcvBar = {
	index: number;
	timeSec: number;
	open: number;
	high: number;
	low: number;
	close: number;
};

export type PivotPoint = {
	index: number;
	timeSec: number;
	price: number;
	pointType: PointType;
};

export type FibonacciJustification = {
	fibonacciLevel: number;
	deviation: number;
	type: 'Retracement' | 'Extension';
	description: string;
};

export type ProjectionTarget = {
	price: number;
	fibonacciLevel: number;
	probability: number;
};

export type WaveProjection = {
	targets: ProjectionTarget[];
	invalidationPoint: number | null;
};

export type ElliottWave = {
	degree: EffectiveWaveDegree;
	label: WaveNumber;
	startPoint: PivotPoint;
	endPoint: PivotPoint;
	isInProgress: boolean;
	patternType?: PatternType;
	patternSubType?: PatternSubType;
	projection?: WaveProjection;
	justification?: FibonacciJustification | null;
};

export type ElliottWavesAnalysis = {
	waves: ElliottWave[];
	trendDirection: TrendDirection;
	patternType: 'impulse' | 'diagonal' | 'corrective';
	confirmedWaveCount: number;
	inProgressWave?: WaveNumber;
	w0: PivotPoint;
};

export type ElliottWaveKeyLevel = {
	price: number;
	label: string;
	role: 'target' | 'invalidation' | 'pivot';
};

export type ElliottWaveMenuEntry = {
	index: number;
	waveMenuNumber: number;
	degree: EffectiveWaveDegree;
	patternType: 'impulse' | 'diagonal' | 'corrective';
	labels: string[];
	barSpan: {fromTimeSec: number; toTimeSec: number};
	confidence: number;
	isPrimary: boolean;
	keyLevels: ElliottWaveKeyLevel[];
	invalidation?: {price: number; label: string};
};

export type DrawableElliottWave = {
	label: string;
	pointA: {timeSec: number; price: number};
	pointB: {timeSec: number; price: number};
	kind: 'motive' | 'corrective';
	isInProgress: boolean;
};

export type DrawableElliottWaveSet = {
	patternName: string;
	degree: EffectiveWaveDegree;
	patternType: 'impulse' | 'diagonal' | 'corrective';
	waves: DrawableElliottWave[];
	markers: Array<{timeSec: number; price: number; label: string}>;
	levels: Array<{price: number; label: string; kind: 'support' | 'resistance' | 'level'; role?: string}>;
	clipToBarSpan: {fromTimeSec: number; toTimeSec: number};
};
