import {z} from 'zod';

export const EvmAddressSchema = z
	.string()
	.regex(/^0x[a-fA-F0-9]{40}$/, 'Must be a 20-byte 0x-prefixed address.');

export const GetCtmMetricsInputSchema = z.object({}).strict();

export const CtmMetricsRawSchema = z
	.object({
		escrowed: z.string(),
		totalSupply: z.string(),
		circulatingSupply: z.string(),
		totalPower: z.string(),
		holders: z.string(),
		avgLockDuration: z.string(),
	})
	.strict();

export const CtmMetricsDecodedSchema = z
	.object({
		escrowedCtm: z.string(),
		totalSupplyCtm: z.string(),
		circulatingSupplyCtm: z.string(),
		totalPower: z.string(),
		holders: z.number().int().nonnegative(),
		avgLockDurationSeconds: z.string(),
		avgLockDurationDays: z.string(),
	})
	.strict();

export const CtmAddressSourceSchema = z.enum([
	'app-api',
	'votingEscrow',
	'nodeProperties',
]);

export const CtmExplorerLinkSchema = z
	.object({
		chainId: z.number().int().positive(),
		explorerUrl: z.string(),
		tokenExplorerUrl: z.string().optional(),
	})
	.strict();

export const CtmAddressRowSchema = z
	.object({
		id: z.string(),
		address: z.string(),
		chainId: z.number().int().positive(),
		role: z.string(),
		source: CtmAddressSourceSchema,
		explorerUrl: z.string().optional(),
		tokenExplorerUrl: z.string().optional(),
		explorers: z.array(CtmExplorerLinkSchema).optional(),
	})
	.strict();

export const GetCtmProtocolAddressesInputSchema = z.object({}).strict();

export const GetCtmProtocolAddressesOutputSchema = z
	.object({
		addresses: z.array(CtmAddressRowSchema),
		networks: z.array(
			z
				.object({
					name: z.string(),
					label: z.string(),
					chainId: z.string(),
					c3governor: z.string(),
					explorerUrl: z.string().optional(),
				})
				.strict(),
		),
		warnings: z.array(z.string()),
	})
	.strict();

export const GetVeCtmPositionInputSchema = z
	.object({
		address: EvmAddressSchema,
	})
	.strict();

export const VeCtmLastVotedSchema = z
	.object({
		at: z.number().int().nonnegative().nullable(),
		atIso: z.string().nullable(),
		proposalId: z.string().nullable(),
		note: z.string().optional(),
	})
	.strict();

export const VeCtmAccountVotingSchema = z
	.object({
		address: z.string(),
		explorerUrl: z.string(),
		votingPower: z.string(),
		votingPowerCtm: z.string(),
		delegates: z.string(),
		lastVoted: VeCtmLastVotedSchema,
	})
	.strict();

export const VeCtmTokenRowSchema = z
	.object({
		id: z.string(),
		locked: z.string(),
		lockedCtm: z.string(),
		end: z.number().int(),
		unlocksAt: z.string(),
		unlocked: z.boolean(),
		votes: z.string(),
		votesPower: z.string(),
		explorerUrl: z.string(),
		owner: VeCtmAccountVotingSchema.optional(),
	})
	.strict();

export const GetVeCtmPositionOutputSchema = z
	.object({
		address: z.string(),
		explorerUrl: z.string(),
		votingPower: z.string(),
		votingPowerCtm: z.string(),
		delegates: z.string(),
		lastVoted: VeCtmLastVotedSchema,
		lockedTotal: z.string(),
		lockedTotalCtm: z.string(),
		tokens: z.array(VeCtmTokenRowSchema),
	})
	.strict();

export const GetVeCtmTokensInputSchema = z
	.object({
		page: z.number().int().nonnegative().optional(),
		ids: z.array(z.string().regex(/^[1-9][0-9]*$/)).max(50).optional(),
	})
	.strict();

export const GetVeCtmTokensOutputSchema = z
	.object({
		total: z.number().int().nonnegative().optional(),
		tokens: z.array(VeCtmTokenRowSchema),
	})
	.strict();

export const GetVeCtmLockedForAddressesInputSchema = z
	.object({
		addresses: z.array(EvmAddressSchema).min(1).max(25),
	})
	.strict();

export const VeCtmAddressLockedRowSchema = z
	.object({
		address: z.string(),
		explorerUrl: z.string(),
		lockedTotal: z.string(),
		lockedTotalCtm: z.string(),
		tokenCount: z.number().int().nonnegative(),
		tokens: z.array(
			z
				.object({
					id: z.string(),
					locked: z.string(),
					lockedCtm: z.string(),
					end: z.number().int(),
					unlocksAt: z.string(),
					unlocked: z.boolean(),
				})
				.strict(),
		),
		note: z.string().optional(),
	})
	.strict();

export const GetVeCtmLockedForAddressesOutputSchema = z
	.object({
		addresses: z.array(VeCtmAddressLockedRowSchema),
	})
	.strict();

export const GetCtmTokenomicsSnapshotInputSchema = z.object({}).strict();

export const CtmEtherscanSuggestedCallSchema = z
	.object({
		serverId: z.string(),
		tool: z.string(),
		args: z.record(z.string(), z.unknown()),
	})
	.strict();

