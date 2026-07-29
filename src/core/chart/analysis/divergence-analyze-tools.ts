import {z} from 'zod';
import type {SdkResult} from '../../result.js';
import {calculateTechnicalIndicator} from '../../ta/calculate.js';
import {DEFAULT_CHART_RSI_PERIOD} from '../chart-defaults.js';
import {coerceFiniteNumber} from '../point-normalize.js';
import {ChartLiveTickSchema} from '../live/schemas.js';
import {barTimeSecFromRow} from '../live/bar-merge.js';
import {buildOhlcvAnalysisMeta, OhlcvAnalysisMetaSchema} from './analysis-meta.js';
import {prepareOhlcvBarsForAnalysis} from './ohlcv-live-merge.js';
import {preprocessOhlcvToolInput, missingOhlcvBarsReason} from './ohlcv-input.js';
import {ohlcvToolRejectIfLineOnly} from './time-series-analyze-tools.js';
import {
	detectDivergences,
	selectPrimaryDivergence,
} from './divergence/detect.js';
import type {
	DivergenceHit,
	DivergenceOscillator,
	DivergenceOscillatorMode,
} from './divergence/types.js';
import {buildDivergenceHighlight} from './divergence-highlight.js';
import {hitsToDivergenceOverlay} from './divergence-drawings-tools.js';
import {buildDivergenceTradeSetup} from './trade-setups/divergence-trade-setup.js';
import {
	pickTradeDeskUniversalFromInput,
	tradeDeskUniversalInputSchema,
} from './trade-setups/trade-desk-universal-input.js';

const DEFAULT_STOCH_RSI = {
	rsiPeriod: 14,
	stochasticPeriod: 14,
	kPeriod: 3,
	dPeriod: 3,
};

const barsInputSchema = z
	.object({
		toolResult: z.unknown().optional(),
		rows: z.array(z.unknown()).min(1).optional(),
		title: z.string().trim().min(1).max(256).optional(),
		label: z.string().trim().min(1).max(128).optional(),
		mergeLive: z.boolean().optional(),
		liveTick: ChartLiveTickSchema.optional(),
		allowRowsOnly: z.boolean().optional(),
		oscillator: z.enum(['rsi', 'stochasticrsi', 'both']).optional(),
		rsiPeriod: z.number().int().min(2).max(100).optional(),
		maxLag: z.number().int().min(1).max(20).optional(),
		includeHidden: z.boolean().optional(),
		stochasticRsiPeriod: z.number().int().min(2).max(100).optional(),
		stochasticPeriod: z.number().int().min(2).max(100).optional(),
		kPeriod: z.number().int().min(1).max(100).optional(),
		dPeriod: z.number().int().min(1).max(100).optional(),
	})
	.merge(tradeDeskUniversalInputSchema)
	.strict();

export const AnalyzeDivergenceInputSchema = z.preprocess(
	preprocessOhlcvToolInput,
	barsInputSchema,
);

const pivotSchema = z
	.object({
		index: z.number().int(),
		timeSec: z.number(),
		value: z.number(),
	})
	.strict();

const hitSchema = z
	.object({
		kind: z.enum([
			'regular_bullish',
			'regular_bearish',
			'hidden_bullish',
			'hidden_bearish',
		]),
		oscillator: z.enum(['rsi', 'stochasticrsi']),
		p1: pivotSchema,
		p2: pivotSchema,
		o1: pivotSchema,
		o2: pivotSchema,
		barsSinceConfirm: z.number().int(),
	})
	.strict();

export const AnalyzeDivergenceOutputSchema = z
	.object({
		analysis: z
			.object({
				oscillator: z.enum(['rsi', 'stochasticrsi', 'both']),
				divergences: z.array(hitSchema),
				primary: hitSchema
					.extend({
						side: z.enum(['long', 'short']),
						confidence: z.number(),
					})
					.nullable(),
				divergenceTradeSetup: z.object({}).catchall(z.unknown()).nullable(),
				divergenceHighlight: z
					.object({
						summary: z.string(),
						primaryKind: z
							.enum([
								'regular_bullish',
								'regular_bearish',
								'hidden_bullish',
								'hidden_bearish',
							])
							.nullable(),
						oscillator: z.enum(['rsi', 'stochasticrsi']).nullable(),
						side: z.enum(['long', 'short', 'neutral']),
						status: z.enum(['clear', 'unclear']),
						confidence: z.number(),
						conditionalNote: z.string(),
						divergenceCount: z.number().int(),
						unclearReason: z.string().optional(),
					})
					.strict(),
				/** Geometry for apply_divergence_drawings (primary segment). */
				divergenceOverlay: z.object({}).catchall(z.unknown()).nullable(),
			})
			.strict(),
		meta: OhlcvAnalysisMetaSchema,
	})
	.strict();

function closesAndTimes(bars: Record<string, unknown>[]): {
	closes: number[];
	timesSec: number[];
} {
	const closes: number[] = [];
	const timesSec: number[] = [];
	for (const bar of bars) {
		const c = coerceFiniteNumber(bar.close);
		const t = barTimeSecFromRow(bar);
		if (c == null || t == null) {
			continue;
		}
		closes.push(c);
		timesSec.push(t);
	}
	return {closes, timesSec};
}

function lastIndicatorSeries(
	result: number[],
	warmupCount: number,
): Array<number | null> {
	return result.map((v, i) =>
		i < warmupCount || v == null || !Number.isFinite(v) ? null : v,
	);
}

