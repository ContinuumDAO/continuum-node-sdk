import {z} from 'zod';
import {SignRequestIdOptionalSchema, SignRequestIdSchema} from './sign-request-id.js';
import {KeyGenIdSchema} from '../keygen-id.js';
import {
	preprocessCreateComposeInput,
	preprocessCreateForgeInput,
	preprocessJoinMultiSignRequestsInput,
	preprocessMpcCommonCreateInput,
	preprocessOptionalEvmChainId,
	preprocessTransferC3Input,
	preprocessTransferChainInput,
} from './mpc-input-coerce.js';

export {SignRequestIdOptionalSchema, SignRequestIdSchema} from './sign-request-id.js';
export {KeyGenIdOptionalSchema, KeyGenIdSchema} from '../keygen-id.js';

export const signRequestListFilterSchema = z.enum([
	'all',
	'live',
	'pending',
	'success',
	'blocked',
	'shelved',
]);
export type SignRequestListFilter = z.infer<typeof signRequestListFilterSchema>;

export const GetSigFeeSpeedTierSchema = z.enum([
	'slow',
	'normal',
	'fast',
	'advanced',
]);

export const DefaultGetSigFeeSpeedTierSchema = z.enum(['slow', 'normal', 'fast']);

export const CustomGasConfigSnapshotSchema = z
	.object({
		legacy: z.boolean(),
		gasName: z.string().optional(),
		gasLimit: z.number().optional(),
		gasMultiplier: z.number().optional(),
		gasPrice: z.number().optional(),
		baseFee: z.number().optional(),
		priorityFee: z.number().optional(),
		baseFeeMultiplier: z.number().optional(),
	})
	.strict();

export const GetMultiSignGasOptionsInputSchema = z
	.preprocess(
		raw => {
			const o =
				raw && typeof raw === 'object' && !Array.isArray(raw)
					? {...(raw as Record<string, unknown>)}
					: raw;
			if (o && typeof o === 'object' && !Array.isArray(o)) {
				const rec = o as Record<string, unknown>;
				if (rec.chainId !== undefined) {
					rec.chainId = preprocessOptionalEvmChainId(rec.chainId);
				}
			}
			return o;
		},
		z
			.object({
				chainId: z
					.number()
					.int()
					.positive()
					.optional()
					.describe(
						'Destination chain id. Required when requestId is omitted; when both are set they must match.',
					),
		chainName: z
			.string()
			.min(1)
			.optional()
			.describe(
				'Destination chainName as stored in get_chain_registry (case-insensitive). Prefer over chainId.',
			),
				requestId: SignRequestIdOptionalSchema.describe(
					'Sign request id for Get Sig planning; destination chain id is read from the request when chainId is omitted.',
				),
			})
			.strict(),
	)
	.superRefine((data, ctx) => {
		if (data.chainId != null && data.chainName?.trim()) {
			ctx.addIssue({
				code: 'custom',
				message: 'Provide only one of chainId or chainName.',
			});
		}
		if (data.chainId == null && !data.chainName?.trim() && !data.requestId) {
			ctx.addIssue({
				code: 'custom',
				message: 'Provide chainId, chainName, and/or requestId.',
			});
		}
	});

export const GetMultiSignGasOptionsOutputSchema = z
	.object({
		chainId: z.number().int().positive(),
		chainName: z.string().optional(),
		requestId: z.string().optional(),
		proposalUsedCustomGas: z.boolean(),
		chainRegistryCustomGas: CustomGasConfigSnapshotSchema,
		proposalCustomGas: CustomGasConfigSnapshotSchema.optional(),
		defaultGetSigFeeSpeed: DefaultGetSigFeeSpeedTierSchema,
		feeSpeedTierChoices: z.array(GetSigFeeSpeedTierSchema),
		createMultiSignRequest: z
			.object({
				useCustomGasDefault: z.literal(false),
				useCustomGasWhenTrue: z.string(),
				useCustomGasWhenFalse: z.string(),
				proposalTxParams: z.string().optional(),
				getSigFees: z.string().optional(),
			})
			.strict(),
		triggerSignResult: z
			.object({
				defaultFeeSpeedTier: DefaultGetSigFeeSpeedTierSchema,
				feeSpeedTierField: z.string(),
				advancedFields: z.string(),
			})
			.strict(),
	})
	.strict();

