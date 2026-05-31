import {z} from 'zod';

export const HEX_128_REGEX = /^[a-fA-F\d]{128}$/;
export const HEX_64_REGEX = /^[a-fA-F\d]{64}$/;

export const filterTypes = ['all', 'pending', 'success', 'failed'] as const;
export type Filter = (typeof filterTypes)[number];
export const FilterSchema = z.enum(filterTypes);

export const statusTypes = ['pending', 'agree', 'failed'] as const;
export type Status = (typeof statusTypes)[number];
export const StatusSchema = z.enum(statusTypes);

export const EdDSAPubKeySchema = z
	.string()
	.regex(HEX_64_REGEX, 'Ed25519 public key must be a 64-character hex string');
export const EdDSASigSchema = z
	.string()
	.regex(
		/^(?:0x)?[a-fA-F\d]{128}$/,
		'Ed25519 signature must be a 128-character hex string',
	);

export const NodeIdSchema = z
	.string()
	.regex(HEX_128_REGEX, 'Node ID must be a 128-character hex string');
export const GroupIdSchema = z
	.string()
	.regex(HEX_64_REGEX, 'Group ID must be a 64-character hex string');

export const NonceSchema = z.number().int().nonnegative();

export {
	GroupRequestIdOptionalSchema,
	GroupRequestIdSchema,
	normalizeGroupRequestId,
} from './group-request-id.js';
import {GroupRequestIdSchema} from './group-request-id.js';

export const GroupRequestSchema = z.object({
	RequestId: GroupRequestIdSchema,
	NewGroupDataPb: z.object({
		GroupId: GroupIdSchema,
		KeyList: z.array(NodeIdSchema),
		Addresses: z.array(z.string()),
		SigList: z.record(NodeIdSchema, EdDSASigSchema),
		BrokerArray: z.array(z.string()),
	}),
	Timepoint: z.string(),
	status: StatusSchema,
	originator: NodeIdSchema,
});

export const GroupResultSchema = z.object({
	groupId: GroupIdSchema,
	nodeKeys: z.array(NodeIdSchema),
});

export const ConfiguredNodeSchema = z.object({
	address: z.string(),
	available: z.boolean(),
	publicKey: NodeIdSchema,
});

export type EdDSAPubKey = z.infer<typeof EdDSAPubKeySchema>;
export type EdDSASig = z.infer<typeof EdDSASigSchema>;
export type NodeId = z.infer<typeof NodeIdSchema>;
export type Nonce = z.infer<typeof NonceSchema>;
export type GroupRequest = z.infer<typeof GroupRequestSchema>;
export type GroupResult = z.infer<typeof GroupResultSchema>;
export type FilterType = Filter;
