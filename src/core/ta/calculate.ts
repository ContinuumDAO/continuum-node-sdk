import {createRequire} from 'node:module';
import type {SdkResult} from '../result.js';
import {
	catalogEntryForList,
	getIndicatorMeta,
	listIndicatorCatalog,
	type IndicatorMeta,
	resolveIndicatorId,
	suggestIndicator,
} from './catalog.js';
import {normalizeInput, type NormalizedSeries} from './normalize-input.js';
import type {CalculateTechnicalIndicatorInput} from './schemas.js';

const require = createRequire(import.meta.url);
const ti = require('fast-technical-indicators') as typeof import('fast-technical-indicators');

type TiFn = (input: Record<string, unknown>) => unknown;

function asTiFn(fn: (...args: never[]) => unknown): TiFn {
	return fn as unknown as TiFn;
}

const FN_MAP: Record<string, TiFn> = {
	sma: asTiFn(ti.sma),
	ema: asTiFn(ti.ema),
	wma: asTiFn(ti.wma),
	wema: asTiFn(ti.wema),
	macd: asTiFn(ti.macd),
	rsi: asTiFn(ti.rsi),
	cci: asTiFn(ti.cci),
	awesomeoscillator: asTiFn(ti.awesomeoscillator),
	roc: asTiFn(ti.roc),
	stochastic: asTiFn(ti.stochastic),
	williamsr: asTiFn(ti.williamsr),
	trix: asTiFn(ti.trix),
	stochasticrsi: asTiFn(ti.stochasticrsi),
	psar: asTiFn(ti.psar),
	kst: asTiFn(ti.kst),
	ultimateoscillator: asTiFn(ti.ultimateoscillator),
	dpo: asTiFn(ti.dpo),
	priceoscillator: asTiFn(ti.priceoscillator),
	ppo: asTiFn(ti.ppo),
	obv: asTiFn(ti.obv),
	adl: asTiFn(ti.adl),
	vwap: asTiFn(ti.vwap),
	forceindex: asTiFn(ti.forceindex),
	mfi: asTiFn(ti.mfi),
	volumeprofile: asTiFn(ti.volumeprofile),
	bollingerbands: asTiFn(ti.bollingerbands),
	atr: asTiFn(ti.atr),
	keltnerchannel: asTiFn(ti.keltnerchannel),
	chandelierexit: asTiFn(ti.chandelierexit),
	donchianchannels: asTiFn(ti.donchianchannels),
	volatilityindex: asTiFn(ti.volatilityindex),
	truerange: asTiFn(ti.truerange),
	adx: asTiFn(ti.adx),
	plusdm: asTiFn(ti.plusdm),
	minusdm: asTiFn(ti.minusdm),
	ichimokukinkouhyou: asTiFn(ti.ichimokukinkouhyou),
	supertrend: asTiFn(ti.supertrend),
	aroon: asTiFn(ti.aroon),
	aroonoscillator: asTiFn(ti.aroonoscillator),
	linearregression: asTiFn(ti.linearregression),
	maenvelope: asTiFn(ti.maenvelope),
	pivotpoints: asTiFn(ti.pivotpoints),
	doji: asTiFn(ti.doji),
	bullishengulfingpattern: asTiFn(ti.bullishengulfingpattern),
	bearishengulfingpattern: asTiFn(ti.bearishengulfingpattern),
	hammer: asTiFn(ti.hammer),
	hangingman: asTiFn(ti.hangingman),
	shootingstar: asTiFn(ti.shootingstar),
	spinningtop: asTiFn(ti.spinningtop),
	marubozu: asTiFn(ti.marubozu),
	dragonflydoji: asTiFn(ti.dragonflydoji),
	gravestonedoji: asTiFn(ti.gravestonedoji),
	threewhitesoldiers: asTiFn(ti.threewhitesoldiers),
	threeblackcrows: asTiFn(ti.threeblackcrows),
	bullishharami: asTiFn(ti.bullishharami),
	bearishharami: asTiFn(ti.bearishharami),
	piercingline: asTiFn(ti.piercingline),
	darkcloudcover: asTiFn(ti.darkcloudcover),
	morningstar: asTiFn(ti.morningstar),
	eveningstar: asTiFn(ti.eveningstar),
	tweezerbottom: asTiFn(ti.tweezerbottom),
	tweezertop: asTiFn(ti.tweezertop),
	abandonedbaby: asTiFn(ti.abandonedbaby),
	bullishmarubozu: asTiFn(ti.bullishmarubozu),
	bearishmarubozu: asTiFn(ti.bearishmarubozu),
	bullishinvertedhammer: asTiFn(ti.bullishinvertedhammer),
	bearishinvertedhammer: asTiFn(ti.bearishinvertedhammer),
	morningdojistar: asTiFn(ti.morningdojistar),
	eveningdojistar: asTiFn(ti.eveningdojistar),
	downsidetasukigap: asTiFn(ti.downsidetasukigap),
	bullishspinningtop: asTiFn(ti.bullishspinningtop),
	bearishspinningtop: asTiFn(ti.bearishspinningtop),
	bullish: asTiFn(ti.bullish),
	bearish: asTiFn(ti.bearish),
	bullishharamicross: asTiFn(ti.bullishharamicross),
	bearishharamicross: asTiFn(ti.bearishharamicross),
	hammerpatternunconfirmed: asTiFn(ti.hammerpatternunconfirmed),
	hangingmanunconfirmed: asTiFn(ti.hangingmanunconfirmed),
	shootingstarunconfirmed: asTiFn(ti.shootingstarunconfirmed),
	bullishhammerstick: asTiFn(ti.bullishhammerstick),
	bearishhammerstick: asTiFn(ti.bearishhammerstick),
	heikinashi: asTiFn(ti.heikinashi),
	renko: asTiFn(ti.renko),
	typicalprice: asTiFn(ti.typicalprice),
	fibonacci: asTiFn(ti.fibonacci),
	fibonacciExtensions: asTiFn(ti.fibonacciExtensions),
	fibonacciProjection: asTiFn(ti.fibonacciProjection),
	highest: asTiFn(ti.highest),
	lowest: asTiFn(ti.lowest),
	sum: asTiFn(ti.sum),
	sd: asTiFn(ti.sd),
	averagegain: asTiFn(ti.averageGain),
	averageloss: asTiFn(ti.averageLoss),
	crossup: asTiFn(ti.crossUp),
	crossdown: asTiFn(ti.crossDown),
};

