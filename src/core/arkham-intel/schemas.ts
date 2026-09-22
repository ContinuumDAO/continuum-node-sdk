import {z} from 'zod';

export const ArkhamHttpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'DELETE']);

export const ArkhamQueryParamsSchema = z
	.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
	.optional();

export const ArkhamApiRequestInputSchema = z
	.object({
		method: ArkhamHttpMethodSchema.default('GET'),
		path: z
			.string()
			.trim()
			.min(1)
			.describe('REST path only, e.g. /intelligence/address/0x… or /intelligence/search'),
		query_params: ArkhamQueryParamsSchema,
		body: z.record(z.string(), z.unknown()).optional(),
	})
	.strict();

export const ListArkhamApiPathsInputSchema = z.object({}).strict();

export const ArkhamApiPathSchema = z
	.object({
		method: ArkhamHttpMethodSchema,
		path: z.string(),
		description: z.string(),
	})
	.strict();

export const ListArkhamApiPathsOutputSchema = z
	.object({
		baseUrl: z.string(),
		docsUrl: z.string(),
		llmsUrl: z.string(),
		paths: z.array(ArkhamApiPathSchema),
	})
	.strict();

export const ArkhamApiRequestOutputSchema = z
	.object({
		method: ArkhamHttpMethodSchema,
		path: z.string(),
		status: z.number().int(),
		truncated: z.boolean(),
		warning: z.string().optional(),
		data: z.unknown(),
	})
	.strict();

export type ArkhamHttpMethod = z.infer<typeof ArkhamHttpMethodSchema>;
export type ArkhamApiRequestInput = z.infer<typeof ArkhamApiRequestInputSchema>;
export type ArkhamApiRequestOutput = z.infer<typeof ArkhamApiRequestOutputSchema>;
export type ListArkhamApiPathsOutput = z.infer<typeof ListArkhamApiPathsOutputSchema>;