export const ComposeActionArgSchema = z
	.object({
		name: z.string(),
		type: z.string(),
		value: z.string(),
	})
	.strict();

export const ComposeActionSchema = z
	.object({
		signature: z.string().min(1),
		contractAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
		args: z.array(ComposeActionArgSchema),
		valueWei: z.string().optional(),
	})
	.strict();

const MpcCommonCreateInputInner = z
	.object({
		keyGenId: KeyGenIdSchema,
		purpose: z
			.string()
			.max(256)
			.optional()
			.describe('Human-readable purpose (alias: purposeText from DeFi build tools).'),
		useCustomGas: z
			.boolean()
			.optional()
			.describe(
				'Proposal gas mode (default false). false = live RPC estimates at create time. true = apply Custom Gas Config from get_chain_registry / get_multi_sign_gas_options (gasLimit, fee floors, multipliers). Ask the user before creating.',
			),
		startingNonce: z
			.number()
			.int()
			.nonnegative()
			.optional()
			.describe('Optional executor tx nonce override for the proposal.'),
	})
	.strict();

export const MpcCommonCreateInputSchema = z.preprocess(
	preprocessMpcCommonCreateInput,
	MpcCommonCreateInputInner,
);

export const CreateComposeInputSchema = z.preprocess(
	preprocessCreateComposeInput,
	MpcCommonCreateInputInner.extend({
		chainId: z
			.number()
			.int()
			.positive()
			.describe('Decimal EVM chain id (8453 for Base — not 0x8453).'),
		actions: z
			.array(ComposeActionSchema)
			.min(1)
			.describe(
				'Batch of contract calls. For ERC-20 deposits include approve(spender,amount) before deposit/supply on the token contract.',
			),
	}).strict(),
);

const EvmAddressSchema = z
	.string()
	.regex(/^0x[a-fA-F0-9]{40}$/)
	.describe('Recipient EVM address (0x + 40 hex chars). Omit when toContactName is set.');

const ToContactNameSchema = z
	.string()
	.min(1)
	.describe(
		'Address book contact name (case-insensitive). Prefer over toAddress to avoid transcription errors.',
	);

function withTransferRecipient<T extends z.ZodRawShape>(base: z.ZodObject<T>) {
	return base
		.extend({
			toAddress: EvmAddressSchema.optional(),
			toContactName: ToContactNameSchema.optional(),
		})
		.strict()
		.superRefine((data, ctx) => {
			const recipient = data as {toAddress?: string; toContactName?: string};
			if (!recipient.toAddress && !recipient.toContactName) {
				ctx.addIssue({
					code: 'custom',
					message: 'Provide toAddress or toContactName.',
				});
			}
			if (recipient.toAddress && recipient.toContactName) {
				ctx.addIssue({
					code: 'custom',
					message: 'Provide only one of toAddress or toContactName, not both.',
				});
			}
		});
}

const ChainIdSchema = z.preprocess(
	preprocessOptionalEvmChainId,
	z
		.number()
		.int()
		.positive()
		.optional()
		.describe('Destination chain id. Omit when chainName is set.'),
);

const ChainNameSchema = z
	.string()
	.min(1)
	.optional()
	.describe(
		'Destination chainName as stored in get_chain_registry (case-insensitive). Prefer over chainId — resolve from the registry instead of guessing IDs.',
	);

function withTransferChain<T extends z.ZodRawShape>(base: z.ZodObject<T>) {
	return base
		.extend({
			chainId: ChainIdSchema,
			chainName: ChainNameSchema,
		})
		.strict()
		.superRefine((data, ctx) => {
			const chain = data as {chainId?: number; chainName?: string};
			if (chain.chainId == null && !chain.chainName?.trim()) {
				ctx.addIssue({
					code: 'custom',
					message: 'Provide chainId or chainName.',
				});
			}
			if (chain.chainId != null && chain.chainName?.trim()) {
				ctx.addIssue({
					code: 'custom',
					message: 'Provide only one of chainId or chainName, not both.',
				});
			}
		});
}

