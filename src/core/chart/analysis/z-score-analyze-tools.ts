import {z} from 'zod';
import type {SdkResult} from '../../result.js';
import {calculateTechnicalIndicator} from '../../ta/calculate.js';
import {averageTrueRangeSeries} from '../../chart-patterns/atr.js';
import type {NormalizedBar} from '../../chart-patterns/types.js';
import {coerceFiniteNumber} from '../point-normalize.js';
import {ChartLiveTickSchema} from '../live/schemas.js';
import {buildOhlcvAnalysisMeta, OhlcvAnalysisMetaSchema} from './analysis-meta.js';
import {prepareOhlcvBarsForAnalysis} from './ohlcv-live-merge.js';
import {preprocessOhlcvToolInput, missingOhlcvBarsReason} from './ohlcv-input.js';
import {ohlcvToolRejectIfLineOnly} from './time-series-analyze-tools.js';
import {buildZScoreHighlight} from './z-score-highlight.js';
import {DEFAULT_ENTRY_PROXIMITY_ATR_PERIOD} from './trade-setups/trade-desk-defaults.js';
import {
	buildZScoreTradeSetup,
	DEFAULT_Z_SCORE_ATR_FILTER,
	DEFAULT_Z_SCORE_ENTRY,
	DEFAULT_Z_SCORE_EXIT,
	DEFAULT_Z_SCORE_PERIOD,
	DEFAULT_Z_SCORE_STOP_ATR_MULTIPLE,
	type ZScoreAtrFilter,
} from './trade-setups/z-score-trade-setup.js';

const zScoreInputSchema = z
	.object({
		toolResult: z.unknown().optional(),
		rows: z.array(z.unknown()).min(1).optional(),
		title: z.string().trim().min(1).max(256).optional(),
		label: z.string().trim().min(1).max(128).optional(),
		ohlcvDigest: z.string().trim().min(1).max(512).optional(),
		mergeLive: z.boolean().optional(),
		liveTick: ChartLiveTickSchema.optional(),
		allowRowsOnly: z.boolean().optional(),
		period: z.number().int().min(2).max(500).optional(),
		zScorePeriod: z.number().int().min(2).max(500).optional(),
		zScoreEntry: z.number().positive().max(20).optional(),
		zScoreExit: z.number().min(0).max(10).optional(),
		zScoreStopAtrMultiple: z.number().min(0.1).max(50).optional(),
		zScoreAtrFilter: z.enum(['none', 'contracting']).optional(),
		entryProximityAtrPeriod: z.number().int().min(2).max(100).optional(),
		entryOffsetPct: z.number().min(0).max(50).optional(),
		invalidationOffsetPct: z.number().min(0).max(50).optional(),
		invalidationOffsetMode: z.enum(['price', 'atr']).optional(),
	})
	.strict();

export const AnalyzeZScoreInputSchema = z.preprocess(
	preprocessOhlcvToolInput,
	zScoreInputSchema,
);

export const AnalyzeZScoreOutputSchema = z
	.object({
		analysis: z
			.object({
				summary: z.string(),
				interpretation: z.string(),
				z: z.number(),
				sma: z.number(),
				sd: z.number(),
				atr: z.number().nullable(),
				period: z.number().int(),
				entryZ: z.number(),
				exitZ: z.number(),
				stopAtrMultiple: z.number(),
				atrFilter: z.enum(['none', 'contracting']),
				zScoreTradeSetup: z.object({}).catchall(z.unknown()).nullable(),
				zScoreHighlight: z.object({}).catchall(z.unknown()),
			})
			.strict(),
		meta: OhlcvAnalysisMetaSchema,
	})
	.strict();

function resolvePeriod(data: {period?: number; zScorePeriod?: number}): number {
	return data.period ?? data.zScorePeriod ?? DEFAULT_Z_SCORE_PERIOD;
}

function lastNumericFromIndicator(
	closes: number[],
	indicator: 'sma' | 'sd',
	period: number,
): SdkResult<number> {
	const result = calculateTechnicalIndicator({
		indicator,
		params: {period},
		input: {values: closes},
		options: {maxPoints: closes.length},
	});
	if (!result.ok) {
		return result;
	}
	const rows = result.data.result;
	if (!Array.isArray(rows) || rows.length === 0) {
		return {ok: false, reason: `${indicator} returned no data.`};
	}
	for (let i = rows.length - 1; i >= 0; i--) {
		const v = coerceFiniteNumber(rows[i]);
		if (v != null) {
			return {ok: true, data: v};
		}
	}
	return {ok: false, reason: `${indicator} has no finite values after warmup.`};
}

function atrLastTwoFromBars(
	bars: Record<string, unknown>[],
	period: number,
): {atr: number | null; atrPrev: number | null} {
	const normalized: NormalizedBar[] = [];
	for (let i = 0; i < bars.length; i++) {
		const close = coerceFiniteNumber(bars[i]!.close);
		const high = coerceFiniteNumber(bars[i]!.high);
		const low = coerceFiniteNumber(bars[i]!.low);
		const time = coerceFiniteNumber(bars[i]!.time);
		if (close == null || high == null || low == null || time == null) {
			continue;
		}
		normalized.push({index: i, time, timeSec: time, open: close, high, low, close});
	}
	if (!normalized.length) {
		return {atr: null, atrPrev: null};
	}
	const series = averageTrueRangeSeries(normalized, period);
	let atr: number | null = null;
	let atrPrev: number | null = null;
	for (let i = series.length - 1; i >= 0; i--) {
		const v = series[i];
		if (v != null && Number.isFinite(v) && v > 0) {
			if (atr == null) {
				atr = v;
			} else {
				atrPrev = v;
				break;
			}
		}
	}
	return {atr, atrPrev};
}