function computeRsiSeries(
	closes: number[],
	period: number,
): SdkResult<Array<number | null>> {
	const rsiResult = calculateTechnicalIndicator({
		indicator: 'rsi',
		params: {period},
		input: {values: closes},
		options: {maxPoints: closes.length},
	});
	if (!rsiResult.ok) {
		return rsiResult;
	}
	if (!Array.isArray(rsiResult.data.result) || typeof rsiResult.data.result[0] !== 'number') {
		return {ok: false, reason: 'RSI returned unexpected shape.'};
	}
	return {
		ok: true,
		data: lastIndicatorSeries(
			rsiResult.data.result as number[],
			rsiResult.data.warmupCount,
		),
	};
}

function computeStochKSeries(
	closes: number[],
	params: {
		rsiPeriod: number;
		stochasticPeriod: number;
		kPeriod: number;
		dPeriod: number;
	},
): SdkResult<Array<number | null>> {
	const result = calculateTechnicalIndicator({
		indicator: 'stochasticrsi',
		params,
		input: {values: closes},
		options: {maxPoints: closes.length},
	});
	if (!result.ok) {
		return result;
	}
	const rows = result.data.result;
	if (!Array.isArray(rows) || rows.length === 0) {
		return {ok: false, reason: 'Stochastic RSI returned no data.'};
	}
	const out: Array<number | null> = [];
	for (let i = 0; i < rows.length; i++) {
		if (i < result.data.warmupCount) {
			out.push(null);
			continue;
		}
		const row = rows[i];
		if (typeof row !== 'object' || row == null) {
			out.push(null);
			continue;
		}
		const rec = row as Record<string, unknown>;
		const k = coerceFiniteNumber(rec.k ?? rec.K);
		out.push(k);
	}
	return {ok: true, data: out};
}

function resolveOscillatorMode(input: {
	oscillator?: DivergenceOscillatorMode;
	divergenceOscillator?: DivergenceOscillatorMode;
}): DivergenceOscillatorMode {
	return input.oscillator ?? input.divergenceOscillator ?? 'both';
}

export async function analyzeDivergence(
	input: unknown,
): Promise<SdkResult<z.infer<typeof AnalyzeDivergenceOutputSchema>>> {
	const parsed = AnalyzeDivergenceInputSchema.safeParse(input);
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
	const {closes, timesSec} = closesAndTimes(bars);
	if (closes.length < DEFAULT_CHART_RSI_PERIOD + 10) {
		return {ok: false, reason: 'Need more bars for divergence analysis.'};
	}

	const mode = resolveOscillatorMode(parsed.data);
	const rsiPeriod = parsed.data.rsiPeriod ?? DEFAULT_CHART_RSI_PERIOD;
	const maxLag = parsed.data.maxLag ?? parsed.data.divergenceMaxLag ?? 3;
	const includeHidden = parsed.data.includeHidden !== false;
	const stochParams = {
		rsiPeriod: parsed.data.stochasticRsiPeriod ?? DEFAULT_STOCH_RSI.rsiPeriod,
		stochasticPeriod: parsed.data.stochasticPeriod ?? DEFAULT_STOCH_RSI.stochasticPeriod,
		kPeriod: parsed.data.kPeriod ?? DEFAULT_STOCH_RSI.kPeriod,
		dPeriod: parsed.data.dPeriod ?? DEFAULT_STOCH_RSI.dPeriod,
	};

	const hits: DivergenceHit[] = [];
	const runOn = (id: DivergenceOscillator) => {
		if (mode === 'both' || mode === id) {
			return true;
		}
		return false;
	};

	if (runOn('rsi')) {
		const rsi = computeRsiSeries(closes, rsiPeriod);
		if (!rsi.ok) {
			return rsi;
		}
		hits.push(
			...detectDivergences({
				prices: closes,
				oscillator: rsi.data,
				timesSec,
				oscillatorId: 'rsi',
				period: rsiPeriod,
				maxLag,
				includeHidden,
			}),
		);
	}

	if (runOn('stochasticrsi')) {
		const stoch = computeStochKSeries(closes, stochParams);
		if (!stoch.ok) {
			return stoch;
		}
		hits.push(
			...detectDivergences({
				prices: closes,
				oscillator: stoch.data,
				timesSec,
				oscillatorId: 'stochasticrsi',
				period: stochParams.rsiPeriod,
				maxLag,
				includeHidden,
			}),
		);
	}

	hits.sort((a, b) => a.barsSinceConfirm - b.barsSinceConfirm || a.p2.index - b.p2.index);
	const primary = selectPrimaryDivergence(hits);
	const desk = pickTradeDeskUniversalFromInput(parsed.data);
	const close = closes[closes.length - 1] ?? 0;
	const divergenceTradeSetup = buildDivergenceTradeSetup({
		lastClose: close,
		primary,
		entryOffsetPct: desk.entryOffsetPct,
		invalidationOffsetPct: desk.invalidationOffsetPct,
	});
	const divergenceHighlight = buildDivergenceHighlight({
		primary,
		setup: divergenceTradeSetup,
		divergenceCount: hits.length,
	});
	const divergenceOverlay = primary
		? hitsToDivergenceOverlay([primary])
		: hits.length
			? hitsToDivergenceOverlay(hits.slice(0, 1))
			: null;

	return {
		ok: true,
		data: {
			analysis: {
				oscillator: mode,
				divergences: hits,
				primary,
				divergenceTradeSetup,
				divergenceHighlight,
				divergenceOverlay,
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
