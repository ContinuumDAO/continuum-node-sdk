import {z} from 'zod';
import {
	EdDSAPubKeySchema,
	FilterSchema,
	GroupIdSchema,
	NodeIdSchema,
	NonceSchema,
	StatusSchema,
} from '../detops/types.js';

export const HEX_128_REGEX = /^[a-fA-F0-9]{128}$/;
export const HEX_64_REGEX = /^[a-fA-F0-9]{64}$/;

export const keyTypes = ['ed25519', 'secp256k1'] as const;
export type Key = (typeof keyTypes)[number];
export const KeyTypeSchema = z.enum(keyTypes);

export const msgCheckTypes = ['multi-agree', 'tx-check'] as const;
export type MsgCheck = (typeof msgCheckTypes)[number];
export const MsgCheckSchema = z.enum(msgCheckTypes);

export {FilterSchema, StatusSchema, NodeIdSchema, GroupIdSchema, NonceSchema, EdDSAPubKeySchema};

export const ECDSAPubKeySchema = z
	.string()
	.regex(HEX_128_REGEX, 'ECDSA public key must be a 128-character hex string');
export const ECDSAAddressSchema = z
	.string()
	.regex(/^0x[a-fA-F0-9]{40}$/, 'EVM address must be 40-character hex string');
export const PubKeySchema = z.union([ECDSAPubKeySchema, EdDSAPubKeySchema]);
export const ManagementSigSchema = EdDSAPubKeySchema;

export const SelectedSigningKeySchema = z.object({
	id: z.string(),
	kind: z.literal('EdDSA'),
	value: z.string(),
	nonce: NonceSchema,
	label: z.string().optional(),
});

export const GroupRequestIdSchema = z
	.string()
	.regex(
		/^NewGroup[a-f0-9]{25}$/,
		'Group request ID must be in the form NewGroup202603271129339998910db0b',
	);
export const KeyGenIdSchema = z
	.string()
	.regex(
		/^KeyGen[a-f0-9]{25}$/,
		'KeyGen ID must be in the form KeyGen20260111003720999cf104d0f',
	);

export const LogsSchema = z.object({
	count: z.number(),
	cutoffTime: z.string(),
	hours: z.number(),
	logs: z.array(
		z.object({
			level: z.string(),
			msg: z.string(),
			time: z.string(),
		}),
	),
});

export const MachineInfoSchema = z.object({
	cpu: z.object({cores: z.number(), usagePercent: z.number()}),
	memory: z.object({
		totalGB: z.string(),
		usedGB: z.string(),
		availableGB: z.string(),
	}),
	disk: z.object({
		totalGB: z.string(),
		usedGB: z.string(),
		availableGB: z.string(),
	}),
	os: z.object({version: z.string()}),
	cpuInfo: z.object({
		version: z.string(),
		physicalCores: z.number(),
		logicalCores: z.number(),
	}),
	vps: z.object({isVPS: z.boolean(), provider: z.string()}),
	countryCode: z
		.string()
		.regex(/^([A-Za-z]{2})?$/, 'Country code must be empty or 2 letters'),
});

export const McpGroupRequestSchema = z.object({
	RequestId: GroupRequestIdSchema,
	NewGroupDataPb: z.object({
		GroupId: GroupIdSchema,
		KeyList: z.array(NodeIdSchema),
		Addresses: z.array(z.string()),
		SigList: z.record(NodeIdSchema, ManagementSigSchema),
		BrokerArray: z.array(z.string()),
	}),
	Timepoint: z.string(),
	status: StatusSchema,
	originator: NodeIdSchema,
});

export const McpGroupResultSchema = z.object({
	requestid: z.string().min(1),
	GroupId: GroupIdSchema,
	KeyList: z.array(NodeIdSchema),
	Addresses: z.array(z.string()),
	SigList: z.record(NodeIdSchema, ManagementSigSchema),
	BrokerArray: z.array(z.string()),
	timepoint: z.string(),
	originator: NodeIdSchema.optional(),
});