function countWarmup(result: unknown[]): number {
	for (let i = 0; i < result.length; i++) {
		const item = result[i];
		if (item === undefined || item === null) {
			continue;
		}
		if (typeof item === 'number' && Number.isNaN(item)) {
			continue;
		}
		if (typeof item === 'object') {
			const obj = item as Record<string, unknown>;
			const values = Object.values(obj);
			if (values.length === 0 || values.every(v => v === undefined || v === null)) {
				continue;
			}
		}
		return i;
	}
	return result.length;
}

function computeWarmupCount(result: unknown[], inputLength: number): number {
	const leading = countWarmup(result);
	if (leading > 0 && leading < result.length) {
		return leading;
	}
	if (result.length > 0 && result.length <= inputLength) {
		return inputLength - result.length;
	}
	return leading;
}

function sanitizeResult(raw: unknown): unknown[] {
	if (!Array.isArray(raw)) {
		return [raw];
	}
	return raw.map(item => {
		if (typeof item !== 'object' || item === null) {
			return item;
		}
		return JSON.parse(JSON.stringify(item)) as Record<string, unknown>;
	});
}

function buildLibraryInput(
	meta: IndicatorMeta,
	normalized: NormalizedSeries,
	params: Record<string, number | boolean>,
): Record<string, unknown> {
	const base = {...params};

	switch (meta.inputProfile) {
		case 'close_series':
			return {...base, values: normalized.values};
		case 'ohl_series':
			return {...base, high: normalized.high, low: normalized.low};
		case 'ohlc_series':
			return {
				...base,
				high: normalized.high,
				low: normalized.low,
				close: normalized.close,
			};
		case 'hlcv_series':
			return {
				...base,
				high: normalized.high,
				low: normalized.low,
				close: normalized.close,
				volume: normalized.volume,
			};
		case 'close_volume_series':
			return {...base, close: normalized.close, volume: normalized.volume};
		case 'ohlcv_series':
			return {
				...base,
				open: normalized.open,
				high: normalized.high,
				low: normalized.low,
				close: normalized.close,
				volume: normalized.volume,
			};
		case 'candle_objects':
			return {candles: normalized.candles};
		case 'range_scalar':
			return {...base, ...normalized.range};
		case 'dual_series':
			return {lineA: normalized.lineA, lineB: normalized.lineB};
		case 'special':
			if (meta.id === 'renko') {
				return {candles: normalized.candles, brickSize: base.brickSize ?? 1};
			}
			if (meta.id === 'fibonacciProjection') {
				return {
					prices: normalized.prices,
					swingPoints: normalized.swingPoints,
				};
			}
			throw new Error(`Unhandled special indicator: ${meta.id}`);
		default:
			throw new Error(`Unhandled input profile for ${meta.id}`);
	}
}

