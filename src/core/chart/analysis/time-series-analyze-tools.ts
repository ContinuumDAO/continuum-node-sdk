import {z} from 'zod';
import type {SdkResult} from '../../result.js';
import {calculateTechnicalIndicator} from '../../ta/calculate.js';
import {DEFAULT_CHART_RSI_PERIOD} from '../chart-defaults.js';
import {validateTimeSeriesPointsFromToolResult} from '../chart-data-validation.js';
import {extractOhlcvBarsFromUnknown} from '../fetch-result.js';
import {
	extractTimeSeriesFromUnknown,
	type TimeSeriesPoint,
} from './time-series-input.js';

const seriesInputSchema = z
	.object({
		toolResult: z.unknown().optional(),
		rows: z.array(z.unknown()).min(1).optional(),
		title: z.string().trim().min(1).max(256).optional(),
		label: z.string().trim().min(1).max(128).optional(),
	})
	.strict();

function pointsFromToolInput(input: {
	toolResult?: unknown;
	rows?: unknown[];
}): TimeSeriesPoint[] {
	if (input.rows?.length) {
		return extractTimeSeriesFromUnknown(input.rows) ?? [];
	}
	if (input.toolResult != null) {
		return extractTimeSeriesFromUnknown(input.toolResult) ?? [];
	}
	return [];
}

function seriesMeta(points: TimeSeriesPoint[], title?: string) {
	return {
		pointCount: points.length,
		...(title ? {title} : {}),
	};
}

function timeSeriesPointRows(points: TimeSeriesPoint[]): Record<string, unknown>[] {
	return points.map(point => ({time: point.timeSec, value: point.value}));
}

function rejectInvalidTimeSeriesInput(input: {
	toolResult?: unknown;
	rows?: unknown[];
	title?: string;
	points: TimeSeriesPoint[];
}): SdkResult<never> | null {
	const pointRows =
		input.rows?.length && !input.toolResult
			? (input.rows as Record<string, unknown>[])
			: timeSeriesPointRows(input.points);
	if (input.toolResult != null) {
		const check = validateTimeSeriesPointsFromToolResult(
			pointRows,
			input.toolResult,
			input.title,
		);
		if (!check.ok) {
			return {ok: false, reason: check.reason};
		}
		return null;
	}
	if (input.title?.trim()) {
		const check = validateTimeSeriesPointsFromToolResult(pointRows, {}, input.title);
		if (!check.ok) {
			return {ok: false, reason: check.reason};
		}
	}
	return null;
}

function sortedPoints(points: TimeSeriesPoint[]): TimeSeriesPoint[] {
	return [...points].sort((a, b) => a.timeSec - b.timeSec);
}

function localExtrema(values: number[]): Array<{index: number; kind: 'peak' | 'trough'; value: number}> {
	const out: Array<{index: number; kind: 'peak' | 'trough'; value: number}> = [];
	for (let i = 1; i < values.length - 1; i++) {
		const prev = values[i - 1]!;
		const cur = values[i]!;
		const next = values[i + 1]!;
		if (cur >= prev && cur >= next && (cur > prev || cur > next)) {
			out.push({index: i, kind: 'peak', value: cur});
		} else if (cur <= prev && cur <= next && (cur < prev || cur < next)) {
			out.push({index: i, kind: 'trough', value: cur});
		}
	}
	return out;
}

function sliceMean(values: number[]): number | null {
	if (!values.length) {
		return null;
	}
	return values.reduce((a, b) => a + b, 0) / values.length;
}

export const AnalyzeTimeSeriesTrendInputSchema = seriesInputSchema;
export const AnalyzeTimeSeriesTrendOutputSchema = z
	.object({
		analysis: z
			.object({
				bias: z.enum(['rising', 'falling', 'flat']),
				slopePct: z.number(),
				firstValue: z.number(),
				lastValue: z.number(),
				changePct: z.number(),
				extrema: z.array(
					z
						.object({
							kind: z.enum(['peak', 'trough']),
							timeSec: z.number(),
							value: z.number(),
						})
						.strict(),
				),
			})
			.strict(),
		meta: z.object({pointCount: z.number(), title: z.string().optional()}).strict(),
	})
	.strict();

