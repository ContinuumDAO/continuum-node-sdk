import {z} from 'zod';
import {coerceAgentCronScheduleInput} from '../internal/agent-cron-schedule-input.js';
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

export const SelectedSigningKeySchema = z
	.object({
		id: z.string(),
		kind: z.literal('EdDSA'),
		value: z.string(),
		nonce: NonceSchema,
		label: z.string().optional(),
	})
	.strict();

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

export const KeyGenMessageReadReceiptSchema = z
	.object({
		nodeKey: z.string(),
		signature: z.string(),
		signedAt: z.string().optional(),
	})
	.strict();

export const KeyGenMessageSchema = z
	.object({
		id: z.string(),
		keyGenId: z.string(),
		senderNodeKey: z.string(),
		title: z.string().optional(),
		replyTo: z.string().optional(),
		body: z.string(),
		createdAt: z.string(),
		read: z.array(KeyGenMessageReadReceiptSchema).optional(),
	})
	.strict();

export type KeyGenMessageWithReplies = z.infer<typeof KeyGenMessageSchema> & {
	replies?: KeyGenMessageWithReplies[];
};

export const KeyGenMessageWithRepliesSchema: z.ZodType<KeyGenMessageWithReplies> = z.lazy(
	() =>
		KeyGenMessageSchema.extend({
			replies: z.array(KeyGenMessageWithRepliesSchema).optional(),
		}).strict(),
);

export const SendKeyGenMessageInputSchema = z
	.object({
		keyGenId: KeyGenIdSchema,
		body: z.string().min(1).max(65_536),
		title: z.string().min(1).max(512).optional(),
		replyTo: z.string().min(1).optional(),
	})
	.strict()
	.superRefine((value, ctx) => {
		const hasTitle = Boolean(value.title?.trim());
		const hasReplyTo = Boolean(value.replyTo?.trim());
		if (hasTitle && hasReplyTo) {
			ctx.addIssue({
				code: 'custom',
				message: 'Provide title for a top-level message or replyTo for a reply, not both.',
			});
			return;
		}
		if (!hasTitle && !hasReplyTo) {
			ctx.addIssue({
				code: 'custom',
				message: 'Top-level messages require title; replies require replyTo.',
			});
		}
	});

export const PostKeyGenChartAttachmentInputSchema = z
	.object({
		keyGenId: KeyGenIdSchema,
		bytes: z.string().min(1).max(2 * 1024 * 1024),
		messageId: z.string().min(1).optional(),
		kind: z.literal('continuum/chart/v1').optional(),
	})
	.strict();

export const PostKeyGenChartAttachmentOutputSchema = z
	.object({
		attachmentId: z.string().min(1),
		sha256: z.string().min(1),
		kind: z.string().min(1),
		keyGenId: KeyGenIdSchema,
		messageId: z.string().optional(),
	})
	.strict();

export const GetKeyGenMessageAttachmentQuerySchema = z
	.object({
		keyGenId: KeyGenIdSchema,
		attachmentId: z.string().min(1),
	})
	.strict();

export const GetKeyGenMessageAttachmentOutputSchema = z
	.object({
		attachmentId: z.string().min(1),
		keyGenId: KeyGenIdSchema,
		messageId: z.string().optional(),
		kind: z.string().min(1),
		sha256: z.string().min(1),
		bytes: z.string().min(1),
		createdAt: z.string().optional(),
	})
	.strict();

export const ListKeyGenMessagesQuerySchema = z
	.object({
		keyGenId: KeyGenIdSchema,
		unread: z.boolean().optional(),
		topLevel: z.boolean().optional(),
		fromTime: z.string().optional(),
		toTime: z.string().optional(),
		pagenum: z.number().int().min(1).optional(),
		pagesize: z.number().int().min(1).max(100).optional(),
	})
	.strict();

export const ListKeyGenMessagesDataSchema = z
	.object({
		list: z.array(KeyGenMessageSchema),
		total: z.number(),
	})
	.strict();

export const GetKeyGenMessageByIdQuerySchema = z
	.object({
		keyGenId: KeyGenIdSchema,
		messageId: z.string().min(1),
	})
	.strict();

export const GetKeyGenMessageThreadQuerySchema = z
	.object({
		keyGenId: KeyGenIdSchema,
		messageId: z.string().min(1),
	})
	.strict();

