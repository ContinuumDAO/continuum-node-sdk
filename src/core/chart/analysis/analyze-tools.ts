import {z} from 'zod';
import type {SdkResult} from '../../result.js';
import {calculateTechnicalIndicator} from '../../ta/calculate.js';
import {DEFAULT_CHART_RSI_PERIOD} from '../chart-defaults.js';
import {coerceFiniteNumber} from '../point-normalize.js';
import {ChartLiveTickSchema} from '../live/schemas.js';
import {
	calculateFibonacciRangeFromBars,
	calculateKeyLevelsFromBars,
	detectSwingsFromBars,
} from '../levels/key-levels.js';
import {calculateTrendLinesFromBars} from '../levels/trend-lines.js';
import {buildOhlcvAnalysisMeta, OhlcvAnalysisMetaSchema} from './analysis-meta.js';
import {prepareOhlcvBarsForAnalysis} from './ohlcv-live-merge.js';
import {preprocessOhlcvToolInput, missingOhlcvBarsReason} from './ohlcv-input.js';
import {ohlcvToolRejectIfLineOnly} from './time-series-analyze-tools.js';

const barsInputSchema = z
	.object({
		toolResult: z.unknown().optional(),
		rows: z.array(z.unknown()).min(1).optional(),
		title: z.string().trim().min(1).max(256).optional(),
		label: z.string().trim().min(1).max(128).optional(),
		lookback: z.number().int().min(2).max(20).optional(),
		mergeLive: z.boolean().optional(),
		liveTick: ChartLiveTickSchema.optional(),
		allowRowsOnly: z.boolean().optional(),
	})
	.strict();

export const AnalyzeTrendStructureInputSchema = z.preprocess(
	preprocessOhlcvToolInput,
	barsInputSchema,
);

function closesFromBars(bars: Record<string, unknown>[]): number[] {
	const out: number[] = [];
	for (const bar of bars) {
		const c = coerceFiniteNumber(bar.close);
		if (c != null) {
			out.push(c);
		}
	}
	return out;
}

function analysisMeta(
	bars: Record<string, unknown>[],
	title?: string,
	toolResult?: unknown,
	liveMerge?: import('./ohlcv-live-merge.js').OhlcvLiveMergeMeta,
	ohlcvFingerprint?: import('../ohlcv-integrity.js').OhlcvFingerprint | null,
) {
	return buildOhlcvAnalysisMeta(bars, {title, toolResult, liveMerge, ohlcvFingerprint});
}

function lastClose(bars: Record<string, unknown>[]): number | null {
	if (!bars.length) {
		return null;
	}
	return coerceFiniteNumber(bars[bars.length - 1]!.close);
}

export const AnalyzeTrendStructureOutputSchema = z
	.object({
		analysis: z
			.object({
				bias: z.enum(['bullish', 'bearish', 'neutral']),
				swingHigh: z
					.object({price: z.number(), timeSec: z.number()})
					.strict()
					.nullable(),
				swingLow: z
					.object({price: z.number(), timeSec: z.number()})
					.strict()
					.nullable(),
				structure: z.enum(['higher_highs', 'lower_lows', 'range', 'mixed']),
				phases: z.array(
					z
						.object({
							label: z.string(),
							fromTimeSec: z.number(),
							toTimeSec: z.number(),
							direction: z.enum(['up', 'down', 'sideways']),
						})
						.strict(),
				),
				trendLines: z.array(
					z
						.object({
							kind: z.enum(['support', 'resistance']),
							score: z.number(),
							touchCount: z.number(),
						})
						.strict(),
				),
			})
			.strict(),
		meta: OhlcvAnalysisMetaSchema,
	})
	.strict();

