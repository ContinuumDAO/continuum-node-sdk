import {z} from 'zod';

export const CryptoLatestSourceIdSchema = z.enum([
	'coindesk',
	'the-block',
	'cointelegraph',
	'decrypt',
	'blockworks',
	'the-defiant',
	'bitcoin-magazine',
	'crypto-potato',
	'crypto-slate',
	'good-morning-crypto',
	'openzeppelin',
]);

export const ListCryptoSourcesInputSchema = z.object({}).strict();

export const ListCryptoSourcesOutputSchema = z
	.object({
		sources: z.array(
			z
				.object({
					id: CryptoLatestSourceIdSchema,
					displayName: z.string(),
					url: z.string(),
				})
				.strict(),
		),
	})
	.strict();

export const GetCryptoLatestInputSchema = z
	.object({
		sourceId: CryptoLatestSourceIdSchema.optional(),
		limit: z.number().int().min(1).max(25).optional(),
	})
	.strict();

export const SearchCryptoLatestInputSchema = z
	.object({
		query: z.string().trim().min(1),
		sourceId: CryptoLatestSourceIdSchema.optional(),
		limit: z.number().int().min(1).max(25).optional(),
	})
	.strict();

export const CryptoLatestItemSchema = z
	.object({
		sourceId: CryptoLatestSourceIdSchema,
		sourceName: z.string(),
		title: z.string(),
		url: z.string(),
		publishedAt: z.string().optional(),
		publishedRaw: z.string().optional(),
		summary: z.string().optional(),
	})
	.strict();

export const CryptoLatestFeedResultSchema = z
	.object({
		sourceId: CryptoLatestSourceIdSchema,
		sourceName: z.string(),
		ok: z.boolean(),
		itemCount: z.number().int().nonnegative(),
		reason: z.string().optional(),
	})
	.strict();

export const GetCryptoLatestOutputSchema = z
	.object({
		items: z.array(CryptoLatestItemSchema),
		feeds: z.array(CryptoLatestFeedResultSchema),
	})
	.strict();

export type ListCryptoSourcesOutput = z.infer<typeof ListCryptoSourcesOutputSchema>;
export type GetCryptoLatestInput = z.infer<typeof GetCryptoLatestInputSchema>;
export type SearchCryptoLatestInput = z.infer<typeof SearchCryptoLatestInputSchema>;
export type CryptoLatestItem = z.infer<typeof CryptoLatestItemSchema>;
export type GetCryptoLatestOutput = z.infer<typeof GetCryptoLatestOutputSchema>;