export const MarkKeyGenMessageReadInputSchema = z
	.object({
		keyGenId: KeyGenIdSchema,
		messageId: z.string().min(1),
		signature: z.string().min(1).optional(),
	})
	.strict();

export const MarkKeyGenMessageReadDataSchema = z
	.object({
		message: z.literal('ok'),
	})
	.strict();

export const MarkKeyGenMessageReadOutputSchema = MarkKeyGenMessageReadDataSchema.extend({
	selectedSigningKey: SelectedSigningKeySchema.optional(),
	signingMessage: z.string(),
}).strict();

export const MultiMarkKeyGenMessagesReadInputSchema = z
	.object({
		keyGenId: KeyGenIdSchema,
		messageIds: z.array(z.string().min(1)).min(1),
		signature: z.string().min(1).optional(),
	})
	.strict();

export const MultiMarkKeyGenMessagesReadDataSchema = z
	.object({
		marked: z.number(),
		notFound: z.array(z.string()),
	})
	.strict();

export const MultiMarkKeyGenMessagesReadOutputSchema =
	MultiMarkKeyGenMessagesReadDataSchema.extend({
		selectedSigningKey: SelectedSigningKeySchema.optional(),
		signingMessage: z.string(),
	}).strict();

export const DeleteKeyGenMessageInputSchema = z
	.object({
		keyGenId: KeyGenIdSchema,
		messageId: z.string().min(1),
	})
	.strict();

export const DeleteKeyGenMessageDataSchema = z
	.object({
		deleted: z.number(),
	})
	.strict();

export const DeleteKeyGenMessageOutputSchema = DeleteKeyGenMessageDataSchema.extend({
	selectedSigningKey: SelectedSigningKeySchema.optional(),
	signingMessage: z.string(),
}).strict();

export const MultiDeleteKeyGenMessagesInputSchema = z
	.object({
		keyGenId: KeyGenIdSchema,
		messageIds: z.array(z.string().min(1)).min(1),
	})
	.strict();

export const MultiDeleteKeyGenMessagesDataSchema = z
	.object({
		deleted: z.number(),
		notFound: z.array(z.string()),
		forbidden: z.array(z.string()),
	})
	.strict();

export const MultiDeleteKeyGenMessagesOutputSchema = MultiDeleteKeyGenMessagesDataSchema.extend({
	selectedSigningKey: SelectedSigningKeySchema.optional(),
	signingMessage: z.string(),
}).strict();

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
	symbol: z
		.string()
		.min(1)
		.optional()
		.describe(
			'Filter by token symbol (case-insensitive). Omits chain_id filter when set so tokens can be found across chains.',
		),
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
	chainName: z
		.string()
		.min(1)
		.optional()
		.describe(
			'Filter by chainName as stored in the chain registry (case-insensitive). Fetches all chains when set — resolve chainId from get_chain_registry instead of guessing.',
		),
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
	add: '/addEnvironmentVariable',
	remove: '/removeEnvironmentVariable',
} as const;

export const AgentEnvironmentVariableSchema = z.object({
	name: z.string(),
	value: z.string(),
	updatedAt: z.string().optional(),
	sensitive: z.boolean().optional(),
});

/** POST /addEnvironmentVariable response exposed to MCP — value is never returned. */
export const AgentEnvironmentVariableUpsertResultSchema = z
	.object({
		name: z.string(),
		updatedAt: z.string().optional(),
		sensitive: z.boolean().optional(),
	})
	.strict();

export const GetEnvironmentVariableQuerySchema = z
	.object({
		name: z.string().trim().min(1),
	})
	.strict();

export const ListEnvironmentVariablesDataSchema = z
	.object({
		variables: z.array(AgentEnvironmentVariableSchema),
	})
	.strict();

/** MCP list output — names and configured status only; never secret values. */
export const AgentEnvironmentVariableSummarySchema = z
	.object({
		name: z.string(),
		configured: z.boolean(),
		sensitive: z.boolean().optional(),
		updatedAt: z.string().optional(),
	})
	.strict();

export const ListEnvironmentVariablesMcpDataSchema = z
	.object({
		variables: z.array(AgentEnvironmentVariableSummarySchema),
	})
	.strict();

export const AddEnvironmentVariableInputSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(1)
			.max(128)
			.regex(
				/^[A-Za-z][A-Za-z0-9_]*$/,
				'name must start with A-Z and contain only A-Z, 0-9, and underscore',
			),
		value: z.string().max(8192),
	})
	.strict();

