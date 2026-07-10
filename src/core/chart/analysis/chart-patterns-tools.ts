import {z} from 'zod';
import type {SdkResult} from '../../result.js';
import {
	analyzeChartPatternsFromBars,
	chartPatternsScannedCount,
	filterChartPatternIds,
	maxChartPatternMinBars,
	scanChartPatterns,
} from '../../chart-patterns/index.js';
import type {ChartPatternId} from '../../chart-patterns/types.js';
import {ohlcvToolRejectIfLineOnly} from './time-series-analyze-tools.js';
import {buildOhlcvAnalysisMeta, OhlcvAnalysisMetaSchema} from './analysis-meta.js';
import {prepareOhlcvBarsForAnalysis} from './ohlcv-live-merge.js';
import {
	missingOhlcvBarsReason,
	OhlcvToolInputSchema,
	preprocessOhlcvToolInput,
} from './ohlcv-input.js';
import {
	collectChartPatternHitPrices,
	ohlcvSummaryWithLiveMark,
	summarizeOhlcvBars,
} from '../chart-ohlcv-summary.js';
import {rejectGeometryOutsideOhlcvSummary} from '../ohlcv-integrity.js';

export function preprocessAnalyzeChartPatternsInput(raw: unknown): unknown {
	return preprocessOhlcvToolInput(raw);
}

export const AnalyzeChartPatternsInputInnerSchema = OhlcvToolInputSchema.extend({
	patterns: z.array(z.string().trim().min(1).max(64)).optional(),
	focusWindow: z.union([z.literal('last'), z.number().int().min(0)]).optional(),
	minConfidence: z.number().min(0).max(1).optional(),
	swingLookback: z.number().int().min(2).max(20).optional(),
	smoothHeadShoulders: z.boolean().optional(),
	smoothWindow: z.union([z.literal(3), z.literal(5)]).optional(),
	retestTolerancePct: z.number().min(0.01).max(0.5).optional(),
	retestAtrPeriod: z.number().int().min(2).max(50).optional(),
	retestAtrMultiplier: z.number().min(0.1).max(5).optional(),
});

export const AnalyzeChartPatternsInputSchema = z.preprocess(
	preprocessAnalyzeChartPatternsInput,
	AnalyzeChartPatternsInputInnerSchema,
);

const classificationSchema = z.enum([
	'bullish',
	'moderately_bullish',
	'neutral',
	'moderately_bearish',
	'bearish',
]);

const patternPointSchema = z
	.object({
		timeSec: z.number(),
		price: z.number(),
		label: z.string().optional(),
		role: z.string().optional(),
	})
	.strict();

const patternLineSchema = z
	.object({
		pointA: patternPointSchema,
		pointB: patternPointSchema,
		label: z.string().optional(),
		kind: z.enum(['support', 'resistance', 'neckline', 'boundary', 'flagpole']).optional(),
	})
	.strict();

const patternHitSchema = z
	.object({
		id: z.string(),
		name: z.string(),
		variant: z.string().optional(),
		category: z.enum(['reversal', 'continuation']),
		direction: z.enum(['bullish', 'bearish', 'neutral']),
		confidence: z.number(),
		classification: classificationSchema,
		barSpan: z
			.object({
				fromIndex: z.number().int(),
				toIndex: z.number().int(),
				fromTimeSec: z.number(),
				toTimeSec: z.number(),
			})
			.strict(),
		points: z.array(patternPointSchema),
		lines: z.array(patternLineSchema),
		levels: z
			.array(
				z
					.object({
						price: z.number(),
						label: z.string().optional(),
						kind: z.enum(['support', 'resistance', 'neckline', 'level']).optional(),
					})
					.strict(),
			)
			.optional(),
		description: z.string(),
		interpretation: z.string(),
		completionState: z.enum(['forming', 'completed']).optional(),
	})
	.strict();

const measuredMoveSchema = z
	.object({
		targetPrice: z.number(),
		referencePrice: z.number(),
		height: z.number(),
		direction: z.enum(['up', 'down']),
		formula: z.string(),
		status: z.enum(['projected', 'active']),
	})
	.strict();

const volumeConfirmationSchema = z
	.object({
		status: z.enum(['confirming', 'mixed', 'weak', 'unavailable']),
		summary: z.string(),
		baseline: z.object({barCount: z.number().int(), avgVolume: z.number()}).strict(),
		events: z.array(
			z
				.object({
					barIndex: z.number().int(),
					timeSec: z.number(),
					role: z.string(),
					volume: z.number(),
					ratioToBaseline: z.number(),
					verdict: z.enum(['confirming', 'neutral', 'weak']),
				})
				.strict(),
		),
	})
	.strict();

const drawingSpecSchema = z
	.object({
		version: z.literal(1),
		patternId: z.string(),
		barSpan: patternHitSchema.shape.barSpan,
		elements: z.array(z.record(z.string(), z.unknown())),
		legend: z.array(z.string()),
	})
	.strict();

const patternKeyLevelSummarySchema = z
	.object({
		label: z.string(),
		price: z.number(),
		timeSec: z.number().optional(),
	})
	.strict();

const patternBarSpanSummarySchema = z
	.object({
		fromTimeSec: z.number(),
		toTimeSec: z.number(),
		barCount: z.number().int(),
	})
	.strict();

const patternMenuMeasuredMoveSummarySchema = z
	.object({
		targetPrice: z.number(),
		referencePrice: z.number(),
		direction: z.enum(['up', 'down']),
		formula: z.string(),
		status: z.enum(['projected', 'active']),
	})
	.strict();