export function analyzeTimeSeriesTrend(
	input: unknown,
): SdkResult<z.infer<typeof AnalyzeTimeSeriesTrendOutputSchema>> {
	const parsed = AnalyzeTimeSeriesTrendInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.message};
	}
	const points = sortedPoints(pointsFromToolInput(parsed.data));
	const reject = rejectInvalidTimeSeriesInput({...parsed.data, points});
	if (reject) {
		return reject;
	}
	if (points.length < 3) {
		return {ok: false, reason: 'Need at least 3 time-series points for trend analysis.'};
	}
	const values = points.map(p => p.value);
	const first = values[0]!;
	const last = values[values.length - 1]!;
	const changePct = first !== 0 ? ((last - first) / first) * 100 : 0;
	const third = Math.max(1, Math.floor(values.length / 3));
	const earlyMean = sliceMean(values.slice(0, third)) ?? first;
	const recentMean = sliceMean(values.slice(-third)) ?? last;
	let bias: 'rising' | 'falling' | 'flat' = 'flat';
	if (recentMean > earlyMean * 1.002) {
		bias = 'rising';
	} else if (recentMean < earlyMean * 0.998) {
		bias = 'falling';
	}
	const slopePct = first !== 0 ? ((last - first) / first / Math.max(1, values.length - 1)) * 100 : 0;
	const extrema = localExtrema(values)
		.slice(-6)
		.map(e => ({
			kind: e.kind,
			timeSec: points[e.index]!.timeSec,
			value: e.value,
		}));

	return {
		ok: true,
		data: {
			analysis: {
				bias,
				slopePct,
				firstValue: first,
				lastValue: last,
				changePct,
				extrema,
			},
			meta: seriesMeta(points, parsed.data.title),
		},
	};
}

export const AnalyzeTimeSeriesMomentumInputSchema = seriesInputSchema.extend({
	rsiPeriod: z.number().int().min(2).max(100).optional(),
});
export const AnalyzeTimeSeriesMomentumOutputSchema = z
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
				roc: z
					.object({
						period: z.number(),
						valuePct: z.number().nullable(),
					})
					.strict(),
			})
			.strict(),
		meta: z.object({pointCount: z.number(), title: z.string().optional()}).strict(),
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