export type AddEnvironmentVariableInput = z.infer<
	typeof AddEnvironmentVariableInputSchema
>;

export const RemoveEnvironmentVariableInputSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(1)
			.max(128)
			.regex(
				/^[A-Za-z][A-Za-z0-9_]*$/,
				'name must start with A-Z and contain only A-Z, 0-9, and underscore',
			),
	})
	.strict();

export type RemoveEnvironmentVariableInput = z.infer<
	typeof RemoveEnvironmentVariableInputSchema
>;

export const ConfiguredNodeKeySchema = z
	.object({
		address: z.string(),
		available: z.boolean(),
		publicKey: z.string(),
	})
	.strict();

export const GetConfiguredNodeKeysDataSchema = z
	.object({
		nodes: z.array(ConfiguredNodeKeySchema),
		total: z.number().int().nonnegative().optional(),
		available: z.number().int().nonnegative().optional(),
		unavailable: z.number().int().nonnegative().optional(),
	})
	.strict();

export const AGENT_MCP_API_PATHS = {
	list: '/listMcpServers',
	get: '/getMcpServer',
	add: '/addMcpServer',
	addFromCatalog: '/addMcpServerFromCatalog',
	setFlags: '/setMcpServerFlags',
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

/** MCP server add/upsert. Secrets: use apiKeyEnvVar / envVars (Variables store) only — never inline apiKey; the agent must not receive Variable values. */
export const AddMcpServerInputSchema = z.discriminatedUnion('transport', [
	z
		.object({
			transport: z.literal('http'),
			id: z.string().trim().min(1),
			displayName: z.string().trim().min(1),
			url: z.string().trim().min(1),
			apiKeyEnvVar: z.string().trim().min(1).optional(),
			apiKeyHeader: z.string().trim().min(1).optional(),
			initialLoad: z.boolean().optional(),
			aiReady: z.boolean().optional(),
		})
		.strict(),
	z
		.object({
			transport: z.literal('stdio'),
			id: z.string().trim().min(1),
			displayName: z.string().trim().min(1),
			command: z.string().trim().min(1),
			args: z.array(z.string().trim().min(1)).optional(),
			apiKeyEnvVar: z.string().trim().min(1).optional(),
			envVars: z.array(z.string().trim().min(1)).optional(),
			useUserFolder: z.boolean().optional(),
			runtime: AgentMcpRuntimeSpecSchema.optional(),
			initialLoad: z.boolean().optional(),
			aiReady: z.boolean().optional(),
		})
		.strict(),
]);

export type AddMcpServerInput = z.infer<typeof AddMcpServerInputSchema>;

/** Activate one row from agent_llm_config.defaults/MCP_servers.json (management-signed). */
export const AddMcpServerFromCatalogInputSchema = z
	.object({
		id: z.string().trim().min(1),
		initialLoad: z.boolean().optional(),
		aiReady: z.boolean().optional(),
	})
	.strict();

export type AddMcpServerFromCatalogInput = z.infer<
	typeof AddMcpServerFromCatalogInputSchema
>;

export const SetMcpServerFlagsInputSchema = z
	.object({
		id: z.string().trim().min(1),
		initialLoad: z.boolean().optional(),
		aiReady: z.boolean().optional(),
	})
	.strict()
	.refine(
		v => v.initialLoad !== undefined || v.aiReady !== undefined,
		'At least one of initialLoad or aiReady is required.',
	);

export type SetMcpServerFlagsInput = z.infer<typeof SetMcpServerFlagsInputSchema>;

export const AgentMcpServerSourceSchema = z.enum(['default', 'user', 'catalog']);

export const AgentMcpServerRowSchema = z.object({
	id: z.string(),
	displayName: z.string(),
	transport: AgentMcpTransportSchema,
	url: z.string().optional(),
	command: z.string().optional(),
	args: z.array(z.string()).optional(),
	envVars: z.array(z.string()).optional(),
	useUserFolder: z.boolean().optional(),
	runtime: AgentMcpRuntimeSpecSchema.optional(),
	setupUrl: z.string().url().optional(),
	apiKeyEnvVar: z.string().optional(),
	apiKeyHeader: z.string().optional(),
	apiKeyPresent: z.boolean().optional(),
	apiKeyMasked: z.string().optional(),
	envConfigured: z.boolean().optional(),
	initialLoad: z.boolean(),
	aiReady: z.boolean().optional(),
	builtin: z.boolean().optional(),
	source: AgentMcpServerSourceSchema,
	removable: z.boolean(),
	updatedAt: z.string().optional(),
});

export const ListMcpServersDataSchema = z
	.object({
		activeServers: z.array(AgentMcpServerRowSchema).optional(),
		availableCatalog: z.array(AgentMcpServerRowSchema).optional(),
		defaultServers: z.array(AgentMcpServerRowSchema),
		userServers: z.array(AgentMcpServerRowSchema),
		servers: z.array(AgentMcpServerRowSchema),
		addableTemplates: z.array(AddMcpServerInputSchema),
	})
	.strict();

export const GetMcpServerQuerySchema = z
	.object({
		id: z.string().trim().min(1),
	})
	.strict();

export const RemoveMcpServerInputSchema = z
	.object({
		id: z.string().trim().min(1),
	})
	.strict();

export const AGENT_CRON_API_PATHS = {
	list: '/listCronJobs',
	get: '/getCronJob',
	listRuns: '/listCronJobRuns',
	add: '/addCronJob',
	update: '/updateCronJob',
	activate: '/activateCronJob',
	deactivate: '/deactivateCronJob',
	remove: '/removeCronJob',
	run: '/runCronJob',
} as const;

export const AgentCronScheduleSchema = z.discriminatedUnion('kind', [
	z
		.object({
			kind: z.literal('cron'),
			expr: z.string().trim().min(1),
			tz: z.string().trim().min(1).optional(),
		})
		.strict(),
	z
		.object({
			kind: z.literal('every'),
			everyMs: z.number().int().positive(),
		})
		.strict(),
	z
		.object({
			kind: z.literal('at'),
			at: z.string().trim().min(1),
		})
		.strict(),
]);

/** Accepts structured schedules plus common agent shorthands (cron expr string, "every 5 minutes", 300000). */
export const AgentCronScheduleInputSchema = z.preprocess(
	coerceAgentCronScheduleInput,
	AgentCronScheduleSchema,
);

export const AgentCronJobSummarySchema = z.object({
	id: z.string(),
	name: z.string(),
	enabled: z.boolean(),
	schedule: AgentCronScheduleSchema.nullable(),
	conversationId: z.string(),
	deleteAfterRun: z.boolean().optional(),
	createdAt: z.string().optional(),
	updatedAt: z.string().optional(),
	lastRunAt: z.string().optional(),
	nextRunAt: z.string().optional(),
	lastRunStatus: z.string().optional(),
});

export const AgentCronJobDetailSchema = AgentCronJobSummarySchema.extend({
	message: z.string(),
});

export const AgentCronRunSchema = z.object({
	runId: z.string(),
	startedAt: z.string(),
	finishedAt: z.string().optional(),
	status: z.string(),
	error: z.string().optional(),
	assistantPreview: z.string().optional(),
});

export const ListCronJobsDataSchema = z.object({
	jobs: z.array(AgentCronJobSummarySchema),
});

export const GetCronJobQuerySchema = z
	.object({
		id: z.string().trim().min(1).optional(),
		name: z.string().trim().min(1).optional(),
	})
	.strict()
	.refine(data => Boolean(data.id || data.name), {
		message: 'Job id or name is required.',
	});

export const ListCronJobRunsQuerySchema = z.object({
	jobId: z.string().trim().min(1),
	limit: z.number().int().positive().optional(),
});

export const ListCronJobRunsDataSchema = z.object({
	jobId: z.string(),
	runs: z.array(AgentCronRunSchema),
});

export const AddCronJobInputSchema = z
	.object({
		name: z.string().trim().min(1),
		message: z.string().min(1),
		schedule: AgentCronScheduleInputSchema,
		enabled: z.boolean().optional(),
		deleteAfterRun: z.boolean().optional(),
	})
	.strict();

export type AddCronJobInput = z.infer<typeof AddCronJobInputSchema>;

export const UpdateCronJobInputSchema = z
	.object({
		id: z.string().trim().min(1).optional(),
		name: z.string().trim().min(1).optional(),
		message: z.string().min(1).optional(),
		schedule: AgentCronScheduleInputSchema.optional(),
		deleteAfterRun: z.boolean().optional(),
	})
	.strict()
	.refine(data => Boolean(data.id || data.name), {
		message: 'Job id or name is required.',
	});

export const CronJobRefInputSchema = z
	.object({
		id: z.string().trim().min(1).optional(),
		name: z.string().trim().min(1).optional(),
	})
	.strict()
	.refine(data => Boolean(data.id || data.name), {
		message: 'Job id or name is required.',
	});

export const RemoveCronJobInputSchema = CronJobRefInputSchema.and(
	z
		.object({
			deleteConversation: z.boolean().optional(),
		})
		.strict(),
);

export const RunCronJobOutputSchema = z.object({
	jobId: z.string(),
	runId: z.string(),
	status: z.literal('enqueued'),
});

export const AGENT_WEBHOOK_API_PATHS = {
	list: '/listWebhooks',
	get: '/getWebhookById',
	add: '/addWebhook',
	addFromCatalog: '/addWebhookFromCatalog',
	update: '/updateWebhook',
	activate: '/activateWebhook',
	deactivate: '/deactivateWebhook',
	remove: '/removeWebhook',
	run: '/runWebhook',
} as const;

export const AgentWebhookTypeSchema = z.enum([
	'generic',
	'github',
	'gmail',
	'proton',
	'stripe',
	'slack',
	'telegram',
]);

const AGENT_WEBHOOK_NAME_RE = /^[a-z][a-z0-9_-]*$/;

export const AgentWebhookSummarySchema = z.object({
	id: z.string(),
	name: z.string(),
	enabled: z.boolean(),
	type: AgentWebhookTypeSchema,
	conversationId: z.string(),
	inboundUrl: z.string().optional(),
	secretEnvVar: z.string().optional(),
	secretConfigured: z.boolean().optional(),
	telegramBotTokenEnvVar: z.string().optional(),
	telegramBotTokenConfigured: z.boolean().optional(),
	catalog: z.boolean().optional(),
	createdAt: z.string().optional(),
	updatedAt: z.string().optional(),
	lastTriggeredAt: z.string().optional(),
});

export const AgentWebhookDetailSchema = AgentWebhookSummarySchema.extend({
	prompt: z.string(),
});

export const AgentWebhookCatalogItemSchema = z.object({
	name: z.string(),
	type: AgentWebhookTypeSchema,
	prompt: z.string().optional(),
	enabled: z.boolean(),
});

export const ListWebhooksDataSchema = z.object({
	activeWebhooks: z.array(AgentWebhookSummarySchema).optional(),
	availableCatalog: z.array(AgentWebhookCatalogItemSchema).optional(),
	webhooks: z.array(AgentWebhookSummarySchema),
});

export const GetWebhookQuerySchema = z
	.object({
		id: z.string().trim().min(1),
	})
	.strict();

export const AddWebhookInputSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(1)
			.max(64)
			.regex(
				AGENT_WEBHOOK_NAME_RE,
				'name must start with a-z and use only a-z, 0-9, hyphen, and underscore',
			),
		type: AgentWebhookTypeSchema,
		prompt: z.string().trim().min(1).max(32_000),
		enabled: z.boolean().optional(),
	})
	.strict();

