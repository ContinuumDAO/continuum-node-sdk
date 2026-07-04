import type {ChartTime} from '../chart/schemas.js';

export type OhlcBar = {
	open: number;
	high: number;
	low: number;
	close: number;
	time?: ChartTime;
};

export type OhlcSeries = {
	open: number[];
	high: number[];
	low: number[];
	close: number[];
};

export type PatternSignal = -100 | -80 | 0 | 80 | 100;

export type TradeBias = 'bullish' | 'bearish' | 'neutral' | 'signal';

export type PatternId =
	| 'doji'
	| 'spinning_top'
	| 'hammer'
	| 'hanging_man'
	| 'shooting_star'
	| 'inverted_hammer'
	| 'marubozu'
	| 'long_legged_doji'
	| 'dragonfly_doji'
	| 'gravestone_doji'
	| 'engulfing'
	| 'harami'
	| 'piercing'
	| 'dark_cloud_cover'
	| 'morning_star'
	| 'evening_star'
	| 'three_white_soldiers'
	| 'three_black_crows';

export type PatternCatalogEntry = {
	id: PatternId;
	name: string;
	description: string;
	taLibName: string;
	tradeBias: TradeBias;
	baseWeight: number;
	lookback: number;
};

export type PatternHit = {
	id: PatternId;
	name: string;
	description: string;
	taLibName: string;
	signal: number;
	direction: 'bullish' | 'bearish' | 'neutral';
	confidence: number;
	barIndex: number;
};

export type PatternRecommendation = {
	recommendation: 'buy' | 'sell' | 'hold';
	recommendationConfidence: number;
	rationale: string;
	primaryPattern: {id: PatternId; name: string; description: string} | null;
};
