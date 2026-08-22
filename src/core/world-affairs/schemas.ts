import {z} from 'zod';

export const WorldAffairsSourceIdSchema = z.enum([
	'bbc-world',
	'aljazeera',
	'guardian-world',
	'dw-world',
	'france24',
	'npr',
	'cnn-world',
	'rt-news',
]);

export const ListWorldAffairsSourcesInputSchema = z.object({}).strict();

export const ListWorldAffairsSourcesOutputSchema = z
	.object({
		sources: z.array(
			z
				.object({
					id: WorldAffairsSourceIdSchema,
					displayName: z.string(),
					url: z.string(),
					biasNote: z.string().optional(),
				})
				.strict(),
		),
	})
	.strict();

export const GetWorldAffairsLatestInputSchema = z
	.object({
		sourceId: WorldAffairsSourceIdSchema.optional(),
		limit: z.number().int().min(1).max(25).optional(),
	})
	.strict();

export const SearchWorldAffairsLatestInputSchema = z
	.object({
		query: z.string().trim().min(1),
		sourceId: WorldAffairsSourceIdSchema.optional(),
		limit: z.number().int().min(1).max(25).optional(),
	})
	.strict();

export const WorldAffairsItemSchema = z
	.object({
		sourceId: WorldAffairsSourceIdSchema,
		sourceName: z.string(),
		title: z.string(),
		url: z.string(),
		publishedAt: z.string().optional(),
		publishedRaw: z.string().optional(),
		summary: z.string().optional(),
		biasNote: z.string().optional(),
	})
	.strict();

export const WorldAffairsFeedResultSchema = z
	.object({
		sourceId: WorldAffairsSourceIdSchema,
		sourceName: z.string(),
		ok: z.boolean(),
		itemCount: z.number().int().nonnegative(),
		reason: z.string().optional(),
		biasNote: z.string().optional(),
	})
	.strict();

export const GetWorldAffairsLatestOutputSchema = z
	.object({
		items: z.array(WorldAffairsItemSchema),
		feeds: z.array(WorldAffairsFeedResultSchema),
	})
	.strict();

export type ListWorldAffairsSourcesOutput = z.infer<
	typeof ListWorldAffairsSourcesOutputSchema
>;
export type GetWorldAffairsLatestInput = z.infer<typeof GetWorldAffairsLatestInputSchema>;
export type SearchWorldAffairsLatestInput = z.infer<
	typeof SearchWorldAffairsLatestInputSchema
>;
export type WorldAffairsItem = z.infer<typeof WorldAffairsItemSchema>;
export type GetWorldAffairsLatestOutput = z.infer<typeof GetWorldAffairsLatestOutputSchema>;
