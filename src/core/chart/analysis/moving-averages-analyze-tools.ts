import {z} from 'zod';
import type {SdkResult} from '../../result.js';
import {calculateTechnicalIndicator} from '../../ta/calculate.js';
import {coerceFiniteNumber} from '../point-normalize.js';
import {extractOhlcvBarsFromUnknown} from '../fetch-result.js';
import {ChartLiveTickSchema} from '../live/schemas.js';
import {buildOhlcvAnalysisMeta, OhlcvAnalysisMetaSchema} from './analysis-meta.js';
import {prepareOhlcvBarsForAnalysis} from './ohlcv-live-merge.js';
import {preprocessOhlcvToolInput, missingOhlcvBarsReason} from './ohlcv-input.js';
import {buildMovingAveragesHighlight} from './moving-averages-highlight.js';
import {
	buildMovingAveragesTradeSetup,
	DEFAULT_FRESH_CROSSOVER_MAX_BARS,
	DEFAULT_MA_FAST_PERIOD,
	DEFAULT_MA_SLOW_PERIOD,
	DEFAULT_MA_TYPE,
	detectMaCrossover,
	type MaType,
} from './trade-setups/moving-averages-trade-setup.js';

const maTypeSchema = z.enum(['sma', 'ema']);

const movingAveragesInputSchema = z
	.object({
		toolResult: z.unknown().optional(),
		rows: z.array(z.unknown()).min(1).optional(),
		title: z.string().trim().min(1).max(256).optional(),
		label: z.string().trim().min(1).max(128).optional(),
		ohlcvDigest: z.string().trim().min(1).max(512).optional(),
		mergeLive: z.boolean().optional(),
		liveTick: ChartLiveTickSchema.optional(),
		allowRowsOnly: z.boolean().optional(),
		fastPeriod: z.number().int().min(2).max(500).optional(),
		slowPeriod: z.number().int().min(2).max(500).optional(),
		maType: maTypeSchema.optional(),
		freshCrossoverMaxBars: z.number().int().min(0).max(50).optional(),
		entryProximityPct: z.number().min(0).max(50).optional(),
		entryProximityMode: z.enum(['price', 'atr']).optional(),
	})
	.strict();

export const AnalyzeMovingAveragesInputSchema = z.preprocess(
	preprocessOhlcvToolInput,
	movingAveragesInputSchema,
);

export const AnalyzeMovingAveragesOutputSchema = z
	.object({
		analysis: z
			.object({
				summary: z.string(),
				interpretation: z.string(),
				fastMa: z.number(),
				slowMa: z.number(),
				fastPeriod: z.number().int(),
				slowPeriod: z.number().int(),
				maType: maTypeSchema,
				crossoverState: z.enum(['bullish', 'bearish', 'none']),
				barsSinceCrossover: z.number().int().nullable(),
				movingAveragesTradeSetup: z.object({}).catchall(z.unknown()).nullable(),
				movingAveragesHighlight: z.object({}).catchall(z.unknown()),
			})
			.strict(),
		meta: OhlcvAnalysisMetaSchema,
	})
	.strict();

function lastCloseFromBars(bars: Record<string, unknown>[]): number | null {
	for (let i = bars.length - 1; i >= 0; i--) {
		const close = coerceFiniteNumber(bars[i]!.close);
		if (close != null) {
			return close;
		}
	}
	return null;
}

function maSeriesFromCloses(
	closes: number[],
	maType: MaType,
	period: number,
): SdkResult<number[]> {
	const result = calculateTechnicalIndicator({
		indicator: maType,
		params: {period},
		input: {values: closes},
		options: {maxPoints: closes.length},
	});
	if (!result.ok) {
		return result;
	}
	const rows = result.data.result;
	if (!Array.isArray(rows) || rows.length === 0) {
		return {ok: false, reason: `${maType.toUpperCase()} returned no data.`};
	}
	const series: number[] = [];
	for (const row of rows) {
		const value =
			typeof row === 'number'
				? row
				: coerceFiniteNumber((row as Record<string, unknown>).value ?? row);
		series.push(value != null && Number.isFinite(value) ? value : Number.NaN);
	}
	while (series.length < closes.length) {
		series.unshift(Number.NaN);
	}
	return {ok: true, data: series.slice(-closes.length)};
}

