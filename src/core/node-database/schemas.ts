import {z} from 'zod';

export const NODE_DATABASE_API_PATHS = {
	listDatabaseBackups: '/listDatabaseBackups',
	checkDatabase: '/checkDatabase',
	fixDatabase: '/fixDatabase',
	backupDatabase: '/backupDatabase',
	restoreDatabase: '/restoreDatabase',
	fetchDatabaseBackup: '/fetchDatabaseBackup',
	postDatabaseBackup: '/postDatabaseBackup',
	fetchBootstrapKey: '/fetchBootstrapKey',
	postBootstrapKey: '/postBootstrapKey',
	removeBootstrapKey: '/removeBootstrapKey',
	fetchAddedManagementKey: '/fetchAddedManagementKey',
	postAddedManagementKey: '/postAddedManagementKey',
	removeAddedManagementKey: '/removeAddedManagementKey',
	requestRestartPrep: '/maintenance/requestRestartPrep',
	restartGate: '/maintenance/restartGate',
} as const;

export const DATABASE_BACKUP_BASE64_MAX_BYTES = 4 * 1024 * 1024;

export const FixDatabaseInstructionSchema = z.enum([
	'all',
	'error_and_warning',
	'error',
]);

export const DatabaseBackupRowSchema = z
	.object({
		backupId: z.string(),
		backupUtc: z.string(),
		notes: z.string(),
	})
	.strict();

export const ListDatabaseBackupsOutputSchema = z
	.object({
		backups: z.array(DatabaseBackupRowSchema),
	})
	.strict();

export const QuiescenceOptionsSchema = z
	.object({
		skipQuiescence: z.boolean().optional(),
		requestRestartPrep: z.boolean().optional(),
	})
	.strict();

export const BackupDatabaseInputSchema = QuiescenceOptionsSchema.extend({
	includeGroupIds: z.array(z.string().trim().min(1)).optional(),
	excludeGroupIds: z.array(z.string().trim().min(1)).optional(),
	mongoRootUsername: z.string().trim().min(1).optional(),
	mongoRootPassword: z.string().optional(),
	notes: z.string().max(256).optional(),
}).strict();

export const BackupDatabaseOutputSchema = z
	.object({
		backupId: z.string(),
		path: z.string(),
		backupUtc: z.string().optional(),
		ciphertextSha256: z.string().optional(),
		ciphertextByteLength: z.number().int().nonnegative().optional(),
		backupFileSizeBytes: z.number().int().nonnegative().optional(),
		notes: z.string().optional(),
	})
	.strict();

export const RestoreDatabaseInputSchema = QuiescenceOptionsSchema.extend({
	backupId: z.string().trim().min(1).optional(),
	backupPath: z.string().trim().min(1).optional(),
	confirmRestore: z.literal(true),
	mongoRootUsername: z.string().trim().min(1).optional(),
	mongoRootPassword: z.string().optional(),
})
	.strict()
	.refine(data => Boolean(data.backupId || data.backupPath), {
		message: 'backupId or backupPath is required.',
	});

export const RestoreDatabaseOutputSchema = z
	.object({
		restoredFrom: z.string(),
		backupId: z.string(),
		hint: z.string().optional(),
		unconfirmedGlobalNonceKeyGens: z.string().optional(),
		syncedGlobalNonceKeyGens: z.string().optional(),
		exhaustedGlobalNonceKeyGens: z.string().optional(),
	})
	.strict();

export const FetchDatabaseBackupInputSchema = QuiescenceOptionsSchema.extend({
	backupId: z.string().trim().min(1),
	userFolderPath: z.string().trim().min(1).optional(),
	returnBase64: z.boolean().optional(),
}).strict();

export const FetchDatabaseBackupOutputSchema = z
	.object({
		backupId: z.string(),
		sizeBytes: z.number().int().nonnegative(),
		sha256: z.string(),
		savedPath: z.string().optional(),
		contentBase64: z.string().optional(),
	})
	.strict();

export const PostDatabaseBackupInputSchema = QuiescenceOptionsSchema.extend({
	userFolderPath: z.string().trim().min(1).optional(),
	contentBase64: z.string().optional(),
})
	.strict()
	.refine(data => Boolean(data.userFolderPath || data.contentBase64), {
		message: 'userFolderPath or contentBase64 is required.',
	});

export const PostDatabaseBackupOutputSchema = z
	.object({
		backupId: z.string(),
		path: z.string(),
		backupFileSizeBytes: z.number().int().nonnegative(),
		contentSha256: z.string(),
		alreadyPresent: z.boolean().optional(),
		message: z.string().optional(),
	})
	.strict();