function withErc20TokenAndAmount<T extends z.ZodRawShape>(base: z.ZodObject<T>) {
	return base
		.extend({
			tokenAddress: z
				.string()
				.regex(/^0x[a-fA-F0-9]{40}$/)
				.optional()
				.describe('ERC-20 contract address. Omit when tokenSymbol is set.'),
			tokenSymbol: z
				.string()
				.min(1)
				.optional()
				.describe(
					'Token symbol from registry (e.g. TUSD). Prefer over tokenAddress.',
				),
			amountWei: z
				.string()
				.min(1)
				.optional()
				.describe('Amount in smallest token units as a decimal string.'),
			amount: z
				.string()
				.min(1)
				.optional()
				.describe(
					'Human-readable token amount (e.g. "5" for 5 TUSD). Uses registry decimals; omit when amountWei is set.',
				),
			transferSig: z.string().optional(),
		})
		.strict()
		.superRefine((data, ctx) => {
			const token = data as {tokenAddress?: string; tokenSymbol?: string};
			if (!token.tokenAddress && !token.tokenSymbol?.trim()) {
				ctx.addIssue({
					code: 'custom',
					message: 'Provide tokenAddress or tokenSymbol.',
				});
			}
			if (token.tokenAddress && token.tokenSymbol?.trim()) {
				ctx.addIssue({
					code: 'custom',
					message: 'Provide only one of tokenAddress or tokenSymbol, not both.',
				});
			}
			const amounts = data as {amountWei?: string; amount?: string};
			if (!amounts.amountWei && !amounts.amount?.trim()) {
				ctx.addIssue({
					code: 'custom',
					message: 'Provide amountWei or amount.',
				});
			}
			if (amounts.amountWei && amounts.amount?.trim()) {
				ctx.addIssue({
					code: 'custom',
					message: 'Provide only one of amountWei or amount, not both.',
				});
			}
		});
}

export const TransferNativeInputSchema = z.preprocess(
	preprocessTransferChainInput,
	withTransferRecipient(
		withTransferChain(
			MpcCommonCreateInputInner.extend({
				amountWei: z.string().min(1),
			}),
		),
	),
);

export const TransferErc20InputSchema = z.preprocess(
	preprocessTransferChainInput,
	withTransferRecipient(
		withTransferChain(withErc20TokenAndAmount(MpcCommonCreateInputInner)),
	),
);

export const TransferErc721InputSchema = z.preprocess(
	preprocessTransferChainInput,
	withTransferRecipient(
		withTransferChain(
			MpcCommonCreateInputInner.extend({
				tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
				tokenId: z.string().min(1),
				fromAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
				transferSig: z.string().optional(),
			}),
		),
	),
);

export const TransferCtmErc20InputSchema = TransferErc20InputSchema;

export const TransferC3InputSchema = z.preprocess(
	preprocessTransferC3Input,
	MpcCommonCreateInputInner.extend({
		chainId: z.number().int().positive(),
		tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
		toStr: z.string().min(1),
		amountWei: z.string().min(1),
		toChainIdStr: z.string().min(1),
		transferSig: z.string().optional(),
	}).strict(),
);

export const RegisterKeyGenInputSchema = MpcCommonCreateInputSchema;

export const MpaTopUpInputSchema = z.preprocess(
	preprocessMpcCommonCreateInput,
	MpcCommonCreateInputInner.extend({
		amountWei: z.string().min(1),
	}).strict(),
);

export const ForgeBroadcastTxSchema = z
	.object({
		from: z.string().optional(),
		to: z.string().nullable().optional(),
		gas: z.string().optional(),
		value: z.string().optional(),
		input: z.string().optional(),
		data: z.string().optional(),
		nonce: z.string().optional(),
		chainId: z.string().optional(),
		type: z.string().optional(),
		maxFeePerGas: z.string().optional(),
		maxPriorityFeePerGas: z.string().optional(),
		gasPrice: z.string().optional(),
	})
	.strict();

export const ForgeBroadcastJsonSchema = z
	.object({
		transactions: z.array(
			z
				.object({
					transaction: ForgeBroadcastTxSchema.optional(),
					tx: ForgeBroadcastTxSchema.optional(),
				})
				.strict(),
		),
		chain: z.number().optional(),
	})
	.strict();