export type AddWebhookInput = z.infer<typeof AddWebhookInputSchema>;

export const AddWebhookFromCatalogInputSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(1)
			.max(64)
			.regex(
				AGENT_WEBHOOK_NAME_RE,
				'name must start with a-z and use only a-z, 0-9, hyphen, and underscore',
			),
		enabled: z.boolean().optional(),
	})
	.strict();

export type AddWebhookFromCatalogInput = z.infer<
	typeof AddWebhookFromCatalogInputSchema
>;

export const UpdateWebhookInputSchema = z
	.object({
		id: z.string().trim().min(1),
		prompt: z.string().trim().min(1).max(32_000).optional(),
		type: AgentWebhookTypeSchema.optional(),
	})
	.strict();

export type UpdateWebhookInput = z.infer<typeof UpdateWebhookInputSchema>;

export const WebhookRefInputSchema = z
	.object({
		id: z.string().trim().min(1).optional(),
		name: z
			.string()
			.trim()
			.min(1)
			.max(64)
			.regex(AGENT_WEBHOOK_NAME_RE)
			.optional(),
	})
	.strict()
	.refine(data => Boolean(data.id || data.name), {
		message: 'Webhook id or name is required.',
	});

export const RemoveWebhookInputSchema = WebhookRefInputSchema;

