import {z} from 'zod';

export const KeyGenIdSchema = z.string().min(1);

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
		useCustomGas: z.boolean().optional(),
		startingNonce: z.number().int().nonnegative().optional(),
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
		feeSpeedTier: z.enum(['slow', 'normal', 'fast', 'advanced']).optional(),
		advancedMaxFeeGwei: z.string().optional(),
		advancedPriorityFeeGwei: z.string().optional(),
		advancedGasPriceGwei: z.string().optional(),
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
		signResult: z.record(z.string(), z.unknown()),
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