export const JoinMultiSignRequestsInputSchema = z.preprocess(
	preprocessJoinMultiSignRequestsInput,
	z
		.object({
			payloadA: z
				.record(z.string(), z.unknown())
				.describe(
					'First multiSignRequest helper JSON or bodyForSign (compose, Foundry, or prior join output). May be a JSON string.',
				),
			payloadB: z
				.record(z.string(), z.unknown())
				.describe(
					'Second multiSignRequest helper JSON or bodyForSign. May be a JSON string.',
				),
			firstNonce: z
				.number()
				.int()
				.nonnegative()
				.describe(
					'EVM account nonce for the first merged transaction (alias: startingNonce). Following txs use firstNonce+1, +2, …',
				),
			purpose: z
				.string()
				.max(256)
				.optional()
				.describe(
					'Override combined purpose (≤256 chars; alias: purposeText). Default: merge both payloads’ purpose with " | ".',
				),
		})
		.strict(),
);

export const CreateForgeInputSchema = z.preprocess(
	preprocessCreateForgeInput,
	MpcCommonCreateInputInner.extend({
		broadcast: ForgeBroadcastJsonSchema,
		destinationChainID: z
			.string()
			.optional()
			.describe('Decimal chain id string (8453 for Base). Alias: chainId.'),
		overrideSender: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
		startingNonce: z.number().int().nonnegative().optional(),
	}).strict(),
);

export const ListReadyInputSchema = z
	.object({
		pagenum: z.number().int().nonnegative().optional(),
		pagesize: z.number().int().positive().optional(),
	})
	.strict();


export const ListSignRequestsInputSchema = z
	.object({
		filter: signRequestListFilterSchema
			.optional()
			.describe(
				'Filter sign requests. Allowed: all, live, pending, success, blocked, shelved. For Join-tab requests awaiting Accept/Reject, prefer list_sign_requests_awaiting_join (merges live + pending). Do not use pending alone — new requests are usually status live.',
			),
		pagenum: z
			.number()
			.int()
			.nonnegative()
			.optional()
			.describe('Zero-based page index (first page is 0, not 1).'),
		pagesize: z
			.number()
			.int()
			.positive()
			.max(50)
			.optional()
			.describe('Page size (default 20, max 50). Avoid unpaginated full lists.'),
		fromTime: z.number().int().optional(),
		toTime: z.number().int().optional(),
	})
	.strict();

export const GetSignRequestByIdInputSchema = z
	.object({
		requestId: SignRequestIdSchema,
		txParams: z
			.boolean()
			.optional()
			.describe('When true, response is tx params only (not a full sign request).'),
		compact: z
			.boolean()
			.optional()
			.describe(
				'When true (default), return a compact summary without messageRaw / signature payloads. Set false for the full API record.',
			),
	})
	.strict();

export const GetSignResultSummaryInputSchema = z
	.object({
		requestId: SignRequestIdSchema,
	})
	.strict();

export const SignResultSummarySchema = z
	.object({
		signResultStatus: z.string().optional(),
		executedOnChain: z.boolean(),
		readyToBroadcast: z.boolean(),
		readyToExecute: z.boolean(),
		hasSignature: z.boolean(),
		transactionHashes: z.array(z.string()).optional(),
		batchSignResult: z.boolean().optional(),
		batchSize: z.number().optional(),
		completedBatchLegs: z.number().optional(),
		chainId: z.union([z.string(), z.number()]).optional(),
	})
	.strict();

export const SignRequestSummarySchema = z
	.object({
		requestId: z.string(),
		status: z.string().optional(),
		lifecycleStatus: z.string().optional(),
		getSigTriggered: z.boolean().optional(),
		destinationChainId: z.string().optional(),
		originatorNodeKey: z.string().optional(),
		keyGenId: z.string().optional(),
		proposalUsedCustomGas: z.boolean(),
		isBatch: z.boolean(),
		batchLength: z.number(),
		joinAgreedCount: z.number().optional(),
		joinKeyCount: z.number().optional(),
		localJoinAgreed: z.boolean().optional(),
		isOriginatorLocal: z.boolean().optional(),
		localAgreementPending: z.boolean().optional(),
	})
	.strict();

export const SignRequestJoinAgreementCheckSchema = z
	.object({
		requestId: z.string(),
		localJoinAgreed: z.boolean(),
		isOriginatorLocal: z.boolean(),
		localAgreementPending: z.boolean(),
		joinAgreedCount: z.number(),
		joinKeyCount: z.number(),
		note: z.string(),
	})
	.strict();