export const SubscriptionSchema = z.object({
	groupId: z.union([GroupIdSchema, z.string()]),
	brokers: z.array(z.string()),
	topics: z.array(z.string()),
	clientId: NodeIdSchema,
	isConnected: z.boolean(),
});

export const NodeConnectivityResultSchema = z.object({
	nodeKey: NodeIdSchema,
	responded: z.boolean(),
	latencyMs: z.number().optional(),
	speed: z.string().optional(),
	error: z.string().optional(),
});

export const SuccessRateSchema = z.object({
	keygen: z.object({
		total: z.number(),
		success: z.number(),
		failed: z.number(),
		successRate: z.number(),
	}),
	signing: z.object({
		total: z.number(),
		success: z.number(),
		failed: z.number(),
		successRate: z.number(),
	}),
});

export const HealthSchema = z.object({
	status: z.string(),
	timestamp: z.number(),
	mqtt: z.object({
		connected: z.boolean(),
		channels: z.number(),
		errors: z.array(z.string()),
		warnings: z.array(z.string()),
	}),
	mongodb: z.object({
		connected: z.boolean(),
		error: z.string(),
	}),
	subscriptions: z.array(SubscriptionSchema),
});

export const ConnectivityHealthGroupSchema = z.object({
	groupId: GroupIdSchema,
	nodeCount: z.number(),
	results: z.array(NodeConnectivityResultSchema),
	summary: z.object({
		very_good: z.number(),
		good: z.number(),
		medium: z.number(),
		slow: z.number(),
		very_slow: z.number(),
		no_response: z.number(),
	}),
});

export const KeyGenRequestSchema = z.object({
	requestid: KeyGenIdSchema,
	GroupId: GroupIdSchema,
	KeyType: KeyTypeSchema,
	MsgCheck: MsgCheckSchema,
	SigList: z.record(NodeIdSchema, z.string()),
	Gate: z.number().int().positive(),
	timepoint: z.string(),
	status: z.string().optional(),
	originator: NodeIdSchema.optional(),
});

export const KeyGenResultSchema = z.object({
	requestid: z.string(),
	pubkeyhex: PubKeySchema.optional(),
	ethereumaddress: ECDSAAddressSchema.optional(),
	solanaaddress: z.string().optional(),
	sorobanaddress: z.string().optional(),
	nearaddress: z.string().optional(),
	tonaddress: z.string().optional(),
	keylist: z.array(NodeIdSchema).optional(),
	groupid: GroupIdSchema.optional(),
	gate: z.number().int().positive().optional(),
	keytype: KeyTypeSchema.optional(),
	msgcheck: MsgCheckSchema.optional(),
	savedata: z.string().optional(),
	globalnonce: z.number().int().nonnegative().optional(),
	timepoint: z.string(),
	status: z.string().optional(),
});

export const ADDRESS_BOOK_REGISTRY_API_PATHS = {
	add: '/addKnownAddress',
	remove: '/removeKnownAddress',
	get: '/getKnownAddresses',
} as const;

export const GetKnownAddressesQuerySchema = z.object({
	chain_type: z.string().min(1).optional(),
	chain_id: z.string().min(1).optional(),
	is_contract: z.enum(['0', '1']).optional(),
});

export const KnownAddressEntrySchema = z.object({
	address: z.string(),
	name: z.string().optional(),
	chainIds: z.array(z.string()),
	isContract: z.boolean(),
	updatedAt: z.string(),
});

export const GetKnownAddressesDataSchema = z
	.object({})
	.catchall(z.array(KnownAddressEntrySchema));

export const tokenTypeValues = ['ERC20', 'ERC721', 'CTMERC20', 'CTMRWA1'] as const;
export type TokenType = (typeof tokenTypeValues)[number];
export const TokenTypeSchema = z.enum(tokenTypeValues);

export const TOKEN_REGISTRY_API_PATHS = {
	add: '/addToken',
	remove: '/removeToken',
	get: '/getTokens',
} as const;

export const GetTokenRegistryQuerySchema = z.object({
	chainType: z.string().min(1).optional(),
	chain_id: z.string().min(1).optional(),
});