export async function analyzeTrendStructure(
	input: unknown,
): Promise<SdkResult<z.infer<typeof AnalyzeTrendStructureOutputSchema>>> {
	const parsed = AnalyzeTrendStructureInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.message};
	}
	const lineReject = ohlcvToolRejectIfLineOnly(parsed.data);
	if (lineReject) {
		return lineReject;
	}
	const prepared = await prepareOhlcvBarsForAnalysis(parsed.data);
	if (!prepared.ok) {
		return prepared;
	}
	const {bars, liveMerge, fingerprint} = prepared.data;
	if (bars.length < 5) {
		return {ok: false, reason: 'Need at least 5 OHLCV bars for trend structure analysis.'};
	}
	const lookback = parsed.data.lookback ?? Math.max(2, Math.min(5, Math.floor(bars.length / 10)));
	const swings = detectSwingsFromBars(bars, lookback);
	const resistance = swings.filter(s => s.kind === 'resistance').sort((a, b) => b.timeSec - a.timeSec);
	const support = swings.filter(s => s.kind === 'support').sort((a, b) => b.timeSec - a.timeSec);
	const swingHigh = resistance[0] ?? null;
	const swingLow = support[0] ?? null;

	const recentRes = resistance.slice(0, 3).map(s => s.price);
	const recentSup = support.slice(0, 3).map(s => s.price);
	let structure: 'higher_highs' | 'lower_lows' | 'range' | 'mixed' = 'mixed';
	if (
		recentRes.length >= 2 &&
		recentRes[0]! > recentRes[1]! &&
		recentSup.length >= 2 &&
		recentSup[0]! > recentSup[1]!
	) {
		structure = 'higher_highs';
	} else if (
		recentRes.length >= 2 &&
		recentRes[0]! < recentRes[1]! &&
		recentSup.length >= 2 &&
		recentSup[0]! < recentSup[1]!
	) {
		structure = 'lower_lows';
	} else if (recentRes.length >= 2 && recentSup.length >= 2) {
		const resRange = Math.max(...recentRes) - Math.min(...recentRes);
		const supRange = Math.max(...recentSup) - Math.min(...recentSup);
		const mid = (recentRes[0]! + recentSup[0]!) / 2;
		if (mid > 0 && resRange / mid < 0.02 && supRange / mid < 0.02) {
			structure = 'range';
		}
	}

	const close = lastClose(bars);
	let bias: 'bullish' | 'bearish' | 'neutral' = 'neutral';
	if (close != null && swingHigh && swingLow) {
		const mid = (swingHigh.price + swingLow.price) / 2;
		if (close > mid * 1.002) {
			bias = 'bullish';
		} else if (close < mid * 0.998) {
			bias = 'bearish';
		}
	}

	const third = Math.floor(bars.length / 3);
	const phases: z.infer<typeof AnalyzeTrendStructureOutputSchema>['analysis']['phases'] = [];
	for (let i = 0; i < 3; i++) {
		const slice = bars.slice(i * third, i === 2 ? bars.length : (i + 1) * third);
		if (slice.length < 2) {
			continue;
		}
		const first = coerceFiniteNumber(slice[0]!.close);
		const last = coerceFiniteNumber(slice[slice.length - 1]!.close);
		const t0 = coerceFiniteNumber(slice[0]!.time) ?? 0;
		const t1 = coerceFiniteNumber(slice[slice.length - 1]!.time) ?? t0;
		let direction: 'up' | 'down' | 'sideways' = 'sideways';
		if (first != null && last != null) {
			const chg = (last - first) / first;
			if (chg > 0.005) {
				direction = 'up';
			} else if (chg < -0.005) {
				direction = 'down';
			}
		}
		phases.push({
			label: i === 0 ? 'early' : i === 1 ? 'mid' : 'recent',
			fromTimeSec: t0,
			toTimeSec: t1,
			direction,
		});
	}

	const trendLines = calculateTrendLinesFromBars(bars, {}).map(t => ({
		kind: t.kind,
		score: t.score,
		touchCount: t.touchCount,
	}));

	return {
		ok: true,
		data: {
			analysis: {
				bias,
				swingHigh: swingHigh ? {price: swingHigh.price, timeSec: swingHigh.timeSec} : null,
				swingLow: swingLow ? {price: swingLow.price, timeSec: swingLow.timeSec} : null,
				structure,
				phases,
				trendLines,
			},
			meta: analysisMeta(bars, parsed.data.title, parsed.data.toolResult, liveMerge, fingerprint),
		},
	};
}

