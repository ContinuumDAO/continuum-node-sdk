import {z} from 'zod';

export const ContinuumDocPageSchema = z
	.object({
		path: z.string(),
		title: z.string(),
		section: z.string(),
		headings: z.array(z.string()),
		excerpt: z.string(),
		url: z.string(),
	})
	.strict();

export const ContinuumDocsIndexSchema = z
	.object({
		version: z.number().int(),
		generatedAt: z.string(),
		pages: z.array(ContinuumDocPageSchema),
	})
	.strict();

export type ContinuumDocPage = z.infer<typeof ContinuumDocPageSchema>;
export type ContinuumDocsIndex = z.infer<typeof ContinuumDocsIndexSchema>;

export const SearchContinuumDocsHitSchema = z
	.object({
		path: z.string(),
		title: z.string(),
		section: z.string(),
		excerpt: z.string(),
		url: z.string(),
		score: z.number(),
	})
	.strict();

export const SearchContinuumDocsOutputSchema = z
	.object({
		hits: z.array(SearchContinuumDocsHitSchema),
		indexSource: z.enum(['live', 'bundled']),
		indexGeneratedAt: z.string().optional(),
	})
	.strict();

export const GetContinuumDocOutputSchema = z
	.object({
		path: z.string(),
		url: z.string(),
		title: z.string().optional(),
		content: z.string(),
		truncated: z.boolean(),
		offset: z.number().int().nonnegative(),
		totalChars: z.number().int().nonnegative(),
	})
	.strict();