export function listTechnicalIndicators(): SdkResult<{
	indicators: ReturnType<typeof catalogEntryForList>[];
}> {
	return {
		ok: true,
		data: {
			indicators: listIndicatorCatalog().map(catalogEntryForList),
		},
	};
}

export function calculateTechnicalIndicator(
	input: CalculateTechnicalIndicatorInput,
): SdkResult<{
	indicator: string;
	params: Record<string, unknown>;
	inputLength: number;
	outputLength: number;
	warmupCount: number;
	result: number[] | Array<Record<string, unknown>> | boolean[];
}> {
	const resolvedId = resolveIndicatorId(input.indicator);
	if (!resolvedId) {
		const suggestion = suggestIndicator(input.indicator);
		const hint = suggestion
			? ` Did you mean "${suggestion}"?`
			: ' Call list_technical_indicators for valid ids.';
		return {ok: false, reason: `Unknown indicator: ${input.indicator}.${hint}`};
	}

	const meta = getIndicatorMeta(resolvedId);
	if (!meta) {
		return {ok: false, reason: `Unknown indicator: ${input.indicator}.`};
	}

	const fn = FN_MAP[meta.fnKey];
	if (!fn) {
		return {ok: false, reason: `Indicator ${resolvedId} is not wired for computation.`};
	}

	const mergedParams = {...meta.defaultParams, ...input.params};

	let normalized: NormalizedSeries;
	try {
		normalized = normalizeInput(resolvedId, meta.inputProfile, input.input);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {ok: false, reason: message};
	}

	let libraryInput: Record<string, unknown>;
	try {
		libraryInput = buildLibraryInput(meta, normalized, mergedParams);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {ok: false, reason: message};
	}

	let rawResult: unknown;
	try {
		rawResult = fn(libraryInput);
	} catch (error) {
		console.error(`calculateTechnicalIndicator(${resolvedId}) failed:`, error);
		const message = error instanceof Error ? error.message : String(error);
		return {ok: false, reason: `Calculation failed: ${message}`};
	}

	let result = sanitizeResult(rawResult);
	const warmupCount = computeWarmupCount(result, normalized.inputLength);

	if (input.options?.trimWarmup && warmupCount > 0) {
		if (result.length === normalized.inputLength) {
			result = result.slice(warmupCount);
		}
	}

	const maxPoints = input.options?.maxPoints ?? 500;
	if (result.length > maxPoints) {
		result = result.slice(-maxPoints);
	}

	return {
		ok: true,
		data: {
			indicator: resolvedId,
			params: mergedParams,
			inputLength: normalized.inputLength,
			outputLength: result.length,
			warmupCount,
			result: result as number[] | Array<Record<string, unknown>> | boolean[],
		},
	};
}
