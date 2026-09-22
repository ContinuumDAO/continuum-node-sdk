import {z} from 'zod';

export const CryptoSecuritySourceIdSchema = z.enum([
	'quillaudits',
	'slowmist',
	'immunefi',
	'blocksec',
	'certik',
	'rekt',
	'trail-of-bits',
]);

export const ListCryptoSecuritySourcesInputSchema = z.object({}).strict();

export const ListCryptoSecuritySourcesOutputSchema = z
	.object({
		sources: z.array(
			z
				.object({
					id: CryptoSecuritySourceIdSchema,
					displayName: z.string(),
					url: z.string(),
				})
				.strict(),
		),
	})
	.strict();

export const GetCryptoSecurityLatestInputSchema = z
	.object({
		sourceId: CryptoSecuritySourceIdSchema.optional(),
		limit: z.number().int().min(1).max(25).optional(),
	})
	.strict();

export const SearchCryptoSecurityInputSchema = z
	.object({
		query: z.string().trim().min(1),
		sourceId: CryptoSecuritySourceIdSchema.optional(),
		limit: z.number().int().min(1).max(25).optional(),
	})
	.strict();

export const CryptoSecurityItemSchema = z
	.object({
		sourceId: CryptoSecuritySourceIdSchema,
		sourceName: z.string(),
		title: z.string(),
		url: z.string(),
		publishedAt: z.string().optional(),
		publishedRaw: z.string().optional(),
		summary: z.string().optional(),
	})
	.strict();

export const CryptoSecurityFeedResultSchema = z
	.object({
		sourceId: CryptoSecuritySourceIdSchema,
		sourceName: z.string(),
		ok: z.boolean(),
		itemCount: z.number().int().nonnegative(),
		reason: z.string().optional(),
	})
	.strict();

export const GetCryptoSecurityLatestOutputSchema = z
	.object({
		items: z.array(CryptoSecurityItemSchema),
		feeds: z.array(CryptoSecurityFeedResultSchema),
	})
	.strict();

export type ListCryptoSecuritySourcesOutput = z.infer<typeof ListCryptoSecuritySourcesOutputSchema>;
export type GetCryptoSecurityLatestInput = z.infer<typeof GetCryptoSecurityLatestInputSchema>;
export type SearchCryptoSecurityInput = z.infer<typeof SearchCryptoSecurityInputSchema>;
export type CryptoSecurityItem = z.infer<typeof CryptoSecurityItemSchema>;
export type GetCryptoSecurityLatestOutput = z.infer<typeof GetCryptoSecurityLatestOutputSchema>;