export const FetchBootstrapKeyInputSchema = QuiescenceOptionsSchema.strict();

export const FetchBootstrapKeyOutputSchema = z
	.object({
		publicMgtKey: z.string(),
		ed25519PrivateSeedHex: z.string(),
		format: z.string().optional(),
	})
	.strict();

export const PostBootstrapKeyInputSchema = z
	.object({
		ed25519PrivateSeedHex: z
			.string()
			.trim()
			.regex(/^[0-9a-fA-F]{64}$/),
	})
	.strict();

export const PostBootstrapKeyOutputSchema = z
	.object({
		path: z.string(),
		wrote: z.boolean(),
		alreadyPresent: z.boolean(),
		message: z.string().optional(),
		restartRequiredForMpc: z.boolean().optional(),
	})
	.strict();

export const RemoveBootstrapKeyOutputSchema = z
	.object({
		path: z.string(),
		removed: z.boolean(),
		message: z.string().optional(),
	})
	.strict();

export const PublicKeyHexSchema = z
	.string()
	.trim()
	.regex(/^[0-9a-fA-F]{64}$/, 'publicKeyHex must be 64 hex characters');

export const FetchAddedManagementKeyInputSchema = QuiescenceOptionsSchema.extend({
	publicKeyHex: PublicKeyHexSchema,
}).strict();

export const FetchAddedManagementKeyOutputSchema = z
	.object({
		publicKeyHex: z.string(),
		slotN: z.number().int().positive(),
		privateKeyPem: z.string(),
		ed25519PrivateSeedHex: z.string(),
		format: z.string().optional(),
		path: z.string().optional(),
	})
	.strict();

export const PostAddedManagementKeyInputSchema = z
	.object({
		publicKeyHex: PublicKeyHexSchema,
		privateKeyPem: z.string().trim().min(1).optional(),
		ed25519PrivateSeedHex: z
			.string()
			.trim()
			.regex(/^[0-9a-fA-F]{64}$/)
			.optional(),
	})
	.strict()
	.refine(data => Boolean(data.privateKeyPem || data.ed25519PrivateSeedHex), {
		message: 'privateKeyPem or ed25519PrivateSeedHex is required.',
	})
	.refine(data => !(data.privateKeyPem && data.ed25519PrivateSeedHex), {
		message: 'Provide exactly one of privateKeyPem or ed25519PrivateSeedHex.',
	});

export const PostAddedManagementKeyOutputSchema = z
	.object({
		path: z.string(),
		wrote: z.boolean(),
		alreadyPresent: z.boolean(),
		message: z.string().optional(),
		publicKeyHex: z.string().optional(),
		slotN: z.number().int().positive().optional(),
	})
	.strict();

export const RemoveAddedManagementKeyInputSchema = z
	.object({
		publicKeyHex: PublicKeyHexSchema,
	})
	.strict();

export const RemoveAddedManagementKeyOutputSchema = z
	.object({
		path: z.string(),
		removed: z.boolean(),
		message: z.string().optional(),
		publicKeyHex: z.string().optional(),
		slotN: z.number().int().positive().optional(),
	})
	.strict();

export const RequestMaintenanceRestartPrepOutputSchema = z
	.object({
		ok: z.literal(true),
	})
	.strict();

export const FixDatabaseInputSchema = QuiescenceOptionsSchema.extend({
	instruction: FixDatabaseInstructionSchema,
	report: z.record(z.string(), z.unknown()),
	mongoRootUsername: z.string().trim().min(1).optional(),
	mongoRootPassword: z.string().optional(),
}).strict();

export type BackupDatabaseInput = z.infer<typeof BackupDatabaseInputSchema>;
export type RestoreDatabaseInput = z.infer<typeof RestoreDatabaseInputSchema>;
export type FetchDatabaseBackupInput = z.infer<typeof FetchDatabaseBackupInputSchema>;
export type PostDatabaseBackupInput = z.infer<typeof PostDatabaseBackupInputSchema>;
export type FixDatabaseInput = z.infer<typeof FixDatabaseInputSchema>;
export type FetchBootstrapKeyInput = z.infer<typeof FetchBootstrapKeyInputSchema>;
export type PostBootstrapKeyInput = z.infer<typeof PostBootstrapKeyInputSchema>;
export type FetchAddedManagementKeyInput = z.infer<typeof FetchAddedManagementKeyInputSchema>;
export type PostAddedManagementKeyInput = z.infer<typeof PostAddedManagementKeyInputSchema>;
export type RemoveAddedManagementKeyInput = z.infer<typeof RemoveAddedManagementKeyInputSchema>;