export const TokenContractInputSchema = z
	.object({
		contractAddress: z.string().min(1),
		name: z.string().optional(),
		symbol: z.string().optional(),
		symbolURL: z.string().optional(),
		decimals: z.number().int().nonnegative().optional(),
		tokenURI: z.string().optional(),
		tokenId: z.string().optional(),
	})
	.passthrough();

export const GetTokenRegistryDataSchema = z
	.object({})
	.catchall(z.array(z.record(z.string(), z.unknown())));

export const defaultGetSigFeeSpeedValues = ['slow', 'normal', 'fast'] as const;
export const DefaultGetSigFeeSpeedSchema = z.enum(defaultGetSigFeeSpeedValues);

export const CHAIN_REGISTRY_API_PATHS = {
	add: '/postChainDetails',
	remove: '/removeChainDetails',
	get: '/getChainDetails',
} as const;

export const GetChainRegistryQuerySchema = z.object({
	chain_id: z.string().min(1).optional(),
});

export const ChainRegistryEntrySchema = z.object({
	chainId: z.string(),
	chainName: z.string(),
	rpcGateway: z.string(),
	explorer: z.string().optional(),
	legacy: z.boolean(),
	testnet: z.boolean(),
	gasName: z.string().optional(),
	gasLimit: z.number().optional(),
	baseFee: z.number().nullable().optional(),
	priorityFee: z.number().nullable().optional(),
	baseFeeMultiplier: z.number().optional(),
	gasMultiplier: z.number().optional(),
	gasPrice: z.number().optional(),
	defaultGetSigFeeSpeed: DefaultGetSigFeeSpeedSchema.optional(),
	updatedAt: z.string().optional(),
});

export const GetChainRegistryDataSchema = z.object({
	chains: z.array(ChainRegistryEntrySchema),
});

export const AddChainRegistryInputSchema = z.object({
	chainName: z.string().min(1),
	chainId: z.union([z.string().min(1), z.number().int().nonnegative()]),
	rpcGateway: z.string().min(1),
	explorer: z.string().optional(),
	legacy: z.boolean().optional(),
	testnet: z.boolean().optional(),
	gasName: z.string().optional(),
	gasLimit: z.number().nonnegative().optional(),
	baseFee: z.number().nullable().optional(),
	priorityFee: z.number().nullable().optional(),
	baseFeeMultiplier: z.number().min(100).optional(),
	gasMultiplier: z.number().optional(),
	gasPrice: z.number().optional(),
	defaultGetSigFeeSpeed: DefaultGetSigFeeSpeedSchema.optional(),
});

export type ManagementKeyOption = {
	id: string;
	kind: 'EdDSA';
	value: string;
	nonce: number;
	label?: string;
};

export type McpGroupRequest = z.infer<typeof McpGroupRequestSchema>;
export type McpGroupResult = z.infer<typeof McpGroupResultSchema>;
export type SelectedSigningKey = z.infer<typeof SelectedSigningKeySchema>;
export type Filter = z.infer<typeof FilterSchema>;
export type GroupId = z.infer<typeof GroupIdSchema>;
export type NodeId = z.infer<typeof NodeIdSchema>;
export type KeyGenId = z.infer<typeof KeyGenIdSchema>;
export type GetKnownAddressesQuery = z.infer<typeof GetKnownAddressesQuerySchema>;
export type GetKnownAddressesData = z.infer<typeof GetKnownAddressesDataSchema>;
export type GetTokenRegistryQuery = z.infer<typeof GetTokenRegistryQuerySchema>;
export type GetTokenRegistryData = z.infer<typeof GetTokenRegistryDataSchema>;
export type TokenContractInput = z.infer<typeof TokenContractInputSchema>;
export type GetChainRegistryQuery = z.infer<typeof GetChainRegistryQuerySchema>;
export type GetChainRegistryData = z.infer<typeof GetChainRegistryDataSchema>;
export type AddChainRegistryInput = z.infer<typeof AddChainRegistryInputSchema>;