export const CtmEtherscanPlaybookSchema = z
	.object({
		id: z.string(),
		title: z.string(),
		unlocked: z.boolean(),
		calls: z.array(CtmEtherscanSuggestedCallSchema),
		then: z
			.object({
				tool: z.string(),
				note: z.string(),
			})
			.strict()
			.optional(),
	})
	.strict();

export const CtmOnChainFollowUpSchema = z
	.object({
		etherscan: z
			.object({
				available: z.boolean(),
				serverId: z.string().nullable(),
				officialPreferred: z.boolean(),
				note: z.string(),
				enable: z
					.object({
						addFromCatalog: z.object({id: z.string()}).strict().optional(),
						addEnvironmentVariable: z.object({name: z.string()}).strict().optional(),
						agentLoadMcpServer: z.object({serverId: z.string()}).strict().optional(),
					})
					.strict()
					.optional(),
				playbooks: z.array(CtmEtherscanPlaybookSchema),
			})
			.strict(),
	})
	.strict();

export const GetCtmOnChainFollowupsInputSchema = z.object({}).strict();

export const GetCtmOnChainFollowupsOutputSchema = CtmOnChainFollowUpSchema;

export const GetCtmMetricsOutputSchema = z
	.object({
		raw: CtmMetricsRawSchema,
		decoded: CtmMetricsDecodedSchema,
		circulatingSupplyFormula: z.string(),
		circulatingSupplyNote: z.string(),
		maxSupplyCtm: z.string(),
		maxSupplyNote: z.string(),
		onChainFollowUp: CtmOnChainFollowUpSchema,
	})
	.strict();

export const GetCtmProtocolAddressesToolOutputSchema = GetCtmProtocolAddressesOutputSchema.extend({
	onChainFollowUp: CtmOnChainFollowUpSchema,
});

export const GetVeCtmPositionToolOutputSchema = GetVeCtmPositionOutputSchema.extend({
	onChainFollowUp: CtmOnChainFollowUpSchema,
});

export const GetVeCtmTokensToolOutputSchema = GetVeCtmTokensOutputSchema.extend({
	onChainFollowUp: CtmOnChainFollowUpSchema,
});

export const GetVeCtmLockedForAddressesToolOutputSchema =
	GetVeCtmLockedForAddressesOutputSchema.extend({
		onChainFollowUp: CtmOnChainFollowUpSchema,
	});

export const GetCtmTokenomicsSnapshotOutputSchema = z
	.object({
		metrics: z
			.object({
				raw: CtmMetricsRawSchema,
				decoded: CtmMetricsDecodedSchema,
				circulatingSupplyFormula: z.string(),
				circulatingSupplyNote: z.string(),
				maxSupplyCtm: z.string(),
				maxSupplyNote: z.string(),
			})
			.strict(),
		addresses: z.array(CtmAddressRowSchema),
		networks: GetCtmProtocolAddressesOutputSchema.shape.networks,
		warnings: z.array(z.string()),
		allocationNote: z.string(),
		onChainFollowUp: CtmOnChainFollowUpSchema,
	})
	.strict();

export type CtmMetricsRaw = z.infer<typeof CtmMetricsRawSchema>;
export type CtmMetricsDecoded = z.infer<typeof CtmMetricsDecodedSchema>;
export type CtmAddressRow = z.infer<typeof CtmAddressRowSchema>;
export type VeCtmLastVoted = z.infer<typeof VeCtmLastVotedSchema>;
export type VeCtmAccountVoting = z.infer<typeof VeCtmAccountVotingSchema>;
export type GetCtmProtocolAddressesOutput = z.infer<typeof GetCtmProtocolAddressesOutputSchema>;
export type GetVeCtmPositionInput = z.infer<typeof GetVeCtmPositionInputSchema>;
export type GetVeCtmPositionOutput = z.infer<typeof GetVeCtmPositionOutputSchema>;
export type GetVeCtmTokensInput = z.infer<typeof GetVeCtmTokensInputSchema>;
export type GetVeCtmTokensOutput = z.infer<typeof GetVeCtmTokensOutputSchema>;
export type GetVeCtmLockedForAddressesInput = z.infer<
	typeof GetVeCtmLockedForAddressesInputSchema
>;
export type GetVeCtmLockedForAddressesOutput = z.infer<
	typeof GetVeCtmLockedForAddressesOutputSchema
>;
export type VeCtmAddressLockedRow = z.infer<typeof VeCtmAddressLockedRowSchema>;
export type GetVeCtmLockedForAddressesToolOutput = z.infer<
	typeof GetVeCtmLockedForAddressesToolOutputSchema
>;
export type VeCtmTokenRow = z.infer<typeof VeCtmTokenRowSchema>;
export type CtmOnChainFollowUp = z.infer<typeof CtmOnChainFollowUpSchema>;
export type CtmEtherscanPlaybook = z.infer<typeof CtmEtherscanPlaybookSchema>;
export type GetCtmMetricsOutput = z.infer<typeof GetCtmMetricsOutputSchema>;
export type GetCtmProtocolAddressesToolOutput = z.infer<
	typeof GetCtmProtocolAddressesToolOutputSchema
>;
export type GetVeCtmPositionToolOutput = z.infer<typeof GetVeCtmPositionToolOutputSchema>;
export type GetVeCtmTokensToolOutput = z.infer<typeof GetVeCtmTokensToolOutputSchema>;
export type GetCtmTokenomicsSnapshotOutput = z.infer<typeof GetCtmTokenomicsSnapshotOutputSchema>;
