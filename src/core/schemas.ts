import {z} from 'zod';
import {
	ConfiguredNodeSchema,
	EdDSAPubKeySchema,
	GroupRequestSchema,
	GroupResultSchema,
	NonceSchema,
	NodeIdSchema,
} from './types.js';

export const VersionResponseSchema = z.object({
	version: z.string(),
	versionDate: z.string(),
	cggmp24UpstreamGitRev: z.string(),
});

export const ConfiguredNodesResponseSchema = z.object({
	nodes: z.array(ConfiguredNodeSchema),
});

export const AllowedKeyApiEntrySchema = z.object({
	publicKey: EdDSAPubKeySchema.optional(),
	label: z.string().optional(),
	deleted: z.boolean().optional(),
	removedPublicKey: z.string().optional(),
});

export const ManagementKeyEntrySchema = z.object({
	publicKey: z.string(),
	label: z.string(),
	isValid: z.boolean(),
});

export const ManagementKeysResponseSchema = z.object({
	managementKeys: z.array(ManagementKeyEntrySchema),
});

export const PreferredSignerResponseSchema = z.object({
	publicKeyHex: z.string().optional(),
});

export const NonceDataSchema = z.object({
	key: z.string(),
	nonce: NonceSchema,
});

export const KeyGenRecordSchema = z.object({
	requestid: z.string().optional(),
	pubkeyhex: z.string().optional(),
	keylist: z.array(z.string()).optional(),
	threshold: z.number().int().optional(),
	keytype: z.string().optional(),
	ethereumaddress: z.string().optional(),
});

export const GroupRecordSchema = z.object({
	groupId: z.string().optional(),
	keyGens: z.array(KeyGenRecordSchema).optional(),
});

export const AllGroupIdsResponseSchema = z.object({
	groups: z.array(GroupRecordSchema).optional(),
});

export const MpcKeyInfoSchema = z.object({
	pubKeyHex: z.string().min(1),
	keyType: z.string(),
	threshold: z.number().int(),
	members: z.number().int(),
	address: z.string(),
});

export const MpcKeysResponseSchema = z.object({
	keys: z.array(MpcKeyInfoSchema),
});

export const ManagementPostVariantSchema = z.enum([
	'sig',
	'setPreferredSigner',
	'agentLlmConfig',
	'agentLlmApiKey',
]);

export const PendingSignRequestSchema = z.object({
	path: z.string().min(1),
	requestFields: z.record(z.string(), z.unknown()),
	postVariant: ManagementPostVariantSchema,
	commandSlash: z.string(),
});

export const ExecuteSignResponseSchema = z.union([
	z.string(),
	z.record(z.string(), z.unknown()),
]);

export const GroupRequestsResponseSchema = z.object({
	groupRequests: z.array(GroupRequestSchema),
});

export const GroupResultsResponseSchema = z.object({
	groups: z.array(GroupResultSchema),
});

export const NodeIdResponseSchema = z.object({
	nodeId: NodeIdSchema,
});

export type VersionResponse = z.infer<typeof VersionResponseSchema>;
export type ManagementKeyEntry = z.infer<typeof ManagementKeyEntrySchema>;
export type MpcKeyInfo = z.infer<typeof MpcKeyInfoSchema>;
export type ManagementPostVariant = z.infer<typeof ManagementPostVariantSchema>;
export type PendingSignRequest = z.infer<typeof PendingSignRequestSchema>;
export type ExecuteSignResponse = z.infer<typeof ExecuteSignResponseSchema>;

export type PreparedSignRequest = PendingSignRequest & {
	readonly canonicalJson: string;
	readonly signerLabel: string;
};

export type ManagementKeyResult = {
	readonly publicKey: string;
	readonly nonce: number;
	readonly nodeKey: string;
};

export type SignedManagementBody = Record<string, unknown> & {
	readonly clientSig: string;
	readonly nonce: number;
	readonly nodeKey: string;
};