export const RunWebhookOutputSchema = z
	.object({
		status: z.literal('started'),
	})
	.strict();

export const AGENT_SKILLS_API_PATHS = {
	list: '/listSkills',
	get: '/getSkill',
	add: '/addSkill',
	remove: '/removeSkill',
} as const;

export const AgentSkillFormatSchema = z.enum(['md', 'txt']);

export const AgentSkillDetailSchema = z.object({
	name: z.string(),
	content: z.string(),
	initialLoad: z.boolean(),
	format: AgentSkillFormatSchema,
	updatedAt: z.string().optional(),
});

export const ListSkillsDataSchema = z.object({
	names: z.array(z.string()),
});

export const GetSkillQuerySchema = z.object({
	name: z.string().trim().min(1),
});

export const AddSkillInputSchema = z
	.object({
		name: z.string().trim().min(1),
		content: z.string().min(1),
		format: AgentSkillFormatSchema.optional(),
		initialLoad: z.boolean(),
	})
	.strict();

export type AddSkillInput = z.infer<typeof AddSkillInputSchema>;

export const RemoveSkillInputSchema = z
	.object({
		name: z.string().trim().min(1),
	})
	.strict();

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
export type SendKeyGenMessageInput = z.infer<typeof SendKeyGenMessageInputSchema>;
export type ListKeyGenMessagesQuery = z.infer<typeof ListKeyGenMessagesQuerySchema>;
export type ListKeyGenMessagesData = z.infer<typeof ListKeyGenMessagesDataSchema>;
export type GetKeyGenMessageByIdQuery = z.infer<typeof GetKeyGenMessageByIdQuerySchema>;
export type GetKeyGenMessageThreadQuery = z.infer<typeof GetKeyGenMessageThreadQuerySchema>;
export type MarkKeyGenMessageReadInput = z.infer<typeof MarkKeyGenMessageReadInputSchema>;
export type MarkKeyGenMessageReadData = z.infer<typeof MarkKeyGenMessageReadDataSchema>;
export type MarkKeyGenMessageReadOutput = z.infer<typeof MarkKeyGenMessageReadOutputSchema>;
export type MultiMarkKeyGenMessagesReadInput = z.infer<
	typeof MultiMarkKeyGenMessagesReadInputSchema