export const AnalyzeKeyLevelsInputSchema = z.preprocess(
	preprocessOhlcvToolInput,
	barsInputSchema.extend({
		maxLevels: z.number().int().min(1).max(12).optional(),
	}),
);
export const AnalyzeKeyLevelsOutputSchema = z
	.object({
		analysis: z
			.object({
				lastClose: z.number(),
				nearestSupport: z
					.object({price: z.number(), distancePct: z.number(), strength: z.number()})
					.strict()
					.nullable(),
				nearestResistance: z
					.object({price: z.number(), distancePct: z.number(), strength: z.number()})
					.strict()
					.nullable(),
				levels: z.array(
					z
						.object({
							price: z.number(),
							kind: z.enum(['support', 'resistance']),
							strength: z.number(),
							touchCount: z.number(),
						})
						.strict(),
				),
			})
			.strict(),
		meta: OhlcvAnalysisMetaSchema,
	})
	.strict();

export async function analyzeKeyLevels(
	input: unknown,
): Promise<SdkResult<z.infer<typeof AnalyzeKeyLevelsOutputSchema>>> {
	const parsed = AnalyzeKeyLevelsInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.message};
	}
	const lineReject = ohlcvToolRejectIfLineOnly(parsed.data);
	if (lineReject) {
		return lineReject;
	}
	const prepared = await prepareOhlcvBarsForAnalysis(parsed.data);
	if (!prepared.ok) {
		return prepared;
	}
	const {bars, liveMerge, fingerprint} = prepared.data;
	if (!bars.length) {
		return {ok: false, reason: missingOhlcvBarsReason(parsed.data)};
	}
	const close = lastClose(bars);
	if (close == null) {
		return {ok: false, reason: 'Could not read last close from bars.'};
	}
	const levels = calculateKeyLevelsFromBars(bars, {maxLevels: parsed.data.maxLevels ?? 8});
	const supports = levels.filter(l => l.kind === 'support' && l.price <= close);
	const resistances = levels.filter(l => l.kind === 'resistance' && l.price >= close);
	const nearestSupport = supports.sort((a, b) => b.price - a.price)[0];
	const nearestResistance = resistances.sort((a, b) => a.price - b.price)[0];

	return {
		ok: true,
		data: {
			analysis: {
				lastClose: close,
				nearestSupport: nearestSupport
					? {
							price: nearestSupport.price,
							distancePct: ((close - nearestSupport.price) / close) * 100,
							strength: nearestSupport.strength,
						}
					: null,
				nearestResistance: nearestResistance
					? {
							price: nearestResistance.price,
							distancePct: ((nearestResistance.price - close) / close) * 100,
							strength: nearestResistance.strength,
						}
					: null,
				levels,
			},
			meta: analysisMeta(bars, parsed.data.title, parsed.data.toolResult, liveMerge, fingerprint),
		},
	};
}

export const AnalyzeMomentumInputSchema = z.preprocess(
	preprocessOhlcvToolInput,
	barsInputSchema.extend({
		rsiPeriod: z.number().int().min(2).max(100).optional(),
	}),
);
export const AnalyzeMomentumOutputSchema = z
	.object({
		analysis: z
			.object({
				rsi: z
					.object({
						period: z.number(),
						value: z.number().nullable(),
						zone: z.enum(['overbought', 'oversold', 'neutral']),
					})
					.strict(),
				macd: z
					.object({
						macd: z.number().nullable(),
						signal: z.number().nullable(),
						histogram: z.number().nullable(),
						crossover: z.enum(['bullish', 'bearish', 'none']),
					})
					.strict(),
			})
			.strict(),
		meta: OhlcvAnalysisMetaSchema,
	})
	.strict();

function lastIndicatorValue(result: number[], warmupCount: number): number | null {
	const idx = result.length - 1;
	if (idx < warmupCount || idx < 0) {
		return null;
	}
	const v = result[idx];
	return v != null && Number.isFinite(v) ? v : null;
}

