import {z} from 'zod';
import type {SdkResult} from '../../result.js';
import {analyzeElliottWaves} from '../../elliott-waves/analyze.js';
import {runOhlcvIntegrityPipeline} from '../ohlcv-integrity.js';
import {buildOhlcvAnalysisMeta, OhlcvAnalysisMetaSchema} from './analysis-meta.js';
import {prepareOhlcvBarsForAnalysis} from './ohlcv-live-merge.js';
import {preprocessOhlcvToolInput, missingOhlcvBarsReason} from './ohlcv-input.js';
import {ohlcvToolRejectIfLineOnly} from './time-series-analyze-tools.js';
import {ChartLiveTickSchema} from '../live/schemas.js';
import {buildElliottWaveTradeSetup} from './trade-setups/elliott-waves-trade-setup.js';
import {tradeDeskUniversalInputSchema} from './trade-setups/trade-desk-universal-input.js';
import {THRESHOLDS} from '../../elliott-waves/constants.js';

const barsInputSchema = z
	.object({
		toolResult: z.unknown().optional(),
		rows: z.array(z.unknown()).min(1).optional(),
		title: z.string().trim().min(1).max(256).optional(),
		label: z.string().trim().min(1).max(128).optional(),
		mergeLive: z.boolean().optional(),
		liveTick: ChartLiveTickSchema.optional(),
		allowRowsOnly: z.boolean().optional(),
		/** 1-based waveMenu # for trade re-bind (default primary #1). */
		waveMenuNumber: z.number().int().min(1).max(64).optional(),
	})
	.merge(tradeDeskUniversalInputSchema)
	.strict();

export const AnalyzeElliottWavesInputSchema = z.preprocess(preprocessOhlcvToolInput, barsInputSchema);

const waveMenuEntrySchema = z
	.object({
		index: z.number().int(),
		waveMenuNumber: z.number().int(),
		degree: z.enum(['minor', 'intermediate', 'primary']),
		patternType: z.enum(['impulse', 'diagonal', 'corrective']),
		labels: z.array(z.string()),
		barSpan: z.object({fromTimeSec: z.number(), toTimeSec: z.number()}).strict(),
		confidence: z.number(),
		isPrimary: z.boolean(),
		keyLevels: z.array(
			z
				.object({
					price: z.number(),
					label: z.string(),
					role: z.enum(['target', 'invalidation', 'pivot']),
				})
				.strict(),
		),
		invalidation: z.object({price: z.number(), label: z.string()}).strict().optional(),
	})
	.strict();

export const AnalyzeElliottWavesOutputSchema = z
	.object({
		analysis: z
			.object({
				dataStatus: z.enum(['ok', 'insufficient_data']),
				dataGuidance: z.string(),
				effectiveDegree: z.enum(['minor', 'intermediate', 'primary']),
				minBarsRequired: z.number().int(),
				trendDirection: z.enum(['up', 'down']),
				patternType: z.enum(['impulse', 'diagonal', 'corrective']),
				confirmedWaveCount: z.number().int(),
				inProgressWave: z.string().optional(),
				interpretation: z.string(),
				confidence: z.number(),
				waveMenu: z.array(waveMenuEntrySchema),
				keyLevels: z.array(
					z
						.object({
							price: z.number(),
							label: z.string(),
							role: z.enum(['target', 'invalidation', 'pivot']),
						})
						.strict(),
				),
				lastClose: z.number(),
				elliottWaveTradeSetup: z.object({}).passthrough(),
				drawableWaves: z.object({}).passthrough(),
			})
			.strict(),
		meta: OhlcvAnalysisMetaSchema,
	})
	.strict();

export async function analyzeElliottWavesTool(
	input: unknown,
): Promise<SdkResult<z.infer<typeof AnalyzeElliottWavesOutputSchema>>> {
	const parsed = AnalyzeElliottWavesInputSchema.safeParse(input);
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

	const integrity = runOhlcvIntegrityPipeline(bars, parsed.data);
	if (!integrity.ok) {
		return integrity;
	}

	if (bars.length < THRESHOLDS.absoluteMinBars) {
		return {
			ok: false,
			reason:
				`Need at least ${THRESHOLDS.absoluteMinBars} OHLCV bars for Elliott wave analysis (got ${bars.length}). ` +
				missingOhlcvBarsReason(parsed.data),
		};
	}

	const meta = buildOhlcvAnalysisMeta(bars, {
		title: parsed.data.title,
		toolResult: parsed.data.toolResult,
		liveMerge,
		ohlcvFingerprint: fingerprint,
	});

	const interval =
		typeof meta.fetchContext?.interval === 'string' ? meta.fetchContext.interval : undefined;

	const result = analyzeElliottWaves({bars, interval});
	const waveMenuNumber = parsed.data.waveMenuNumber ?? 1;
	const elliottWaveTradeSetup = buildElliottWaveTradeSetup(result, waveMenuNumber);

	return {
		ok: true,
		data: {
			analysis: {
				dataStatus: result.dataStatus,
				dataGuidance: result.dataGuidance,
				effectiveDegree: result.effectiveDegree,
				minBarsRequired: result.minBarsRequired,
				trendDirection: result.trendDirection,
				patternType: result.patternType,
				confirmedWaveCount: result.confirmedWaveCount,
				...(result.inProgressWave ? {inProgressWave: result.inProgressWave} : {}),
				interpretation: result.interpretation,
				confidence: result.confidence,
				waveMenu: result.waveMenu,
				keyLevels: result.keyLevels,
				lastClose: result.lastClose,
				elliottWaveTradeSetup,
				drawableWaves: result.drawableWaves,
			},
			meta,
		},
	};
}
