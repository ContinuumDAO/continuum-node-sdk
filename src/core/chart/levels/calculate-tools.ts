import {z} from 'zod';
import type {SdkResult} from '../../result.js';
import {extractOhlcvBarsFromUnknown} from '../fetch-result.js';
import {calculateFibonacciRangeFromBars, calculateKeyLevelsFromBars} from './key-levels.js';
import {calculatePivotPointsFromBars} from './pivot-points.js';
import {calculateTrendLinesFromBars} from './trend-lines.js';

const barsInputSchema = z
	.object({
		toolResult: z.unknown().optional(),
		rows: z.array(z.unknown()).min(1).optional(),
		title: z.string().trim().min(1).max(256).optional(),
		label: z.string().trim().min(1).max(128).optional(),
		lookback: z.number().int().min(2).max(20).optional(),
		tolerancePct: z.number().positive().max(0.05).optional(),
		maxLevels: z.number().int().min(1).max(12).optional(),
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

export const CalculateKeyLevelsInputSchema = barsInputSchema;
export const CalculateKeyLevelsOutputSchema = z
	.object({
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
	.strict();

export function calculateKeyLevels(input: unknown): SdkResult<z.infer<typeof CalculateKeyLevelsOutputSchema>> {
	const parsed = CalculateKeyLevelsInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.message};
	}
	const bars = barsFromToolInput(parsed.data);
	if (!bars.length) {
		return {ok: false, reason: 'No OHLCV bars in toolResult or rows.'};
	}
	const levels = calculateKeyLevelsFromBars(bars, parsed.data);
	return {ok: true, data: {levels}};
}

export const CalculatePivotPointsInputSchema = barsInputSchema.omit({
	lookback: true,
	tolerancePct: true,
	maxLevels: true,
});
export const CalculatePivotPointsOutputSchema = z
	.object({
		pivots: z.array(z.object({id: z.string(), price: z.number()}).strict()),
		sourceBar: z.object({high: z.number(), low: z.number(), close: z.number()}).strict(),
	})
	.strict();

export function calculatePivotPoints(
	input: unknown,
): SdkResult<z.infer<typeof CalculatePivotPointsOutputSchema>> {
	const parsed = CalculatePivotPointsInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.message};
	}
	const bars = barsFromToolInput(parsed.data);
	return calculatePivotPointsFromBars(bars);
}

export const CalculateFibonacciRangeInputSchema = barsInputSchema.omit({
	lookback: true,
	tolerancePct: true,
	maxLevels: true,
});
export const CalculateFibonacciRangeOutputSchema = z
	.object({
		range: z.object({
			high: z.number(),
			low: z.number(),
			trend: z.enum(['up', 'down']),
		}),
	})
	.strict();

export function calculateFibonacciRange(
	input: unknown,
): SdkResult<z.infer<typeof CalculateFibonacciRangeOutputSchema>> {
	const parsed = CalculateFibonacciRangeInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.message};
	}
	const bars = barsFromToolInput(parsed.data);
	if (!bars.length) {
		return {ok: false, reason: 'No OHLCV bars in toolResult or rows.'};
	}
	const range = calculateFibonacciRangeFromBars(bars);
	if (!range) {
		return {ok: false, reason: 'Could not detect a swing range for Fibonacci.'};
	}
	return {ok: true, data: {range}};
}

const trendLinePointOutputSchema = z
	.object({
		time: z.number(),
		price: z.number(),
	})
	.strict();

export const CalculateTrendLinesInputSchema = barsInputSchema.omit({
	tolerancePct: true,
}).extend({
	tolerancePct: z.number().positive().max(0.05).optional(),
	minTouches: z.number().int().min(2).max(12).optional(),
	maxLines: z.number().int().min(1).max(4).optional(),
});

export const CalculateTrendLinesOutputSchema = z
	.object({
		trendLines: z.array(
			z
				.object({
					kind: z.enum(['support', 'resistance']),
					pointA: trendLinePointOutputSchema,
					pointB: trendLinePointOutputSchema,
					slope: z.number(),
					touchCount: z.number(),
					score: z.number(),
				})
				.strict(),
		),
	})
	.strict();

export function calculateTrendLines(
	input: unknown,
): SdkResult<z.infer<typeof CalculateTrendLinesOutputSchema>> {
	const parsed = CalculateTrendLinesInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.message};
	}
	const bars = barsFromToolInput(parsed.data);
	if (!bars.length) {
		return {ok: false, reason: 'No OHLCV bars in toolResult or rows.'};
	}
	const trendLines = calculateTrendLinesFromBars(bars, parsed.data);
	return {ok: true, data: {trendLines}};
}
