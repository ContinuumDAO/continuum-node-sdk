import {z} from 'zod';
import {
	EdDSAPubKeySchema,
	FilterSchema,
	GroupIdSchema,
	NodeIdSchema,
	NonceSchema,
	StatusSchema,
} from '../core/types.js';

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

export {
	GroupRequestIdOptionalSchema,
	GroupRequestIdSchema,
	normalizeGroupRequestId,
} from '../core/group-request-id.js';
import {GroupRequestIdSchema} from '../core/group-request-id.js';
export {
	KeyGenIdOptionalSchema,
	KeyGenIdSchema,
	normalizeKeyGenRequestId,
} from '../core/keygen-id.js';
import {KeyGenIdSchema} from '../core/keygen-id.js';

export const PreferredKeyGenStatusSchema = z
	.object({
		keyGenId: z.string(),
		pubKey: z.string(),
		keyType: z.string(),
	})
	.strict();

export const PostPreferredKeyGenInputSchema = z
	.object({
		keyGenId: KeyGenIdSchema,
	})
	.strict();

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
		contractAddress: z
			.string({error: 'contract.contractAddress is required for /addToken.'})
			.trim()
			.min(1, 'contract.contractAddress is required for /addToken.'),
		name: z
			.string({error: 'contract.name is required for /addToken.'})
			.trim()
			.min(1, 'contract.name is required for /addToken.'),
		symbol: z
			.string({error: 'contract.symbol is required for /addToken.'})
			.trim()
			.min(1, 'contract.symbol is required for /addToken.'),
		symbolURL: z
			.string({error: 'contract.symbolURL is required for /addToken.'})
			.trim()
			.min(1, 'contract.symbolURL is required for /addToken.'),
		decimals: z
			.number({error: 'contract.decimals is required for /addToken.'})
			.int()
			.nonnegative('contract.decimals must be a non-negative integer.'),
		tokenURI: z.string().optional(),
		tokenId: z.string().optional(),
	})
	.passthrough();

export const ADD_TOKEN_REGISTRY_REQUIRED_FIELDS_MESSAGE =
	'/addToken requires chainType, chainId, tokenType, and contract with contractAddress, name, symbol, symbolURL, and decimals.';

export const AddToTokenRegistryInputSchema = z.object({
	chainType: z
		.string({error: 'chainType is required for /addToken.'})
		.trim()
		.min(1, 'chainType is required for /addToken.'),
	chainId: z.union([z.string().min(1), z.number().int().nonnegative()]),
	tokenType: TokenTypeSchema,
	contract: TokenContractInputSchema,
	transferSig: z.string().optional(),
	transferNames: z.array(z.string()).optional(),
});

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

export const AGENT_ENVIRONMENT_API_PATHS = {
	list: '/listEnvironmentVariables',
	get: '/getEnvironmentVariable',
} as const;

export const AgentEnvironmentVariableSchema = z.object({
	name: z.string(),
	value: z.string(),
	updatedAt: z.string().optional(),
});

export const GetEnvironmentVariableQuerySchema = z.object({
	name: z.string().trim().min(1),
});

export const ListEnvironmentVariablesDataSchema = z.object({
	variables: z.array(AgentEnvironmentVariableSchema),
});

export const AGENT_MCP_API_PATHS = {
	list: '/listMcpServers',
	get: '/getMcpServer',
	add: '/addMcpServer',
	remove: '/removeMcpServer',
} as const;

export const AgentMcpTransportSchema = z.enum(['http', 'stdio']);

export const AgentMcpRuntimeSpecSchema = z
	.object({
		uvToolPackage: z.string().min(1).optional(),
		uvPython: z.string().min(1).optional(),
		requireCommands: z.array(z.string().min(1)).optional(),
	})
	.strict();

