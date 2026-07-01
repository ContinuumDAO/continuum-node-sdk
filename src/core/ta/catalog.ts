import type {InputProfile, OutputKind} from './schemas.js';

export interface IndicatorMeta {
	id: string;
	category: string;
	inputProfile: InputProfile;
	defaultParams: Record<string, number | boolean>;
	outputKind: OutputKind;
	description: string;
	aliases?: string[];
	fnKey: string;
}

function e(
	id: string,
	category: string,
	inputProfile: InputProfile,
	outputKind: OutputKind,
	description: string,
	defaultParams: Record<string, number | boolean> = {},
	aliases?: string[],
	fnKey?: string,
): IndicatorMeta {
	return {
		id,
		category,
		inputProfile,
		defaultParams,
		outputKind,
		description,
		aliases,
		fnKey: fnKey ?? id,
	};
}

const CANDLESTICK = 'candlestick';
const candle = (id: string, description: string) =>
	e(id, CANDLESTICK, 'candle_objects', 'booleans', description);

export const INDICATOR_CATALOG: IndicatorMeta[] = [
	e('sma', 'moving_averages', 'close_series', 'numbers', 'Simple moving average', {
		period: 20,
	}),
	e('ema', 'moving_averages', 'close_series', 'numbers', 'Exponential moving average', {
		period: 20,
	}),
	e('wma', 'moving_averages', 'close_series', 'numbers', 'Weighted moving average', {
		period: 20,
	}),
	e('wema', 'moving_averages', 'close_series', 'numbers', "Wilder's smoothed moving average", {
		period: 20,
	}),
	e('macd', 'moving_averages', 'close_series', 'objects', 'MACD line, signal, and histogram', {
		fastPeriod: 12,
		slowPeriod: 26,
		signalPeriod: 9,
	}),
	e('rsi', 'oscillators', 'close_series', 'numbers', 'Relative strength index', {period: 14}),
	e('cci', 'oscillators', 'ohlc_series', 'numbers', 'Commodity channel index', {period: 20}),
	e(
		'awesomeoscillator',
		'oscillators',
		'ohl_series',
		'numbers',
		'Awesome oscillator from high/low midpoints',
		{fastPeriod: 5, slowPeriod: 34},
	),
	e('roc', 'momentum', 'close_series', 'numbers', 'Rate of change', {period: 12}),
	e(
		'stochastic',
		'momentum',
		'ohlc_series',
		'objects',
		'Stochastic oscillator %K and %D',
		{period: 14, signalPeriod: 3},
	),
	e('williamsr', 'momentum', 'ohlc_series', 'numbers', 'Williams %R', {period: 14}),
	e('trix', 'momentum', 'close_series', 'numbers', 'TRIX momentum oscillator', {period: 18}),
	e(
		'stochasticrsi',
		'momentum',
		'close_series',
		'objects',
		'Stochastic RSI',
		{rsiPeriod: 14, stochasticPeriod: 14, kPeriod: 3, dPeriod: 3},
	),
	e('psar', 'momentum', 'ohlc_series', 'objects', 'Parabolic SAR', {
		step: 0.02,
		max: 0.2,
	}),
	e('kst', 'momentum', 'close_series', 'objects', 'Know Sure Thing oscillator'),
	e(
		'ultimateoscillator',
		'momentum',
		'ohlc_series',
		'numbers',
		'Ultimate oscillator',
		{shortPeriod: 7, mediumPeriod: 14, longPeriod: 28},
	),
	e('dpo', 'momentum', 'close_series', 'numbers', 'Detrended price oscillator', {
		period: 20,
	}),
	e(
		'priceoscillator',
		'momentum',
		'close_series',
		'numbers',
		'Price oscillator',
		{fastPeriod: 12, slowPeriod: 26},
	),
	e('ppo', 'momentum', 'close_series', 'numbers', 'Percentage price oscillator', {
		fastPeriod: 12,
		slowPeriod: 26,
	}),
	e('obv', 'volume', 'close_volume_series', 'numbers', 'On-balance volume'),
	e('adl', 'volume', 'hlcv_series', 'numbers', 'Accumulation/distribution line'),
	e('vwap', 'volume', 'hlcv_series', 'numbers', 'Volume weighted average price'),
	e('forceindex', 'volume', 'close_volume_series', 'numbers', 'Force index', {period: 13}),
	e('mfi', 'volume', 'hlcv_series', 'numbers', 'Money flow index', {period: 14}),
	e(
		'volumeprofile',
		'volume',
		'ohlcv_series',
		'objects',
		'Volume profile by price range',
		{noOfBars: 12},
	),
	e('bollingerbands', 'volatility', 'close_series', 'objects', 'Bollinger bands', {
		period: 20,
		stdDev: 2,
	}),
	e('atr', 'volatility', 'ohlc_series', 'numbers', 'Average true range', {period: 14}),
	e(
		'keltnerchannel',
		'volatility',
		'ohlc_series',
		'objects',
		'Keltner channels',
		{period: 20, multiplier: 2},
		['keltnerchannels'],
	),
	e(
		'chandelierexit',
		'volatility',
		'ohlc_series',
		'objects',
		'Chandelier exit stop levels',
		{period: 22, multiplier: 3},
	),
	e(
		'donchianchannels',
		'volatility',
		'ohlc_series',
		'objects',
		'Donchian channels',
		{period: 20},
	),
	e(
		'volatilityindex',
		'volatility',
		'ohlc_series',
		'numbers',
		'Volatility index',
		{period: 14},
	),
	e('truerange', 'directional', 'ohlc_series', 'numbers', 'True range'),
	e('adx', 'directional', 'ohlc_series', 'numbers', 'Average directional index', {period: 14}),
	e('plusdm', 'directional', 'ohlc_series', 'numbers', 'Plus directional movement', {
		period: 14,
	}),
	e('minusdm', 'directional', 'ohlc_series', 'numbers', 'Minus directional movement', {
		period: 14,
	}),
	e(
		'ichimokukinkouhyou',
		'trend',
		'ohlc_series',
		'objects',
		'Ichimoku cloud',
		{conversionPeriod: 9, basePeriod: 26, spanPeriod: 52, displacement: 26},
		['ichimokucloud'],
	),
	e('supertrend', 'trend', 'ohlc_series', 'objects', 'SuperTrend indicator', {
		period: 10,
		multiplier: 3,
	}),
	e('aroon', 'trend', 'ohlc_series', 'objects', 'Aroon up/down', {period: 14}),
	e('aroonoscillator', 'trend', 'ohlc_series', 'numbers', 'Aroon oscillator', {
		period: 14,
	}),
	e('linearregression', 'trend', 'close_series', 'objects', 'Linear regression trend line', {
		period: 14,
	}),
	e('maenvelope', 'trend', 'close_series', 'objects', 'Moving average envelope', {
		period: 20,
	}),
	e('pivotpoints', 'trend', 'ohlc_series', 'objects', 'Classic pivot points'),
	candle('doji', 'Doji candlestick pattern'),
	candle('bullishengulfingpattern', 'Bullish engulfing pattern'),
	candle('bearishengulfingpattern', 'Bearish engulfing pattern'),
	candle('hammer', 'Hammer pattern'),
	candle('hangingman', 'Hanging man pattern'),
	candle('shootingstar', 'Shooting star pattern'),
	candle('spinningtop', 'Spinning top pattern'),
	candle('marubozu', 'Marubozu pattern'),
	candle('dragonflydoji', 'Dragonfly doji pattern'),
	candle('gravestonedoji', 'Gravestone doji pattern'),
	candle('threewhitesoldiers', 'Three white soldiers pattern'),
	candle('threeblackcrows', 'Three black crows pattern'),
	candle('bullishharami', 'Bullish harami pattern'),
	candle('bearishharami', 'Bearish harami pattern'),
	candle('piercingline', 'Piercing line pattern'),
	candle('darkcloudcover', 'Dark cloud cover pattern'),
	candle('morningstar', 'Morning star pattern'),
	candle('eveningstar', 'Evening star pattern'),
	candle('tweezerbottom', 'Tweezer bottom pattern'),
	candle('tweezertop', 'Tweezer top pattern'),
	candle('abandonedbaby', 'Abandoned baby pattern'),
	candle('bullishmarubozu', 'Bullish marubozu pattern'),
	candle('bearishmarubozu', 'Bearish marubozu pattern'),
	candle('bullishinvertedhammer', 'Bullish inverted hammer pattern'),
	candle('bearishinvertedhammer', 'Bearish inverted hammer pattern'),
	candle('morningdojistar', 'Morning doji star pattern'),
	candle('eveningdojistar', 'Evening doji star pattern'),
	candle('downsidetasukigap', 'Downside tasuki gap pattern'),
	candle('bullishspinningtop', 'Bullish spinning top pattern'),
	candle('bearishspinningtop', 'Bearish spinning top pattern'),
	candle('bullish', 'Generic bullish pattern'),
	candle('bearish', 'Generic bearish pattern'),
	candle('bullishharamicross', 'Bullish harami cross pattern'),
	candle('bearishharamicross', 'Bearish harami cross pattern'),
	candle('hammerpatternunconfirmed', 'Unconfirmed hammer pattern'),
	candle('hangingmanunconfirmed', 'Unconfirmed hanging man pattern'),
	candle('shootingstarunconfirmed', 'Unconfirmed shooting star pattern'),
	candle('bullishhammerstick', 'Bullish hammer stick pattern'),
	candle('bearishhammerstick', 'Bearish hammer stick pattern'),
	e(
		'heikinashi',
		'chart',
		'candle_objects',
		'objects',
		'Heikin-Ashi transformed candles',
	),
	e('renko', 'chart', 'special', 'objects', 'Renko bricks from candles', {brickSize: 1}),
	e('typicalprice', 'chart', 'ohlc_series', 'numbers', 'Typical price (HLC/3)'),
	e(
		'fibonacci',
		'drawing',
		'range_scalar',
		'levels',
		'Fibonacci retracement levels',
		{},
		['fibonacciretracement'],
	),
	e(
		'fibonacciExtensions',
		'drawing',
		'range_scalar',
		'levels',
		'Fibonacci extension levels',
	),
	e(
		'fibonacciProjection',
		'drawing',
		'special',
		'levels',
		'Fibonacci projection from swing points',
	),
	e('highest', 'utility', 'close_series', 'numbers', 'Highest value over period', {
		period: 14,
	}),
	e('lowest', 'utility', 'close_series', 'numbers', 'Lowest value over period', {
		period: 14,
	}),
	e('sum', 'utility', 'close_series', 'numbers', 'Rolling sum', {period: 14}),
	e('sd', 'utility', 'close_series', 'numbers', 'Rolling standard deviation', {
		period: 14,
	}),
	e('averagegain', 'utility', 'close_series', 'numbers', 'Average gain over period', {
		period: 14,
	}),
	e('averageloss', 'utility', 'close_series', 'numbers', 'Average loss over period', {
		period: 14,
	}),
	e('crossup', 'utility', 'dual_series', 'booleans', 'Cross up detector'),
	e('crossdown', 'utility', 'dual_series', 'booleans', 'Cross down detector'),
];

