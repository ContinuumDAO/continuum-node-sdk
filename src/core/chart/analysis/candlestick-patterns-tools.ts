import {z} from 'zod';
import type {SdkResult} from '../../result.js';
import {
	buildPatternRecommendation,
	filterPatternIds,
	maxLookback,
	scanCandlestickPatterns,
} from '../../candlestick-patterns/index.js';
import type {PatternId} from '../../candlestick-patterns/types.js';
import {normalizeCandleRow} from '../point-normalize.js';
import {buildCandlestickHighlight} from './candlestick-highlight.js';
import {buildCandlestickTradeSetup} from './trade-setups/candlestick-trade-setup.js';
import {buildOhlcvAnalysisMeta, OhlcvAnalysisMetaSchema} from './analysis-meta.js';
import {prepareOhlcvBarsForAnalysis} from './ohlcv-live-merge.js';
import {ohlcvToolRejectIfLineOnly} from './time-series-analyze-tools.js';
import {
	missingOhlcvBarsReason,
	OhlcvToolInputSchema,
	preprocessOhlcvToolInput,
} from './ohlcv-input.js';

export const AnalyzeCandlestickPatternsInputSchema = z.preprocess(
	preprocessOhlcvToolInput,
	OhlcvToolInputSchema.extend({
	patterns: z.array(z.string().trim().min(1).max(64)).optional(),
	focusBar: z.union([z.literal('last'), z.number().int().min(0)]).optional(),
	minConfidence: z.number().min(0).max(1).optional(),
	}),
);

const patternHitSchema = z
	.object({
		id: z.string(),
		name: z.string(),
		description: z.string(),
		taLibName: z.string(),
		signal: z.number(),
		direction: z.enum(['bullish', 'bearish', 'neutral']),
		confidence: z.number(),
		barIndex: z.number().int(),
	})
	.strict();

export const AnalyzeCandlestickPatternsOutputSchema = z
	.object({
		analysis: z
			.object({
				focusBarIndex: z.number().int(),
				focusTime: z.union([
					z.number(),
					z.object({year: z.number(), month: z.number(), day: z.number()}).strict(),
					z.null(),
				]),
				focusBar: z
					.object({
						open: z.number(),
						high: z.number(),
						low: z.number(),
						close: z.number(),
					})
					.strict(),
				patterns: z.array(patternHitSchema),
				primaryPattern: z
					.object({
						id: z.string(),
						name: z.string(),
						description: z.string(),
					})
					.strict()
					.nullable(),
				recommendation: z.enum(['buy', 'sell', 'hold']),
				recommendationConfidence: z.number(),
				rationale: z.string(),
				candlestickTradeSetup: z.object({}).catchall(z.unknown()).nullable(),
				candlestickHighlight: z
					.object({
						summary: z.string(),
						recommendation: z.enum(['buy', 'sell', 'hold']),
						recommendationConfidence: z.number(),
						primaryPattern: z
							.object({
								id: z.string(),
								name: z.string(),
								description: z.string(),
								direction: z.enum(['bullish', 'bearish', 'neutral']).optional(),
							})
							.strict()
							.nullable(),
						patternsFound: z.array(
							z
								.object({
									id: z.string(),
									name: z.string(),
									direction: z.enum(['bullish', 'bearish', 'neutral']),
									confidence: z.number(),
								})
								.strict(),
						),
						focusBarIndex: z.number().int(),
						previewBars: z.array(
							z
								.object({
									index: z.number().int(),
									open: z.number(),
									high: z.number(),
									low: z.number(),
									close: z.number(),
									isFocus: z.boolean(),
								})
								.strict(),
						),
						previewBarCount: z.number().int(),
					})
					.strict(),
			})
			.strict(),
		meta: OhlcvAnalysisMetaSchema,
	})
	.strict();

function normalizedBarsFromInput(rawBars: Record<string, unknown>[]) {
	const out: Array<{
		time: number | {year: number; month: number; day: number};
		open: number;
		high: number;
		low: number;
		close: number;
	}> = [];
	for (const row of rawBars) {
		const bar = normalizeCandleRow(row);
		if (bar) {
			out.push(bar);
		}
	}
	return out;
}

export async function analyzeCandlestickPatterns(
	input: unknown,
): Promise<SdkResult<z.infer<typeof AnalyzeCandlestickPatternsOutputSchema>>> {
	const parsed = AnalyzeCandlestickPatternsInputSchema.safeParse(input);
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
	const {bars: rawBars, liveMerge, fingerprint} = prepared.data;
	if (!rawBars.length) {
		return {ok: false, reason: missingOhlcvBarsReason(parsed.data)};
	}
	const bars = normalizedBarsFromInput(rawBars);
	if (!bars.length) {
		return {ok: false, reason: 'No valid OHLCV bars after normalization.'};
	}

	const patternIds = filterPatternIds(parsed.data.patterns);
	const minBars = maxLookback();
	if (bars.length < minBars) {
		return {
			ok: false,
			reason: `Need at least ${minBars} OHLCV bars for candlestick pattern lookback (got ${bars.length}).`,
		};
	}

	let focusBarIndex = bars.length - 1;
	if (parsed.data.focusBar !== undefined && parsed.data.focusBar !== 'last') {
		focusBarIndex = parsed.data.focusBar;
	}
	if (focusBarIndex < 0 || focusBarIndex >= bars.length) {
		return {
			ok: false,
			reason: `focusBar index ${focusBarIndex} out of range (0..${bars.length - 1}).`,
		};
	}

	let hits = scanCandlestickPatterns(bars, {
		patternIds: patternIds as PatternId[] | undefined,
		barIndex: focusBarIndex,
	});
	if (parsed.data.minConfidence != null) {
		hits = hits.filter(h => h.confidence >= parsed.data.minConfidence!);
	}

	const {recommendation, recommendationConfidence, rationale, primaryPattern} =
		buildPatternRecommendation(hits);

	const focusBar = bars[focusBarIndex]!;
	const lastClose = bars[bars.length - 1]!.close;
	const candlestickTradeSetup = buildCandlestickTradeSetup({
		primaryPattern,
		patterns: hits,
		recommendation,
		recommendationConfidence,
		focusBarIndex,
		focusBarClose: focusBar.close,
		lastClose,
	});
	const candlestickHighlight = buildCandlestickHighlight({
		bars,
		focusBarIndex,
		primaryPattern,
		patterns: hits,
		recommendation,
		recommendationConfidence,
	});
	return {
		ok: true,
		data: {
			analysis: {
				focusBarIndex,
				focusTime: focusBar.time ?? null,
				focusBar: {
					open: focusBar.open,
					high: focusBar.high,
					low: focusBar.low,
					close: focusBar.close,
				},
				patterns: hits,
				primaryPattern,
				recommendation,
				recommendationConfidence,
				rationale,
				candlestickTradeSetup,
				candlestickHighlight,
			},
			meta: buildOhlcvAnalysisMeta(rawBars, {
				title: parsed.data.title,
				toolResult: parsed.data.toolResult,
				patternsScanned: patternIds?.length ?? 18,
				liveMerge,
				ohlcvFingerprint: fingerprint,
			}),
		},
	};
}