>;
export type MultiMarkKeyGenMessagesReadData = z.infer<
	typeof MultiMarkKeyGenMessagesReadDataSchema
>;
export type MultiMarkKeyGenMessagesReadOutput = z.infer<
	typeof MultiMarkKeyGenMessagesReadOutputSchema
>;
export type DeleteKeyGenMessageInput = z.infer<typeof DeleteKeyGenMessageInputSchema>;
export type DeleteKeyGenMessageOutput = z.infer<typeof DeleteKeyGenMessageOutputSchema>;
export type DeleteKeyGenMessageData = z.infer<typeof DeleteKeyGenMessageDataSchema>;
export type MultiDeleteKeyGenMessagesInput = z.infer<
	typeof MultiDeleteKeyGenMessagesInputSchema
>;
export type MultiDeleteKeyGenMessagesData = z.infer<
	typeof MultiDeleteKeyGenMessagesDataSchema
>;
export type MultiDeleteKeyGenMessagesOutput = z.infer<
	typeof MultiDeleteKeyGenMessagesOutputSchema
>;
export type GetKnownAddressesQuery = z.infer<typeof GetKnownAddressesQuerySchema>;
export type GetKnownAddressesData = z.infer<typeof GetKnownAddressesDataSchema>;
export type GetTokenRegistryQuery = z.infer<typeof GetTokenRegistryQuerySchema>;
export type GetTokenRegistryData = z.infer<typeof GetTokenRegistryDataSchema>;
export type TokenContractInput = z.infer<typeof TokenContractInputSchema>;
export type AddToTokenRegistryInput = z.infer<typeof AddToTokenRegistryInputSchema>;
export type GetChainRegistryQuery = z.infer<typeof GetChainRegistryQuerySchema>;
export type GetChainRegistryData = z.infer<typeof GetChainRegistryDataSchema>;
export type AddChainRegistryInput = z.infer<typeof AddChainRegistryInputSchema>;