const catalogById = new Map<string, IndicatorMeta>();
const aliasToId = new Map<string, string>();

for (const meta of INDICATOR_CATALOG) {
	catalogById.set(meta.id, meta);
	for (const alias of meta.aliases ?? []) {
		aliasToId.set(alias.toLowerCase(), meta.id);
	}
}

export function resolveIndicatorId(name: string): string | undefined {
	const lower = name.toLowerCase();
	if (catalogById.has(lower)) {
		return lower;
	}
	const alias = aliasToId.get(lower);
	if (alias) {
		return alias;
	}
	return undefined;
}

export function getIndicatorMeta(id: string): IndicatorMeta | undefined {
	return catalogById.get(id);
}

export function listIndicatorCatalog(): IndicatorMeta[] {
	return INDICATOR_CATALOG;
}

export function suggestIndicator(name: string): string | undefined {
	const resolved = resolveIndicatorId(name);
	if (resolved) {
		return resolved;
	}
	const lower = name.toLowerCase();
	const candidates = INDICATOR_CATALOG.flatMap(meta => [
		meta.id,
		...(meta.aliases ?? []),
	]);
	const prefix = candidates.filter(id => id.toLowerCase().startsWith(lower));
	if (prefix.length >= 1) {
		const best = [...prefix].sort(
			(a, b) => a.length - b.length || a.localeCompare(b),
		)[0]!;
		return resolveIndicatorId(best) ?? best;
	}
	const contains = candidates.filter(id => id.toLowerCase().includes(lower));
	if (contains.length === 1) {
		return resolveIndicatorId(contains[0]!) ?? contains[0];
	}
	return undefined;
}

export function catalogEntryForList(meta: IndicatorMeta) {
	return {
		id: meta.id,
		aliases: meta.aliases,
		category: meta.category,
		inputProfile: meta.inputProfile,
		defaultParams: meta.defaultParams,
		outputKind: meta.outputKind,
		description: meta.description,
	};
}
