import {z} from 'zod';

export const CryptoBanterSourceIdSchema = z.enum([
	'the-insider',
	'good-morning-crypto',
	'the-daily-candle',
]);

export const ListCryptoBanterSourcesInputSchema = z.object({}).strict();

export const ListCryptoBanterSourcesOutputSchema = z
	.object({
		sources: z.array(
			z
				.object({
					id: CryptoBanterSourceIdSchema,
					displayName: z.string(),
					url: z.string(),
				})
				.strict(),
		),
	})
	.strict();

export const GetCryptoBanterLatestInputSchema = z
	.object({
		sourceId: CryptoBanterSourceIdSchema.optional(),
		limit: z.number().int().min(1).max(25).optional(),
	})
	.strict();

export const SearchCryptoBanterNewslettersInputSchema = z
	.object({
		query: z.string().trim().min(1),
		sourceId: CryptoBanterSourceIdSchema.optional(),
		limit: z.number().int().min(1).max(25).optional(),
	})
	.strict();

export const CryptoBanterNewsletterItemSchema = z
	.object({
		sourceId: CryptoBanterSourceIdSchema,
		sourceName: z.string(),
		title: z.string(),
		url: z.string(),
		publishedAt: z.string().optional(),
		publishedRaw: z.string().optional(),
		summary: z.string().optional(),
	})
	.strict();

export const CryptoBanterFeedResultSchema = z
	.object({
		sourceId: CryptoBanterSourceIdSchema,
		sourceName: z.string(),
		ok: z.boolean(),
		itemCount: z.number().int().nonnegative(),
		reason: z.string().optional(),
	})
	.strict();

export const GetCryptoBanterLatestOutputSchema = z
	.object({
		items: z.array(CryptoBanterNewsletterItemSchema),
		feeds: z.array(CryptoBanterFeedResultSchema),
	})
	.strict();

export type ListCryptoBanterSourcesOutput = z.infer<typeof ListCryptoBanterSourcesOutputSchema>;
export type GetCryptoBanterLatestInput = z.infer<typeof GetCryptoBanterLatestInputSchema>;
export type SearchCryptoBanterNewslettersInput = z.infer<
	typeof SearchCryptoBanterNewslettersInputSchema
>;
export type CryptoBanterNewsletterItem = z.infer<typeof CryptoBanterNewsletterItemSchema>;
export type GetCryptoBanterLatestOutput = z.infer<typeof GetCryptoBanterLatestOutputSchema>;
