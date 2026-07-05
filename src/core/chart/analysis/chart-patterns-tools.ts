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
import {extractOhlcvBarsFromUnknown, parseJsonIfString} from '../fetch-result.js';
import {ohlcvToolRejectIfLineOnly} from './time-series-analyze-tools.js';

export function preprocessAnalyzeChartPatternsInput(raw: unknown): unknown {
	if (typeof raw !== 'object' || raw == null) {
		return raw;
	}
	const input = {...(raw as Record<string, unknown>)};
	if (input.toolResult != null) {
		input.toolResult = parseJsonIfString(input.toolResult);
	}
	return input;
}

const barsInputSchema = z
	.object({
		toolResult: z.unknown().optional(),
		rows: z.array(z.unknown()).min(1).optional(),
		title: z.string().trim().min(1).max(256).optional(),
	})
	.strict();

export const AnalyzeChartPatternsInputInnerSchema = barsInputSchema.extend({
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

export const AnalyzeChartPatternsOutputSchema = z
	.object({
		analysis: z
			.object({
				summary: z.string(),
				classification: classificationSchema.nullable(),
				interpretation: z.string(),
				primaryPattern: z
					.object({
						id: z.string(),
						name: z.string(),
						classification: classificationSchema,
						confidence: z.number(),
						interpretation: z.string(),
					})
					.strict()
					.nullable(),
				pattern: patternHitSchema.nullable(),
				patterns: z.array(patternHitSchema),
				rationale: z.string(),
			})
			.strict(),
		meta: z
			.object({
				barCount: z.number(),
				title: z.string().optional(),
				patternsScanned: z.number().int(),
			})
			.strict(),
	})
	.strict();

function barsFromToolInput(input: {
	toolResult?: unknown;
	rows?: unknown[];
}): Record<string, unknown>[] {
	if (input.rows?.length) {
		return input.rows as Record<string, unknown>[];
	}
	if (input.toolResult != null) {
		return (extractOhlcvBarsFromUnknown(input.toolResult) ?? []) as Record<string, unknown>[];
	}
	return [];
}

export function analyzeChartPatterns(
	input: unknown,
): SdkResult<z.infer<typeof AnalyzeChartPatternsOutputSchema>> {
	const parsed = AnalyzeChartPatternsInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.message};
	}
	const lineReject = ohlcvToolRejectIfLineOnly(parsed.data);
	if (lineReject) {
		return lineReject;
	}
	const rawBars = barsFromToolInput(parsed.data);
	if (!rawBars.length) {
		return {ok: false, reason: 'Provide OHLCV rows or toolResult with candle data.'};
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

	return {
		ok: true,
		data: {
			analysis,
			meta: {
				barCount: rawBars.length,
				...(parsed.data.title ? {title: parsed.data.title} : {}),
				patternsScanned: chartPatternsScannedCount(patternIds),
			},
		},
	};
}

export {scanChartPatterns};
