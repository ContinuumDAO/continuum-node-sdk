import {z} from 'zod';

export const BusinessLatestSourceIdSchema = z.enum([
	'bbc-business',
	'cnbc-business',
	'marketwatch',
	'forbes-business',
	'reuters-world',
]);

export const ListBusinessSourcesInputSchema = z.object({}).strict();

export const ListBusinessSourcesOutputSchema = z
	.object({
		sources: z.array(
			z
				.object({
					id: BusinessLatestSourceIdSchema,
					displayName: z.string(),
					url: z.string(),
				})
				.strict(),
		),
	})
	.strict();

export const GetBusinessLatestInputSchema = z
	.object({
		sourceId: BusinessLatestSourceIdSchema.optional(),
		limit: z.number().int().min(1).max(25).optional(),
	})
	.strict();

export const SearchBusinessLatestInputSchema = z
	.object({
		query: z.string().trim().min(1),
		sourceId: BusinessLatestSourceIdSchema.optional(),
		limit: z.number().int().min(1).max(25).optional(),
	})
	.strict();

export const BusinessLatestItemSchema = z
	.object({
		sourceId: BusinessLatestSourceIdSchema,
		sourceName: z.string(),
		title: z.string(),
		url: z.string(),
		publishedAt: z.string().optional(),
		publishedRaw: z.string().optional(),
		summary: z.string().optional(),
	})
	.strict();

export const BusinessLatestFeedResultSchema = z
	.object({
		sourceId: BusinessLatestSourceIdSchema,
		sourceName: z.string(),
		ok: z.boolean(),
		itemCount: z.number().int().nonnegative(),
		reason: z.string().optional(),
	})
	.strict();

export const GetBusinessLatestOutputSchema = z
	.object({
		items: z.array(BusinessLatestItemSchema),
		feeds: z.array(BusinessLatestFeedResultSchema),
	})
	.strict();

export type ListBusinessSourcesOutput = z.infer<typeof ListBusinessSourcesOutputSchema>;
export type GetBusinessLatestInput = z.infer<typeof GetBusinessLatestInputSchema>;
export type SearchBusinessLatestInput = z.infer<typeof SearchBusinessLatestInputSchema>;
export type BusinessLatestItem = z.infer<typeof BusinessLatestItemSchema>;
export type GetBusinessLatestOutput = z.infer<typeof GetBusinessLatestOutputSchema>;
