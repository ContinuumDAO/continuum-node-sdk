import type { McpServer } from "@modelcontextprotocol/server";
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	backupDatabase,
	checkDatabase,
	fetchDatabaseBackup,
	listDatabaseBackups,
	postDatabaseBackup,
	requestMaintenanceRestartPrep,
	restoreDatabase,
} from '../core/node-database/database-backup.js';
import {
	fetchAddedManagementKey,
	fetchBootstrapKey,
	postAddedManagementKey,
	postBootstrapKey,
	removeAddedManagementKey,
	removeBootstrapKey,
} from '../core/node-database/management-key-files.js';
import {
	BackupDatabaseInputSchema,
	BackupDatabaseOutputSchema,
	FetchAddedManagementKeyInputSchema,
	FetchAddedManagementKeyOutputSchema,
	FetchBootstrapKeyInputSchema,
	FetchBootstrapKeyOutputSchema,
	FetchDatabaseBackupInputSchema,
	FetchDatabaseBackupOutputSchema,
	ListDatabaseBackupsOutputSchema,
	PostAddedManagementKeyInputSchema,
	PostAddedManagementKeyOutputSchema,
	PostBootstrapKeyInputSchema,
	PostBootstrapKeyOutputSchema,
	PostDatabaseBackupInputSchema,
	PostDatabaseBackupOutputSchema,
	RemoveAddedManagementKeyInputSchema,
	RemoveAddedManagementKeyOutputSchema,
	RemoveBootstrapKeyOutputSchema,
	RequestMaintenanceRestartPrepOutputSchema,
	RestoreDatabaseInputSchema,
	RestoreDatabaseOutputSchema,
} from '../core/node-database/schemas.js';
import {MCP_LOOSE_OBJECT_SCHEMA, camelToSnake, wrapSdk} from './tool-utils.js';

const QUIESCENCE_HINT =
	'Destructive or export routes call maintenance quiescence automatically (request_restart_prep + poll restart gate) unless skipQuiescence is true.';