export const AddMcpServerInputSchema = z
	.object({
		id: z.string().trim().min(1),
		displayName: z.string().trim().min(1),
		transport: AgentMcpTransportSchema.optional(),
		url: z.string().optional(),
		command: z.string().optional(),
		args: z.array(z.string()).optional(),
		apiKey: z.string().optional(),
		apiKeyEnvVar: z.string().optional(),
		apiKeyHeader: z.string().optional(),
		envVars: z.array(z.string()).optional(),
		useUserFolder: z.boolean().optional(),
		runtime: AgentMcpRuntimeSpecSchema.optional(),
		initialLoad: z.boolean().optional(),
	})
	.strict();

export type AddMcpServerInput = z.infer<typeof AddMcpServerInputSchema>;

export const AgentMcpServerRowSchema = z.object({
	id: z.string(),
	displayName: z.string(),
	transport: AgentMcpTransportSchema,
	url: z.string().optional(),
	command: z.string().optional(),
	args: z.array(z.string()).optional(),
	envVars: z.array(z.string()).optional(),
	useUserFolder: z.boolean().optional(),
	apiKeyEnvVar: z.string().optional(),
	apiKeyHeader: z.string().optional(),
	apiKeyPresent: z.boolean().optional(),
	apiKeyMasked: z.string().optional(),
	envConfigured: z.boolean().optional(),
	initialLoad: z.boolean(),
	source: z.enum(['default', 'user']),
	removable: z.boolean(),
	updatedAt: z.string().optional(),
});

export const ListMcpServersDataSchema = z.object({
	defaultServers: z.array(AgentMcpServerRowSchema),
	userServers: z.array(AgentMcpServerRowSchema),
	servers: z.array(AgentMcpServerRowSchema),
	addableTemplates: z.array(AddMcpServerInputSchema),
});

export const GetMcpServerQuerySchema = z.object({
	id: z.string().trim().min(1),
});

export const RemoveMcpServerInputSchema = z
	.object({
		id: z.string().trim().min(1),
	})
	.strict();

export const ListBundledMcpServerTemplatesDataSchema = z.object({
	templates: z.array(AddMcpServerInputSchema),
});

export const RPC_GATEWAY_REQUIRED_MESSAGE =
	'rpcGateway (RPC URL) is required for /postChainDetails. You must supply an RPC URL for this chain; an AI assistant must not guess or infer one.';

export const AddChainRegistryInputSchema = z.object({
	chainName: z.string().min(1),
	chainId: z.union([z.string().min(1), z.number().int().nonnegative()]),
	rpcGateway: z.string().trim().min(1, RPC_GATEWAY_REQUIRED_MESSAGE),
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

export type Ed25519ManagementSigning = {kind: 'ed25519'};

export type EIP191ManagementSigning = {
	kind: 'eip191';
	signMessage: (message: string) => Promise<string>;
};

export type ManagementSigningMethod =
	| Ed25519ManagementSigning
	| EIP191ManagementSigning;

export const Ed25519ManagementSigningSchema = z.object({
	kind: z.literal('ed25519'),
});

export const ManagementSigningMethodSchema = z.discriminatedUnion('kind', [
	Ed25519ManagementSigningSchema,
	z.object({kind: z.literal('eip191')}),
]);

export const DEFAULT_MANAGEMENT_SIGNING: Ed25519ManagementSigning = {
	kind: 'ed25519',
};

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
export type PreferredKeyGenStatus = z.infer<typeof PreferredKeyGenStatusSchema>;
export type GetKnownAddressesQuery = z.infer<typeof GetKnownAddressesQuerySchema>;
export type GetKnownAddressesData = z.infer<typeof GetKnownAddressesDataSchema>;
export type GetTokenRegistryQuery = z.infer<typeof GetTokenRegistryQuerySchema>;
export type GetTokenRegistryData = z.infer<typeof GetTokenRegistryDataSchema>;
export type TokenContractInput = z.infer<typeof TokenContractInputSchema>;
export type AddToTokenRegistryInput = z.infer<typeof AddToTokenRegistryInputSchema>;
export type GetChainRegistryQuery = z.infer<typeof GetChainRegistryQuerySchema>;
export type GetChainRegistryData = z.infer<typeof GetChainRegistryDataSchema>;
export type AddChainRegistryInput = z.infer<typeof AddChainRegistryInputSchema>;
