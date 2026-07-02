import {z} from 'zod';

const overlayStyleSchema = z
	.object({
		color: z.string().min(1).optional(),
		lineWidth: z.number().positive().optional(),
		lineStyle: z.enum(['solid', 'dashed', 'dotted']).optional(),
	})
	.strict();

export const ChartMaOverlaySchema = z
	.object({
		type: z.enum(['sma', 'ema']),
		sourceSeriesId: z.string().min(1).max(64),
		period: z.number().int().min(2).max(500).optional(),
		id: z.string().min(1).max(64).optional(),
		label: z.string().min(1).max(128).optional(),
		overlay: z.boolean().optional(),
		priceScaleId: z.enum(['left', 'right']).optional(),
		style: overlayStyleSchema.optional(),
	})
	.strict();

export const ChartBollingerOverlaySchema = z
	.object({
		type: z.literal('bollinger'),
		sourceSeriesId: z.string().min(1).max(64),
		period: z.number().int().min(2).max(500).optional(),
		stdDev: z.number().positive().max(10).optional(),
		id: z.string().min(1).max(64).optional(),
		overlay: z.boolean().optional(),
		priceScaleId: z.enum(['left', 'right']).optional(),
		style: overlayStyleSchema.optional(),
	})
	.strict();

export const ChartFibonacciRangeSchema = z
	.object({
		high: z.number(),
		low: z.number(),
		trend: z.enum(['up', 'down']),
	})
	.strict();

export const ChartFibonacciOverlaySchema = z
	.object({
		type: z.literal('fibonacci'),
		sourceSeriesId: z.string().min(1).max(64).optional(),
		range: ChartFibonacciRangeSchema.optional(),
		/** Subset of retracement ratios; default all standard levels (0 … 1). */
		levels: z.array(z.number().min(0).max(1)).min(1).max(12).optional(),
		trend: z.enum(['up', 'down']).optional(),
		id: z.string().min(1).max(64).optional(),
		overlay: z.boolean().optional(),
		priceScaleId: z.enum(['left', 'right']).optional(),
		style: overlayStyleSchema.optional(),
	})
	.strict()
	.refine(o => o.sourceSeriesId != null || o.range != null, {
		message: 'Fibonacci overlay requires sourceSeriesId and/or range.',
	});

export const ChartRsiOverlaySchema = z
	.object({
		type: z.literal('rsi'),
		sourceSeriesId: z.string().min(1).max(64),
		period: z.number().int().min(2).max(500).optional(),
		id: z.string().min(1).max(64).optional(),
		label: z.string().min(1).max(128).optional(),
		style: overlayStyleSchema.optional(),
	})
	.strict();

export const ChartMacdOverlaySchema = z
	.object({
		type: z.literal('macd'),
		sourceSeriesId: z.string().min(1).max(64),
		fastPeriod: z.number().int().min(2).max(500).optional(),
		slowPeriod: z.number().int().min(2).max(500).optional(),
		signalPeriod: z.number().int().min(2).max(500).optional(),
		id: z.string().min(1).max(64).optional(),
		style: overlayStyleSchema.optional(),
	})
	.strict();

export const ChartStochasticRsiOverlaySchema = z
	.object({
		type: z.literal('stochasticrsi'),
		sourceSeriesId: z.string().min(1).max(64),
		rsiPeriod: z.number().int().min(2).max(500).optional(),
		stochasticPeriod: z.number().int().min(2).max(500).optional(),
		kPeriod: z.number().int().min(1).max(500).optional(),
		dPeriod: z.number().int().min(1).max(500).optional(),
		id: z.string().min(1).max(64).optional(),
		style: overlayStyleSchema.optional(),
	})
	.strict();

export const ChartOverlayInputSchema = z.discriminatedUnion('type', [
	ChartMaOverlaySchema,
	ChartBollingerOverlaySchema,
	ChartFibonacciOverlaySchema,
	ChartRsiOverlaySchema,
	ChartMacdOverlaySchema,
	ChartStochasticRsiOverlaySchema,
]);

export const PrepareChartOverlaysSchema = z.array(ChartOverlayInputSchema).max(8);

export type ChartOverlayInput = z.infer<typeof ChartOverlayInputSchema>;
