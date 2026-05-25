import {z} from 'zod';

export const nodeSchema = z.object({
	baseUrl: z.url(),
	managementPort: z.number().int().min(1).max(65_535),
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

export type NodeSdkConfig = z.infer<typeof nodeSdkConfigSchema>;

export function parseNodeSdkConfig(input: unknown): NodeSdkConfig {
	return nodeSdkConfigSchema.parse(input);
}