const patternSummarySchema = z
	.object({
		id: z.string(),
		name: z.string(),
		classification: classificationSchema,
		confidence: z.number(),
		interpretation: z.string(),
		barSpan: patternBarSpanSummarySchema,
		keyLevels: z.array(patternKeyLevelSummarySchema),
		measuredMove: patternMenuMeasuredMoveSummarySchema.optional(),
	})
	.strict();

const enrichedPatternHitSchema = patternHitSchema
	.extend({
		drawingSpec: drawingSpecSchema,
		drawable: z.boolean(),
		measuredMove: measuredMoveSchema.optional(),
		volumeConfirmation: volumeConfirmationSchema.optional(),
	})
	.strict();

const patternMenuEntrySchema = z
	.object({
		index: z.number().int(),
		id: z.string(),
		name: z.string(),
		confidence: z.number(),
		completionState: z.enum(['forming', 'completed']).optional(),
		classification: classificationSchema,
		drawable: z.boolean(),
		isPrimary: z.boolean(),
		isHighestConfidence: z.boolean(),
		barSpan: patternBarSpanSummarySchema,
		keyLevels: z.array(patternKeyLevelSummarySchema),
		measuredMove: patternMenuMeasuredMoveSummarySchema.optional(),
	})
	.strict();

const chartPatternTradeSetupSchema = z
	.object({
		status: z.enum(['clear', 'unclear']),
		source: z.literal('primary_pattern'),
		patternNumber: z.number().int().min(1),
		patternId: z.string(),
		patternName: z.string(),
		classification: classificationSchema,
		confidence: z.number(),
		completionState: z.enum(['forming', 'completed']).optional(),
		side: z.enum(['long', 'short', 'neutral']),
		lastClose: z.number(),
		triggerPrice: z.number().optional(),
		triggerLabel: z.string().optional(),
		targetPrice: z.number().optional(),
		targetDirection: z.enum(['up', 'down']).optional(),
		targetStatus: z.enum(['projected', 'active']).optional(),
		invalidationPrice: z.number().optional(),
		invalidationLabel: z.string().optional(),
		entryPhase: z.enum(['inside_pattern', 'post_breakout_retest']).optional(),
		entryOffsetMode: z.enum(['bounce', 'retest']).optional(),
		setupPurposeCode: z.string().optional(),
		unclearReason: z.string().optional(),
	})
	.strict();

export const AnalyzeChartPatternsOutputSchema = z
	.object({
		analysis: z
			.object({
				summary: z.string(),
				classification: classificationSchema.nullable(),
				interpretation: z.string(),
				primaryPattern: patternSummarySchema.nullable(),
				highestConfidencePattern: patternSummarySchema.nullable(),
				patternMenu: z.array(patternMenuEntrySchema),
				pattern: enrichedPatternHitSchema.nullable(),
				patterns: z.array(enrichedPatternHitSchema),
				rationale: z.string(),
				chartPatternTradeSetup: chartPatternTradeSetupSchema.nullable(),
			})
			.strict(),
		meta: OhlcvAnalysisMetaSchema,
	})
	.strict();

export async function analyzeChartPatterns(
	input: unknown,
): Promise<SdkResult<z.infer<typeof AnalyzeChartPatternsOutputSchema>>> {
	const parsed = AnalyzeChartPatternsInputSchema.safeParse(input);
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

	const patternIds = filterChartPatternIds(parsed.data.patterns) as ChartPatternId[] | undefined;
	const minBars = maxChartPatternMinBars(patternIds);
	if (rawBars.length < minBars) {
		return {
			ok: false,
			reason: `Need at least ${minBars} OHLCV bars for classic chart pattern detection (got ${rawBars.length}).`,
		};
	}

	const analysis = analyzeChartPatternsFromBars(rawBars, {
		patternIds,
		focusWindow: parsed.data.focusWindow,
		minConfidence: parsed.data.minConfidence,
		swingLookback: parsed.data.swingLookback,
		smoothHeadShoulders: parsed.data.smoothHeadShoulders,
		smoothWindow: parsed.data.smoothWindow,
		retestTolerancePct: parsed.data.retestTolerancePct,
		retestAtrPeriod: parsed.data.retestAtrPeriod,
		retestAtrMultiplier: parsed.data.retestAtrMultiplier,
	});

	const patternsScanned = chartPatternsScannedCount(patternIds);
	const ohlcvMeta = buildOhlcvAnalysisMeta(rawBars, {
		title: parsed.data.title,
		toolResult: parsed.data.toolResult,
		patternsScanned,
		liveMerge,
		ohlcvFingerprint: fingerprint,
	});
	if (analysis.patterns.length) {
		const baseSummary = summarizeOhlcvBars(rawBars) ?? ohlcvMeta.ohlcvSummary;
		if (baseSummary) {
			const geometrySummary = ohlcvSummaryWithLiveMark(
				baseSummary,
				liveMerge.merged ? liveMerge.livePrice : undefined,
			);
			const geometryReject = rejectGeometryOutsideOhlcvSummary(
				geometrySummary,
				collectChartPatternHitPrices(analysis.patterns),
			);
			if (!geometryReject.ok) {
				return geometryReject;
			}
		}
	}
	const meta = ohlcvMeta;

	return {
		ok: true,
		data: {
			analysis,
			meta,
		},
	};
}

export {scanChartPatterns};