function lastFiniteMa(series: number[]): number | null {
	for (let i = series.length - 1; i >= 0; i--) {
		const v = series[i]!;
		if (Number.isFinite(v)) {
			return v;
		}
	}
	return null;
}

export async function analyzeMovingAverages(
	input: unknown,
): Promise<SdkResult<z.infer<typeof AnalyzeMovingAveragesOutputSchema>>> {
	const parsed = AnalyzeMovingAveragesInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.message};
	}

	const fastPeriod = parsed.data.fastPeriod ?? DEFAULT_MA_FAST_PERIOD;
	const slowPeriod = parsed.data.slowPeriod ?? DEFAULT_MA_SLOW_PERIOD;
	if (fastPeriod >= slowPeriod) {
		return {ok: false, reason: 'fastPeriod must be less than slowPeriod.'};
	}
	const maType = parsed.data.maType ?? DEFAULT_MA_TYPE;
	const freshCrossoverMaxBars =
		parsed.data.freshCrossoverMaxBars ?? DEFAULT_FRESH_CROSSOVER_MAX_BARS;

	const prepared = await prepareOhlcvBarsForAnalysis(parsed.data);
	if (!prepared.ok) {
		return prepared;
	}
	const {bars, liveMerge, fingerprint} = prepared.data;
	if (bars.length < slowPeriod) {
		return {
			ok: false,
			reason: `Need at least ${slowPeriod} OHLCV bars for moving averages analysis (slow period ${slowPeriod}).`,
		};
	}

	const closes: number[] = [];
	for (const bar of bars) {
		const close = coerceFiniteNumber(bar.close);
		if (close != null) {
			closes.push(close);
		}
	}
	if (closes.length < slowPeriod) {
		return {ok: false, reason: 'Insufficient valid close prices for moving averages analysis.'};
	}

	const fastSeriesResult = maSeriesFromCloses(closes, maType, fastPeriod);
	if (!fastSeriesResult.ok) {
		return fastSeriesResult;
	}
	const slowSeriesResult = maSeriesFromCloses(closes, maType, slowPeriod);
	if (!slowSeriesResult.ok) {
		return slowSeriesResult;
	}

	const fastMa = lastFiniteMa(fastSeriesResult.data);
	const slowMa = lastFiniteMa(slowSeriesResult.data);
	if (fastMa == null || slowMa == null) {
		return {ok: false, reason: 'Moving averages have no valid last values after warmup.'};
	}

	const lastClose = lastCloseFromBars(bars) ?? closes.at(-1)!;
	const {crossoverState, barsSinceCrossover} = detectMaCrossover(
		fastSeriesResult.data,
		slowSeriesResult.data,
	);

	const movingAveragesTradeSetup = buildMovingAveragesTradeSetup({
		lastClose,
		fastMa,
		slowMa,
		fastPeriod,
		slowPeriod,
		maType,
		crossoverState,
		barsSinceCrossover,
		freshCrossoverMaxBars,
		bars,
		entryProximityPct: parsed.data.entryProximityPct,
		entryProximityMode: parsed.data.entryProximityMode,
	});

	const movingAveragesHighlight = buildMovingAveragesHighlight({
		fastMa,
		slowMa,
		fastPeriod,
		slowPeriod,
		maType,
		setup: movingAveragesTradeSetup,
	});

	const summary = movingAveragesHighlight.summary;
	const interpretation = (() => {
		let msg = `Moving averages ${maType.toUpperCase()}(${fastPeriod}/${slowPeriod}): fast ${fastMa.toFixed(2)}, slow ${slowMa.toFixed(2)}. Last close ${lastClose.toFixed(2)}. `;
		if (movingAveragesTradeSetup?.status === 'clear' && movingAveragesTradeSetup.side !== 'neutral') {
			msg += `Trade setup: ${movingAveragesTradeSetup.tradeSummary}`;
		} else {
			msg += movingAveragesTradeSetup?.conditionalNote ?? 'No clear MA setup.';
		}
		return msg;
	})();

	return {
		ok: true,
		data: {
			analysis: {
				summary,
				interpretation,
				fastMa,
				slowMa,
				fastPeriod,
				slowPeriod,
				maType,
				crossoverState,
				barsSinceCrossover,
				movingAveragesTradeSetup,
				movingAveragesHighlight,
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
