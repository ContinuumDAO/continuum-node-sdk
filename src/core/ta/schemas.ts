import {z} from 'zod';

export const InputProfileSchema = z.enum([
	'close_series',
	'ohl_series',
	'ohlc_series',
	'hlcv_series',
	'ohlcv_series',
	'close_volume_series',
	'candle_objects',
	'range_scalar',
	'dual_series',
	'special',
]);

export type InputProfile = z.infer<typeof InputProfileSchema>;

export const OutputKindSchema = z.enum([
	'numbers',
	'objects',
	'booleans',
	'levels',
]);

export type OutputKind = z.infer<typeof OutputKindSchema>;

export const CandleInputSchema = z
	.object({
		open: z.number(),
		high: z.number(),
		low: z.number(),
		close: z.number(),
		volume: z.number().optional(),
	})
	.strict();

export const TaSeriesInputSchema = z
	.object({
		values: z.array(z.number()).optional(),
		open: z.array(z.number()).optional(),
		high: z.array(z.number()).optional(),
		low: z.array(z.number()).optional(),
		close: z.array(z.number()).optional(),
		volume: z.array(z.number()).optional(),
		candles: z.array(CandleInputSchema).optional(),
		range: z
			.object({
				high: z.number(),
				low: z.number(),
				trend: z.enum(['up', 'down']).optional(),
			})
			.strict()
			.optional(),
		valuesA: z.array(z.number()).optional(),
		valuesB: z.array(z.number()).optional(),
		swingPoints: z.array(z.number()).optional(),
	})
	.strict();

export type TaSeriesInput = z.infer<typeof TaSeriesInputSchema>;

export const CalculateTechnicalIndicatorInputSchema = z
	.object({
		indicator: z.string().min(1),
		params: z.record(z.string(), z.union([z.number(), z.boolean()])).optional(),
		input: TaSeriesInputSchema,
		options: z
			.object({
				trimWarmup: z.boolean().optional(),
				maxPoints: z.number().int().positive().optional(),
			})
			.strict()
			.optional(),
	})
	.strict();

export type CalculateTechnicalIndicatorInput = z.infer<
	typeof CalculateTechnicalIndicatorInputSchema
>;

export const IndicatorCatalogEntrySchema = z
	.object({
		id: z.string(),
		aliases: z.array(z.string()).optional(),
		category: z.string(),
		inputProfile: InputProfileSchema,
		defaultParams: z.record(z.string(), z.union([z.number(), z.boolean()])),
		outputKind: OutputKindSchema,
		description: z.string(),
	})
	.strict();

export const ListTechnicalIndicatorsOutputSchema = z
	.object({
		indicators: z.array(IndicatorCatalogEntrySchema),
	})
	.strict();

export const CalculateTechnicalIndicatorOutputSchema = z
	.object({
		indicator: z.string(),
		params: z.record(z.string(), z.unknown()),
		inputLength: z.number().int().nonnegative(),
		outputLength: z.number().int().nonnegative(),
		warmupCount: z.number().int().nonnegative(),
		result: z.union([
			z.array(z.number()),
			z.array(z.record(z.string(), z.unknown())),
			z.array(z.boolean()),
		]),
	})
	.strict();
