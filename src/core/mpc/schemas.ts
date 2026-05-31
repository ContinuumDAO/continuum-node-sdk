import {z} from 'zod';
import {signRequestListFilterSchema} from './sign-request-lifecycle.js';

export const KeyGenIdSchema = z.string().min(1);

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
	.object({
		chainId: z
			.number()
			.int()
			.positive()
			.optional()
			.describe(
				'Destination chain id. Required when requestId is omitted; when both are set they must match.',
			),
		requestId: z
			.string()
			.min(1)
			.optional()
			.describe(
				'Sign request id for Get Sig planning; destination chain id is read from the request when chainId is omitted.',
			),
	})
	.strict()
	.refine(v => v.chainId != null || v.requestId != null, {
		message: 'Provide chainId and/or requestId.',
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

export const MpcCommonCreateInputSchema = z
	.object({
		keyGenId: KeyGenIdSchema,
		purpose: z.string().max(256).optional(),
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

export const CreateComposeInputSchema = MpcCommonCreateInputSchema.extend({
	chainId: z.number().int().positive(),
	actions: z.array(ComposeActionSchema).min(1),
}).strict();

export const TransferNativeInputSchema = MpcCommonCreateInputSchema.extend({
	chainId: z.number().int().positive(),
	toAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
	amountWei: z.string().min(1),
}).strict();

export const TransferErc20InputSchema = MpcCommonCreateInputSchema.extend({
	chainId: z.number().int().positive(),
	tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
	toAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
	amountWei: z.string().min(1),
	transferSig: z.string().optional(),
}).strict();

export const TransferErc721InputSchema = MpcCommonCreateInputSchema.extend({
	chainId: z.number().int().positive(),
	tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
	toAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
	tokenId: z.string().min(1),
	fromAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
	transferSig: z.string().optional(),
}).strict();

export const TransferCtmErc20InputSchema = TransferErc20InputSchema;

export const TransferC3InputSchema = MpcCommonCreateInputSchema.extend({
	chainId: z.number().int().positive(),
	tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
	toStr: z.string().min(1),
	amountWei: z.string().min(1),
	toChainIdStr: z.string().min(1),
	transferSig: z.string().optional(),
}).strict();

export const RegisterKeyGenInputSchema = MpcCommonCreateInputSchema.strict();

export const MpaTopUpInputSchema = MpcCommonCreateInputSchema.extend({
	amountWei: z.string().min(1),
}).strict();

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

export const CreateForgeInputSchema = MpcCommonCreateInputSchema.extend({
	broadcast: ForgeBroadcastJsonSchema,
	destinationChainID: z.string().optional(),
	overrideSender: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
	startingNonce: z.number().int().nonnegative().optional(),
}).strict();

export const ListReadyInputSchema = z
	.object({
		pagenum: z.number().int().nonnegative().optional(),
		pagesize: z.number().int().positive().optional(),
	})
	.strict();

export const ListSignRequestsInputSchema = z
	.object({
		filter: signRequestListFilterSchema.optional(),
		pagenum: z.number().int().nonnegative().optional(),
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
		requestId: z.string().min(1),
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
		requestId: z.string().min(1),
	})
	.strict();

export const SignResultSummarySchema = z
	.object({
		status: z.string().optional(),
		readyToExecute: z.boolean(),
		hasSignature: z.boolean(),
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
		agreeingCount: z.number().optional(),
	})
	.strict();

export const SignRequestAgreeInputSchema = z
	.object({
		requestId: z.string().min(1),
		accept: z.boolean().optional(),
		thoughts: z.string().max(256).optional(),
	})
	.strict();

export const ShelveSignRequestInputSchema = z
	.object({
		requestId: z.string().min(1),
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
		readyToExecute: z.boolean(),
		destinationChainId: z.string().optional(),
	})
	.strict();

export const GetSignRequestStatusInputSchema = z
	.object({
		requestId: z.string().min(1),
	})
	.strict();

export const TxParamsFromGetSignRequestIdDataInputSchema = z
	.object({
		requestId: z.string().min(1),
		txParams: z.boolean().optional(),
	})
	.strict();

export const WaitReadyInputSchema = z
	.object({
		requestId: z.string().min(1),
		pollMs: z.number().int().positive().optional(),
		timeoutMs: z.number().int().positive().optional(),
	})
	.strict();

export const TriggerSignResultInputSchema = z
	.object({
		requestId: z.string().min(1),
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
		requestId: z.string().min(1),
		signResultId: z.string().optional(),
		slowBatch: z.boolean().optional(),
	})
	.strict();

export const BumpSignResultInputSchema = z
	.object({
		sourceRequestId: z.string().min(1),
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
