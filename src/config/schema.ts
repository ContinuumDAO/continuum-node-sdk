import {z} from 'zod';

export const nodeSchema = z.object({
	baseUrl: z.url(),
	managementPort: z.number().int().min(1).max(65_535),
	/** When set, used as the management API origin (no `:managementPort` suffix). */
	managementBaseUrl: z.url().optional(),
	mpcConfigPath: z.string().min(1),
});

export const signerSchema = z.object({
	defaultKey: z.string().min(1),
	defaultKeyPath: z.string().nullable(),
});

export const nodeSdkConfigSchema = z.object({
	node: nodeSchema,
	signer: signerSchema,
});

export type NodeSdkConfig = z.infer<typeof nodeSdkConfigSchema> & {
	/** Optional fetch override (e.g. browser JWT on GET). */
	readonly customFetch?: (
		url: string,
		init?: RequestInit,
	) => Promise<Response>;
};

export function parseNodeSdkConfig(input: unknown): NodeSdkConfig {
	return nodeSdkConfigSchema.parse(input);
}
