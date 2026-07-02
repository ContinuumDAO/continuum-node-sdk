import {z} from 'zod';
import {PrepareChartOverlaysSchema} from './overlay-schemas.js';

export {ChartOverlayInputSchema, PrepareChartOverlaysSchema} from './overlay-schemas.js';
export type {ChartOverlayInput} from './overlay-schemas.js';

export const CHART_V1_KIND = 'continuum/chart/v1' as const;

export const DEFAULT_CHART_MAX_POINTS = 5_000;
export const DEFAULT_CHART_HEIGHT = 280;
export const MAX_CHART_SERIES = 40;

export const ChartSeriesTypeSchema = z.enum(['line', 'candlestick', 'area', 'histogram']);

export const ChartLineStyleSchema = z.enum(['solid', 'dashed', 'dotted']);

export const ChartSeriesStyleSchema = z
	.object({
		color: z.string().min(1).optional(),
		lineWidth: z.number().positive().optional(),
		lineStyle: ChartLineStyleSchema.optional(),
	})
	.strict();

export const ChartSeriesInputSchema = z
	.object({
		id: z.string().min(1).max(64),
		type: ChartSeriesTypeSchema,
		label: z.string().min(1).max(128),
		data: z.array(z.record(z.string(), z.unknown())).min(1),
		priceScaleId: z.enum(['left', 'right']).optional(),
		overlay: z.boolean().optional(),
		style: ChartSeriesStyleSchema.optional(),
	})
	.strict();

export const PrepareChartInputSchema = z
	.object({
		title: z.string().max(256).optional(),
		height: z.number().int().min(120).max(800).optional(),
		series: z.array(ChartSeriesInputSchema).min(1).max(16),
		overlays: PrepareChartOverlaysSchema.optional(),
		options: z
			.object({
				maxPoints: z.number().int().min(2).max(DEFAULT_CHART_MAX_POINTS).optional(),
				/** Match histogram bars to candlestick open/close at the same time (any bar period). Default true. */
				colorVolumeFromCandles: z.boolean().optional(),
			})
			.strict()
			.optional(),
	})
	.strict();

export const ChartTimeSchema = z.union([
	z.number().int().nonnegative(),
	z
		.object({
			year: z.number().int(),
			month: z.number().int().min(1).max(12),
			day: z.number().int().min(1).max(31),
		})
		.strict(),
]);

export const ChartPaneSchema = z
	.object({
		id: z.string().min(1).max(64),
		heightRatio: z.number().positive().max(1),
	})
	.strict();

export const ChartSeriesOutputSchema = z
	.object({
		id: z.string(),
		type: ChartSeriesTypeSchema,
		label: z.string(),
		data: z.array(z.record(z.string(), z.unknown())),
		priceScaleId: z.enum(['left', 'right']).optional(),
		paneId: z.string().min(1).max(64).optional(),
		overlay: z.boolean().optional(),
		style: ChartSeriesStyleSchema.optional(),
	})
	.strict();

export const ChartV1PayloadSchema = z
	.object({
		title: z.string().optional(),
		height: z.number().int().optional(),
		panes: z.array(ChartPaneSchema).min(1).max(12).optional(),
		series: z.array(ChartSeriesOutputSchema).min(1).max(MAX_CHART_SERIES),
	})
	.strict();

export const PrepareChartOutputSchema = z
	.object({
		kind: z.literal(CHART_V1_KIND),
		chart: ChartV1PayloadSchema,
	})
	.strict();

export type ChartSeriesType = z.infer<typeof ChartSeriesTypeSchema>;
export type ChartSeriesStyle = z.infer<typeof ChartSeriesStyleSchema>;
export type PrepareChartInput = z.infer<typeof PrepareChartInputSchema>;
export type PrepareChartOutput = z.infer<typeof PrepareChartOutputSchema>;
export type ChartV1Payload = z.infer<typeof ChartV1PayloadSchema>;
export type ChartTime = z.infer<typeof ChartTimeSchema>;