export async function analyzeMomentum(
	input: unknown,
): Promise<SdkResult<z.infer<typeof AnalyzeMomentumOutputSchema>>> {
	const parsed = AnalyzeMomentumInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.message};
	}
	const lineReject = ohlcvToolRejectIfLineOnly(parsed.data);
	if (lineReject) {
		return lineReject;
	}
	const prepared = await prepareOhlcvBarsForAnalysis(parsed.data);
	if (!prepared.ok) {
		return prepared;
	}
	const {bars, liveMerge, fingerprint} = prepared.data;
	const closes = closesFromBars(bars);
	if (closes.length < DEFAULT_CHART_RSI_PERIOD + 2) {
		return {ok: false, reason: 'Need more bars for momentum analysis.'};
	}
	const rsiPeriod = parsed.data.rsiPeriod ?? DEFAULT_CHART_RSI_PERIOD;
	const rsiResult = calculateTechnicalIndicator({
		indicator: 'rsi',
		params: {period: rsiPeriod},
		input: {values: closes},
		options: {maxPoints: closes.length},
	});
	if (!rsiResult.ok) {
		return rsiResult;
	}
	const rsiValue =
		Array.isArray(rsiResult.data.result) &&
		rsiResult.data.result.length > 0 &&
		typeof rsiResult.data.result[0] === 'number'
			? lastIndicatorValue(rsiResult.data.result as number[], rsiResult.data.warmupCount)
			: null;
	let rsiZone: 'overbought' | 'oversold' | 'neutral' = 'neutral';
	if (rsiValue != null) {
		if (rsiValue >= 70) {
			rsiZone = 'overbought';
		} else if (rsiValue <= 30) {
			rsiZone = 'oversold';
		}
	}

	const macdResult = calculateTechnicalIndicator({
		indicator: 'macd',
		params: {fastPeriod: 12, slowPeriod: 26, signalPeriod: 9},
		input: {values: closes},
		options: {maxPoints: closes.length},
	});
	if (!macdResult.ok) {
		return macdResult;
	}
	const macdRows = macdResult.data.result;
	const lastRow =
		Array.isArray(macdRows) && macdRows.length > 0 && typeof macdRows[0] === 'object'
			? (macdRows[macdRows.length - 1] as Record<string, unknown>)
			: undefined;
	const macd = lastRow ? (coerceFiniteNumber(lastRow.MACD ?? lastRow.macd) ?? null) : null;
	const signal = lastRow ? (coerceFiniteNumber(lastRow.signal ?? lastRow.Signal) ?? null) : null;
	const histogram = lastRow
		? (coerceFiniteNumber(lastRow.histogram ?? lastRow.Histogram) ?? null)
		: null;
	let crossover: 'bullish' | 'bearish' | 'none' = 'none';
	if (
		Array.isArray(macdRows) &&
		macdRows.length >= 2 &&
		typeof macdRows[0] === 'object'
	) {
		const prev = macdRows[macdRows.length - 2] as Record<string, unknown>;
		const prevMacd = coerceFiniteNumber(prev.MACD ?? prev.macd);
		const prevSignal = coerceFiniteNumber(prev.signal ?? prev.Signal);
		if (macd != null && signal != null && prevMacd != null && prevSignal != null) {
			if (prevMacd <= prevSignal && macd > signal) {
				crossover = 'bullish';
			} else if (prevMacd >= prevSignal && macd < signal) {
				crossover = 'bearish';
			}
		}
	}

	return {
		ok: true,
		data: {
			analysis: {
				rsi: {period: rsiPeriod, value: rsiValue, zone: rsiZone},
				macd: {macd, signal, histogram, crossover},
			},
			meta: analysisMeta(bars, parsed.data.title, parsed.data.toolResult, liveMerge, fingerprint),
		},
	};
}

export const AnalyzeRangeVolatilityInputSchema = z.preprocess(
	preprocessOhlcvToolInput,
	barsInputSchema.extend({
		atrPeriod: z.number().int().min(2).max(50).optional(),
	}),
);
export const AnalyzeRangeVolatilityOutputSchema = z
	.object({
		analysis: z
			.object({
				rangeHigh: z.number(),
				rangeLow: z.number(),
				rangePct: z.number(),
				atr: z.number().nullable(),
				atrPct: z.number().nullable(),
				recentRangePct: z.number(),
				priorRangePct: z.number(),
				compression: z.enum(['compressing', 'expanding', 'stable']),
				fibRange: z
					.object({high: z.number(), low: z.number(), trend: z.enum(['up', 'down'])})
					.strict()
					.nullable(),
			})
			.strict(),
		meta: OhlcvAnalysisMetaSchema,
	})
	.strict();

