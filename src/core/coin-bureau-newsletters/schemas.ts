import {z} from 'zod';

export const GetCoinBureauLatestInputSchema = z
	.object({
		limit: z.number().int().min(1).max(25).optional(),
	})
	.strict();

export const SearchCoinBureauNewslettersInputSchema = z
	.object({
		query: z.string().trim().min(1),
		limit: z.number().int().min(1).max(25).optional(),
	})
	.strict();

export const CoinBureauNewsletterItemSchema = z
	.object({
		slug: z.string(),
		title: z.string(),
		url: z.string(),
		publishedAt: z.string().optional(),
		publishedRaw: z.string().optional(),
		summary: z.string().optional(),
	})
	.strict();

export const GetCoinBureauLatestOutputSchema = z
	.object({
		items: z.array(CoinBureauNewsletterItemSchema),
		archiveOk: z.boolean(),
		sitemapOk: z.boolean(),
		itemCount: z.number().int().nonnegative(),
		reason: z.string().optional(),
	})
	.strict();

export type GetCoinBureauLatestInput = z.infer<typeof GetCoinBureauLatestInputSchema>;
export type SearchCoinBureauNewslettersInput = z.infer<
	typeof SearchCoinBureauNewslettersInputSchema
>;
export type CoinBureauNewsletterItem = z.infer<typeof CoinBureauNewsletterItemSchema>;
export type GetCoinBureauLatestOutput = z.infer<typeof GetCoinBureauLatestOutputSchema>;
