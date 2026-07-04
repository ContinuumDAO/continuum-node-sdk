import type {PatternCatalogEntry, PatternId} from './types.js';

export const PATTERN_CATALOG: PatternCatalogEntry[] = [
	{
		id: 'doji',
		name: 'Doji',
		description:
			'Open and close are nearly equal, showing indecision; the market may pause or reverse.',
		taLibName: 'CDLDOJI',
		tradeBias: 'neutral',
		baseWeight: 0.25,
		lookback: 10,
	},
	{
		id: 'spinning_top',
		name: 'Spinning Top',
		description:
			'Small body with upper and lower shadows longer than the body; signals indecision between buyers and sellers.',
		taLibName: 'CDLSPINNINGTOP',
		tradeBias: 'neutral',
		baseWeight: 0.25,
		lookback: 10,
	},
	{
		id: 'hammer',
		name: 'Hammer',
		description:
			'Small body at the top of the range with a long lower shadow; often interpreted as bullish reversal after a decline.',
		taLibName: 'CDLHAMMER',
		tradeBias: 'bullish',
		baseWeight: 0.75,
		lookback: 11,
	},
	{
		id: 'hanging_man',
		name: 'Hanging Man',
		description:
			'Hammer-shaped candle appearing after an advance; often interpreted as bearish reversal at highs.',
		taLibName: 'CDLHANGINGMAN',
		tradeBias: 'bearish',
		baseWeight: 0.75,
		lookback: 11,
	},
	{
		id: 'shooting_star',
		name: 'Shooting Star',
		description:
			'Small body near the low with a long upper shadow after a gap up; bearish reversal signal at resistance.',
		taLibName: 'CDLSHOOTINGSTAR',
		tradeBias: 'bearish',
		baseWeight: 0.75,
		lookback: 11,
	},
	{
		id: 'inverted_hammer',
		name: 'Inverted Hammer',
		description:
			'Small body near the low with a long upper shadow after a gap down; potential bullish reversal.',
		taLibName: 'CDLINVERTEDHAMMER',
		tradeBias: 'bullish',
		baseWeight: 0.7,
		lookback: 11,
	},
	{
		id: 'marubozu',
		name: 'Marubozu',
		description:
			'Long body with very little or no shadows; strong directional conviction from open to close.',
		taLibName: 'CDLMARUBOZU',
		tradeBias: 'signal',
		baseWeight: 0.65,
		lookback: 10,
	},
	{
		id: 'long_legged_doji',
		name: 'Long-Legged Doji',
		description:
			'Doji with long upper and/or lower shadows; extreme indecision and potential turning point.',
		taLibName: 'CDLLONGLEGGEDDOJI',
		tradeBias: 'neutral',
		baseWeight: 0.3,
		lookback: 10,
	},
	{
		id: 'dragonfly_doji',
		name: 'Dragonfly Doji',
		description:
			'Doji with open/close at the high and a long lower shadow; often bullish after a selloff.',
		taLibName: 'CDLDRAGONFLYDOJI',
		tradeBias: 'bullish',
		baseWeight: 0.55,
		lookback: 10,
	},
	{
		id: 'gravestone_doji',
		name: 'Gravestone Doji',
		description:
			'Doji with open/close at the low and a long upper shadow; often bearish after a rally.',
		taLibName: 'CDLGRAVESTONEDOJI',
		tradeBias: 'bearish',
		baseWeight: 0.55,
		lookback: 10,
	},
	{
		id: 'engulfing',
		name: 'Engulfing',
		description:
			'Second candle body fully engulfs the prior body with opposite color; strong two-bar reversal signal.',
		taLibName: 'CDLENGULFING',
		tradeBias: 'signal',
		baseWeight: 0.85,
		lookback: 1,
	},
	{
		id: 'harami',
		name: 'Harami',
		description:
			'Small second candle contained within the prior long body; suggests momentum loss and possible reversal.',
		taLibName: 'CDLHARAMI',
		tradeBias: 'signal',
		baseWeight: 0.7,
		lookback: 11,
	},
	{
		id: 'piercing',
		name: 'Piercing Line',
		description:
			'Bullish two-bar pattern: black candle followed by white candle closing above the midpoint of the black body.',
		taLibName: 'CDLPIERCING',
		tradeBias: 'bullish',
		baseWeight: 0.8,
		lookback: 11,
	},
	{
		id: 'dark_cloud_cover',
		name: 'Dark Cloud Cover',
		description:
			'Bearish two-bar pattern: white candle followed by black candle opening above prior high and closing deeply into the white body.',
		taLibName: 'CDLDARKCLOUDCOVER',
		tradeBias: 'bearish',
		baseWeight: 0.8,
		lookback: 11,
	},
	{
		id: 'morning_star',
		name: 'Morning Star',
		description:
			'Three-bar bullish reversal: long black, small gapped body, then strong white close into the first body.',
		taLibName: 'CDLMORNINGSTAR',
		tradeBias: 'bullish',
		baseWeight: 0.9,
		lookback: 12,
	},
	{
		id: 'evening_star',
		name: 'Evening Star',
		description:
			'Three-bar bearish reversal: long white, small gapped body, then strong black close into the first body.',
		taLibName: 'CDLEVENINGSTAR',
		tradeBias: 'bearish',
		baseWeight: 0.9,
		lookback: 12,
	},
	{
		id: 'three_white_soldiers',
		name: 'Three White Soldiers',
		description:
			'Three consecutive bullish candles with higher closes and controlled shadows; strong uptrend continuation or reversal.',
		taLibName: 'CDL3WHITESOLDIERS',
		tradeBias: 'bullish',
		baseWeight: 0.85,
		lookback: 12,
	},
	{
		id: 'three_black_crows',
		name: 'Three Black Crows',
		description:
			'Three consecutive bearish candles with lower closes opening within prior bodies; strong downtrend signal.',
		taLibName: 'CDL3BLACKCROWS',
		tradeBias: 'bearish',
		baseWeight: 0.85,
		lookback: 13,
	},
];

const catalogById = new Map<PatternId, PatternCatalogEntry>(
	PATTERN_CATALOG.map(entry => [entry.id, entry]),
);

export function getPatternCatalogEntry(id: PatternId): PatternCatalogEntry | undefined {
	return catalogById.get(id);
}

export function resolvePatternId(name: string): PatternId | undefined {
	const lower = name.toLowerCase().replace(/-/g, '_');
	if (catalogById.has(lower as PatternId)) {
		return lower as PatternId;
	}
	const byTaLib = PATTERN_CATALOG.find(
		e => e.taLibName.toLowerCase() === lower || e.taLibName.toLowerCase().replace('cdl', '') === lower,
	);
	return byTaLib?.id;
}

export function minBarsRequired(patternIds?: PatternId[]): number {
	const ids = patternIds ?? PATTERN_CATALOG.map(e => e.id);
	let max = 0;
	for (const id of ids) {
		const entry = catalogById.get(id);
		if (entry) {
			max = Math.max(max, entry.lookback + 1);
		}
	}
	return max;
}

export function maxLookback(): number {
	return Math.max(...PATTERN_CATALOG.map(e => e.lookback)) + 1;
}