function trueRange(bar: Record<string, unknown>, prevClose: number | null): number | null {
	const high = coerceFiniteNumber(bar.high);
	const low = coerceFiniteNumber(bar.low);
	if (high == null || low == null) {
		return null;
	}
	if (prevClose == null) {
		return high - low;
	}
	return Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
}

export async function analyzeRangeVolatility(
	input: unknown,
): Promise<SdkResult<z.infer<typeof AnalyzeRangeVolatilityOutputSchema>>> {
	const parsed = AnalyzeRangeVolatilityInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.message};
	}
	const lineReject = ohlcvToolRejectIfLineOnly(parsed.data);
	if (lineReject) {
		return lineReject;
	}
	const prepared = await prepareOhlcvBarsForAnalysis(parsed.data);
	if (!prepared.ok) {
		return prepared;
	}
	const {bars, liveMerge, fingerprint} = prepared.data;
	if (bars.length < 5) {
		return {ok: false, reason: 'Need at least 5 OHLCV bars for range/volatility analysis.'};
	}
	let rangeHigh = Number.NEGATIVE_INFINITY;
	let rangeLow = Number.POSITIVE_INFINITY;
	for (const bar of bars) {
		const h = coerceFiniteNumber(bar.high);
		const l = coerceFiniteNumber(bar.low);
		if (h != null) {
			rangeHigh = Math.max(rangeHigh, h);
		}
		if (l != null) {
			rangeLow = Math.min(rangeLow, l);
		}
	}
	const close = lastClose(bars) ?? (rangeHigh + rangeLow) / 2;
	const rangePct = close > 0 ? ((rangeHigh - rangeLow) / close) * 100 : 0;

	const atrPeriod = parsed.data.atrPeriod ?? 14;
	const trs: number[] = [];
	let prevClose: number | null = null;
	for (const bar of bars) {
		const tr = trueRange(bar, prevClose);
		if (tr != null) {
			trs.push(tr);
		}
		prevClose = coerceFiniteNumber(bar.close) ?? prevClose;
	}
	const atrSlice = trs.slice(-atrPeriod);
	const atr = atrSlice.length ? atrSlice.reduce((a, b) => a + b, 0) / atrSlice.length : null;
	const atrPct = atr != null && close > 0 ? (atr / close) * 100 : null;

	const half = Math.floor(bars.length / 2);
	const priorSlice = bars.slice(0, half);
	const recentSlice = bars.slice(half);
	const sliceRangePct = (slice: Record<string, unknown>[]) => {
		let hi = Number.NEGATIVE_INFINITY;
		let lo = Number.POSITIVE_INFINITY;
		for (const bar of slice) {
			const h = coerceFiniteNumber(bar.high);
			const l = coerceFiniteNumber(bar.low);
			if (h != null) {
				hi = Math.max(hi, h);
			}
			if (l != null) {
				lo = Math.min(lo, l);
			}
		}
		return close > 0 ? ((hi - lo) / close) * 100 : 0;
	};
	const recentRangePct = sliceRangePct(recentSlice);
	const priorRangePct = sliceRangePct(priorSlice);
	let compression: 'compressing' | 'expanding' | 'stable' = 'stable';
	if (recentRangePct < priorRangePct * 0.85) {
		compression = 'compressing';
	} else if (recentRangePct > priorRangePct * 1.15) {
		compression = 'expanding';
	}

	const fibRange = calculateFibonacciRangeFromBars(bars);

	return {
		ok: true,
		data: {
			analysis: {
				rangeHigh,
				rangeLow,
				rangePct,
				atr,
				atrPct,
				recentRangePct,
				priorRangePct,
				compression,
				fibRange,
			},
			meta: analysisMeta(bars, parsed.data.title, parsed.data.toolResult, liveMerge, fingerprint),
		},
	};
}