function extractCloses(bars: Record<string, unknown>[]): number[] | null {
	const closes: number[] = [];
	for (const bar of bars) {
		const c = coerceFiniteNumber(bar.close);
		if (c == null) {
			continue;
		}
		closes.push(c);
	}
	return closes.length ? closes : null;
}

export async function analyzeZScore(
	input: unknown,
): Promise<SdkResult<z.infer<typeof AnalyzeZScoreOutputSchema>>> {
	const parsed = AnalyzeZScoreInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.message};
	}

	const lineOnly = ohlcvToolRejectIfLineOnly(parsed.data);
	if (lineOnly) {
		return lineOnly;
	}

	const period = resolvePeriod(parsed.data);
	const entryZ = parsed.data.zScoreEntry ?? DEFAULT_Z_SCORE_ENTRY;
	const exitZ = parsed.data.zScoreExit ?? DEFAULT_Z_SCORE_EXIT;
	const stopAtrMultiple =
		parsed.data.zScoreStopAtrMultiple ?? DEFAULT_Z_SCORE_STOP_ATR_MULTIPLE;
	const atrFilter: ZScoreAtrFilter =
		parsed.data.zScoreAtrFilter ?? DEFAULT_Z_SCORE_ATR_FILTER;
	const atrPeriod = parsed.data.entryProximityAtrPeriod ?? DEFAULT_ENTRY_PROXIMITY_ATR_PERIOD;
	const minBars = period + 2;

	const prepared = await prepareOhlcvBarsForAnalysis(parsed.data);
	if (!prepared.ok) {
		if (!parsed.data.toolResult && !parsed.data.rows?.length) {
			return {ok: false, reason: missingOhlcvBarsReason(parsed.data)};
		}
		return prepared;
	}

	const {bars, liveMerge, fingerprint} = prepared.data;
	if (bars.length < minBars) {
		return {
			ok: false,
			reason: `Need at least ${minBars} OHLCV bars for Z-score analysis (period ${period}).`,
		};
	}

	const closes = extractCloses(bars);
	if (!closes || closes.length < minBars) {
		return {ok: false, reason: 'Insufficient valid close prices for Z-score analysis.'};
	}

	const smaResult = lastNumericFromIndicator(closes, 'sma', period);
	if (!smaResult.ok) {
		return smaResult;
	}
	const sdResult = lastNumericFromIndicator(closes, 'sd', period);
	if (!sdResult.ok) {
		return sdResult;
	}

	const sma = smaResult.data;
	const sd = sdResult.data;
	if (sd <= 0) {
		return {ok: false, reason: 'Z-score undefined — rolling standard deviation is zero.'};
	}

	const lastClose = closes[closes.length - 1]!;
	const z = (lastClose - sma) / sd;
	const {atr, atrPrev} = atrLastTwoFromBars(bars, atrPeriod);

	const zScoreTradeSetup = buildZScoreTradeSetup({
		lastClose,
		z,
		sma,
		sd,
		period,
		entryZ,
		exitZ,
		stopAtrMultiple,
		atrFilter,
		atr,
		atrPrev,
		entryOffsetPct: parsed.data.entryOffsetPct,
		invalidationOffsetPct: parsed.data.invalidationOffsetPct,
		invalidationOffsetMode: parsed.data.invalidationOffsetMode,
	});

	const zScoreHighlight = buildZScoreHighlight({
		z,
		sma,
		sd,
		period,
		entryZ,
		exitZ,
		stopAtrMultiple,
		setup: zScoreTradeSetup,
	});

	const summary = zScoreHighlight.summary;
	let interpretation = `Z-score (${period}): Z=${z.toFixed(2)}, SMA=${sma.toFixed(2)}, SD=${sd.toFixed(2)}. Entry |Z|≥${entryZ}, exit Z=${exitZ}, stop ${stopAtrMultiple}×ATR. `;
	if (zScoreTradeSetup?.invalidated) {
		interpretation += zScoreTradeSetup.unclearReason ?? 'Setup invalidated.';
	} else if (
		zScoreTradeSetup?.status === 'clear' &&
		zScoreTradeSetup.side !== 'neutral'
	) {
		interpretation += `Trade setup (${zScoreTradeSetup.setupPurposeCode}): ${zScoreTradeSetup.side} mean reversion toward ${zScoreTradeSetup.targetLabel ?? 'Z exit'}.`;
	} else {
		interpretation +=
			zScoreTradeSetup?.conditionalNote ?? 'No clear Z-score fade — wait for extreme.';
	}

	return {
		ok: true,
		data: {
			analysis: {
				summary,
				interpretation,
				z,
				sma,
				sd,
				atr,
				period,
				entryZ,
				exitZ,
				stopAtrMultiple,
				atrFilter,
				zScoreTradeSetup,
				zScoreHighlight,
			},
			meta: buildOhlcvAnalysisMeta(bars, {
				title: parsed.data.title,
				toolResult: parsed.data.toolResult,
				liveMerge,
				ohlcvFingerprint: fingerprint,
			}),
		},
	};
}