export function analyzeTimeSeriesMomentum(
	input: unknown,
): SdkResult<z.infer<typeof AnalyzeTimeSeriesMomentumOutputSchema>> {
	const parsed = AnalyzeTimeSeriesMomentumInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.message};
	}
	const points = sortedPoints(pointsFromToolInput(parsed.data));
	const reject = rejectInvalidTimeSeriesInput({...parsed.data, points});
	if (reject) {
		return reject;
	}
	const values = points.map(p => p.value);
	if (values.length < DEFAULT_CHART_RSI_PERIOD + 2) {
		return {ok: false, reason: 'Need more points for time-series momentum analysis.'};
	}
	const rsiPeriod = parsed.data.rsiPeriod ?? DEFAULT_CHART_RSI_PERIOD;
	const rsiResult = calculateTechnicalIndicator({
		indicator: 'rsi',
		params: {period: rsiPeriod},
		input: {values},
		options: {maxPoints: values.length},
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
	const rocPeriod = Math.min(14, Math.max(2, Math.floor(values.length / 5)));
	const base = values[values.length - 1 - rocPeriod];
	const latest = values[values.length - 1]!;
	const rocPct = base != null && base !== 0 ? ((latest - base) / base) * 100 : null;

	return {
		ok: true,
		data: {
			analysis: {
				rsi: {period: rsiPeriod, value: rsiValue, zone: rsiZone},
				roc: {period: rocPeriod, valuePct: rocPct},
			},
			meta: seriesMeta(points, parsed.data.title),
		},
	};
}

export const AnalyzeTimeSeriesStatsInputSchema = seriesInputSchema;
export const AnalyzeTimeSeriesStatsOutputSchema = z
	.object({
		analysis: z
			.object({
				min: z.number(),
				max: z.number(),
				mean: z.number(),
				firstValue: z.number(),
				lastValue: z.number(),
				changePct: z.number(),
				returnVolatilityPct: z.number().nullable(),
				recentRangePct: z.number(),
				priorRangePct: z.number(),
				compression: z.enum(['compressing', 'expanding', 'stable']),
			})
			.strict(),
		meta: z.object({pointCount: z.number(), title: z.string().optional()}).strict(),
	})
	.strict();

export function analyzeTimeSeriesStats(
	input: unknown,
): SdkResult<z.infer<typeof AnalyzeTimeSeriesStatsOutputSchema>> {
	const parsed = AnalyzeTimeSeriesStatsInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.message};
	}
	const points = sortedPoints(pointsFromToolInput(parsed.data));
	const reject = rejectInvalidTimeSeriesInput({...parsed.data, points});
	if (reject) {
		return reject;
	}
	if (points.length < 2) {
		return {ok: false, reason: 'Need at least 2 time-series points for stats analysis.'};
	}
	const values = points.map(p => p.value);
	const first = values[0]!;
	const last = values[values.length - 1]!;
	const min = Math.min(...values);
	const max = Math.max(...values);
	const mean = values.reduce((a, b) => a + b, 0) / values.length;
	const changePct = first !== 0 ? ((last - first) / first) * 100 : 0;

	const returns: number[] = [];
	for (let i = 1; i < values.length; i++) {
		const prev = values[i - 1]!;
		if (prev !== 0) {
			returns.push(((values[i]! - prev) / prev) * 100);
		}
	}
	let returnVolatilityPct: number | null = null;
	if (returns.length >= 2) {
		const retMean = returns.reduce((a, b) => a + b, 0) / returns.length;
		const variance =
			returns.reduce((sum, r) => sum + (r - retMean) ** 2, 0) / (returns.length - 1);
		returnVolatilityPct = Math.sqrt(variance);
	}

	const half = Math.floor(values.length / 2);
	const rangePct = (slice: number[]) => {
		if (!slice.length || mean === 0) {
			return 0;
		}
		const hi = Math.max(...slice);
		const lo = Math.min(...slice);
		return ((hi - lo) / mean) * 100;
	};
	const recentRangePct = rangePct(values.slice(half));
	const priorRangePct = rangePct(values.slice(0, half));
	let compression: 'compressing' | 'expanding' | 'stable' = 'stable';
	if (recentRangePct < priorRangePct * 0.85) {
		compression = 'compressing';
	} else if (recentRangePct > priorRangePct * 1.15) {
		compression = 'expanding';
	}

	return {
		ok: true,
		data: {
			analysis: {
				min,
				max,
				mean,
				firstValue: first,
				lastValue: last,
				changePct,
				returnVolatilityPct,
				recentRangePct,
				priorRangePct,
				compression,
			},
			meta: seriesMeta(points, parsed.data.title),
		},
	};
}

/** When input is line-only, OHLCV tools should direct callers to time-series tools. */
export function ohlcvToolRejectIfLineOnly(input: {
	toolResult?: unknown;
	rows?: unknown[];
}): SdkResult<never> | null {
	const bars = input.rows?.length
		? extractOhlcvBarsFromUnknown(input.rows)
		: input.toolResult != null
			? extractOhlcvBarsFromUnknown(input.toolResult)
			: null;
	if (bars?.length) {
		return null;
	}
	const points = pointsFromToolInput(input);
	if (points.length > 0) {
		return {
			ok: false,
			reason:
				'Line-only time series detected. Use analyze_time_series_trend, analyze_time_series_momentum, or analyze_time_series_stats.',
		};
	}
	return null;
}