export const SignRequestAgreeInputSchema = z
	.object({
		requestId: SignRequestIdSchema,
		accept: z
			.boolean()
			.optional()
			.describe('true = Accept, false = Reject. Default true.'),
		thoughts: z
			.string()
			.max(256)
			.optional()
			.describe(
				'Optional Join comment (max 256 chars). Always ask the user "Any thoughts to attach?" before calling; include their reply here or omit if none.',
			),
	})
	.strict();

export const ShelveSignRequestInputSchema = z
	.object({
		requestId: SignRequestIdSchema,
	})
	.strict();

export const ProposalTxParamsSchema = z
	.object({
		nonce: z.number().int().nonnegative(),
		gasLimit: z.string(),
		txType: z.enum(['eip1559', 'legacy']),
		maxFeePerGas: z.string().optional(),
		maxPriorityFeePerGas: z.string().optional(),
		gasPrice: z.string().optional(),
	})
	.strict();

export const SignRequestExecuteStatusSchema = z
	.object({
		requestId: z.string(),
		lifecycleStatus: z.string(),
		getSigTriggered: z.boolean(),
		signResultAvailable: z.boolean(),
		hasSignature: z.boolean(),
		executedOnChain: z.boolean(),
		readyToBroadcast: z.boolean(),
		readyToExecute: z.boolean(),
		signResultStatus: z.string().optional(),
		transactionHashes: z.array(z.string()).optional(),
		destinationChainId: z.string().optional(),
	})
	.strict();

export const GetSignRequestStatusInputSchema = z
	.object({
		requestId: SignRequestIdSchema,
	})
	.strict();

export const TxParamsFromGetSignRequestIdDataInputSchema = z
	.object({
		requestId: SignRequestIdSchema,
		txParams: z.boolean().optional(),
	})
	.strict();

export const WaitReadyInputSchema = z
	.object({
		requestId: SignRequestIdSchema,
		pollMs: z.number().int().positive().optional(),
		timeoutMs: z.number().int().positive().optional(),
	})
	.strict();

export const TriggerSignResultInputSchema = z
	.object({
		requestId: SignRequestIdSchema,
		feeSpeedTier: GetSigFeeSpeedTierSchema.optional().describe(
			'Get Sig fee tier (default: chain defaultGetSigFeeSpeed from get_multi_sign_gas_options, or proposal custom-gas default). slow | normal | fast use RPC fee history; advanced requires advanced* gwei fields.',
		),
		advancedMaxFeeGwei: z
			.string()
			.optional()
			.describe('EIP-1559 max fee (gwei) when feeSpeedTier is advanced.'),
		advancedPriorityFeeGwei: z
			.string()
			.optional()
			.describe('EIP-1559 priority fee (gwei) when feeSpeedTier is advanced.'),
		advancedGasPriceGwei: z
			.string()
			.optional()
			.describe('Legacy gas price (gwei) when feeSpeedTier is advanced on a legacy chain.'),
	})
	.strict();

export const BroadcastSignResultInputSchema = z
	.object({
		requestId: SignRequestIdSchema,
		signResultId: SignRequestIdSchema.optional(),
		slowBatch: z.boolean().optional(),
	})
	.strict();

export const BumpSignResultInputSchema = z
	.object({
		sourceRequestId: SignRequestIdSchema,
		keyGenId: KeyGenIdSchema,
		purposeNote: z.string().max(256).optional(),
		cancelPendingTx: z.boolean().optional(),
	})
	.strict();

export const CreateMultiSignRequestResultSchema = z
	.object({
		requestId: z.string(),
	})
	.strict();

export const TriggerSignResultOutputSchema = z
	.object({
		requestId: z.string(),
		signResultSummary: SignResultSummarySchema,
	})
	.strict();

export const BroadcastSignResultOutputSchema = z
	.object({
		requestId: z.string(),
		txHashes: z.array(z.string()),
		status: z.literal('executed'),
	})
	.strict();

export const MpaWalletStatusInputSchema = z
	.object({
		keyGenId: KeyGenIdSchema,
	})
	.strict();

export const MpaWalletStatusSchema = z
	.object({
		registered: z.boolean(),
		freeTransactionsLeft: z.number().optional(),
		hasEverDeposited: z.boolean().optional(),
		remainingDeposit: z.string().optional(),
		feeTokenSymbol: z.string().optional(),
		remainingNonces: z.number().optional(),
		globalNonce: z.number().optional(),
		error: z.string().optional(),
	})
	.strict();