export function registerNodeDatabaseTools(
	server: McpServer,
	config: NodeSdkConfig,
): void {
	server.registerTool(
		camelToSnake('listDatabaseBackups'),
		{
			description:
				'List encrypted MongoDB backup metadata on this node (GET /listDatabaseBackups). Read-only; no management signature.',
			inputSchema: z.object({}).strict(),
			outputSchema: ListDatabaseBackupsOutputSchema,
		},
		async () => wrapSdk(listDatabaseBackups(config)),
	);

	server.registerTool(
		camelToSnake('checkDatabase'),
		{
			description:
				'MongoDB integrity report (GET /checkDatabase). Read-only diagnostic; no management signature.',
			inputSchema: z.object({}).strict(),
			outputSchema: MCP_LOOSE_OBJECT_SCHEMA,
		},
		async () => wrapSdk(checkDatabase(config)),
	);

	server.registerTool(
		camelToSnake('requestMaintenanceRestartPrep'),
		{
			description:
				`Enter maintenance draining before backup/restore/export (POST /maintenance/requestRestartPrep). Poll get_maintenance_restart_gate until readyForProcessExit. ${QUIESCENCE_HINT}`,
			inputSchema: z.object({}).strict(),
			outputSchema: RequestMaintenanceRestartPrepOutputSchema,
		},
		async () => wrapSdk(requestMaintenanceRestartPrep(config)),
	);

	server.registerTool(
		camelToSnake('backupDatabase'),
		{
			description:
				`Create encrypted MongoDB backup on node (POST /backupDatabase). Optional group scope and notes. ${QUIESCENCE_HINT}`,
			inputSchema: BackupDatabaseInputSchema,
			outputSchema: BackupDatabaseOutputSchema,
		},
		async (input: z.infer<typeof BackupDatabaseInputSchema>) =>
			wrapSdk(backupDatabase(config, input)),
	);

	server.registerTool(
		camelToSnake('restoreDatabase'),
		{
			description:
				`Destructive mongorestore from encrypted backup (POST /restoreDatabase). Requires confirmRestore: true. Wipes matching DBs. ${QUIESCENCE_HINT}`,
			inputSchema: RestoreDatabaseInputSchema,
			outputSchema: RestoreDatabaseOutputSchema,
		},
		async (input: z.infer<typeof RestoreDatabaseInputSchema>) =>
			wrapSdk(restoreDatabase(config, input)),
	);

	server.registerTool(
		camelToSnake('fetchDatabaseBackup'),
		{
			description:
				'Download encrypted backup file (POST /fetchDatabaseBackup). Requires HTTPS/loopback. Prefer userFolderPath (e.g. data/backups/<backupId>); optional returnBase64 for files ≤4 MiB. Never log file contents.',
			inputSchema: FetchDatabaseBackupInputSchema,
			outputSchema: FetchDatabaseBackupOutputSchema,
		},
		async (input: z.infer<typeof FetchDatabaseBackupInputSchema>) =>
			wrapSdk(fetchDatabaseBackup(config, input)),
	);

	server.registerTool(
		camelToSnake('postDatabaseBackup'),
		{
			description:
				`Upload encrypted backup JSON to node (POST /postDatabaseBackup multipart). Provide userFolderPath or contentBase64 (≤4 MiB). ${QUIESCENCE_HINT}`,
			inputSchema: PostDatabaseBackupInputSchema,
			outputSchema: PostDatabaseBackupOutputSchema,
		},
		async (input: z.infer<typeof PostDatabaseBackupInputSchema>) =>
			wrapSdk(postDatabaseBackup(config, input)),
	);

	server.registerTool(
		camelToSnake('fetchBootstrapKey'),
		{
			description:
				`Export bootstrap Ed25519 seed (POST /fetchBootstrapKey). HTTPS/loopback only. Never repeat private material in chat. ${QUIESCENCE_HINT}`,
			inputSchema: FetchBootstrapKeyInputSchema,
			outputSchema: FetchBootstrapKeyOutputSchema,
		},
		async (input: z.infer<typeof FetchBootstrapKeyInputSchema>) =>
			wrapSdk(fetchBootstrapKey(config, input)),
	);

	server.registerTool(
		camelToSnake('postBootstrapKey'),
		{
			description:
				'Install bootstrap seed file on node (POST /postBootstrapKey). Writes bootstrap_key/ed25519_private.hex when absent. Not maintenance-drained.',
			inputSchema: PostBootstrapKeyInputSchema,
			outputSchema: PostBootstrapKeyOutputSchema,
		},
		async (input: z.infer<typeof PostBootstrapKeyInputSchema>) =>
			wrapSdk(postBootstrapKey(config, input)),
	);

	server.registerTool(
		camelToSnake('removeBootstrapKey'),
		{
			description:
				'Remove bootstrap seed file from node (POST /removeBootstrapKey). Disk-only delete.',
			inputSchema: z.object({}).strict(),
			outputSchema: RemoveBootstrapKeyOutputSchema,
		},
		async () => wrapSdk(removeBootstrapKey(config)),
	);

	server.registerTool(
		camelToSnake('fetchAddedManagementKey'),
		{
			description:
				`Export added signer PKCS#8 PEM + seed (POST /fetchAddedManagementKey). HTTPS/loopback. publicKeyHex from get_management_signers. Never log secrets. ${QUIESCENCE_HINT}`,
			inputSchema: FetchAddedManagementKeyInputSchema,
			outputSchema: FetchAddedManagementKeyOutputSchema,
		},
		async (input: z.infer<typeof FetchAddedManagementKeyInputSchema>) =>
			wrapSdk(fetchAddedManagementKey(config, input)),
	);

	server.registerTool(
		camelToSnake('postAddedManagementKey'),
		{
			description:
				'Install added_key_<N> PEM on disk (POST /postAddedManagementKey). publicKeyHex must already exist in Mongo from add_management_signer.',
			inputSchema: PostAddedManagementKeyInputSchema,
			outputSchema: PostAddedManagementKeyOutputSchema,
		},
		async (input: z.infer<typeof PostAddedManagementKeyInputSchema>) =>
			wrapSdk(postAddedManagementKey(config, input)),
	);

	server.registerTool(
		camelToSnake('removeAddedManagementKey'),
		{
			description:
				'Delete added_key_<N> files on disk (POST /removeAddedManagementKey). Does not remove Mongo allowed-key row — use remove_management_signer for lifecycle.',
			inputSchema: RemoveAddedManagementKeyInputSchema,
			outputSchema: RemoveAddedManagementKeyOutputSchema,
		},
		async (input: z.infer<typeof RemoveAddedManagementKeyInputSchema>) =>
			wrapSdk(removeAddedManagementKey(config, input)),
	);
}
