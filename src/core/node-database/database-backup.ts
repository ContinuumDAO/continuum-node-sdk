import type {NodeSdkConfig} from '../../config/schema.js';
import type {z} from 'zod';
import {getUserFolderFile, writeUserFolderFile} from '../agent/user-folder.js';
import type {SdkResult} from '../result.js';
import {decodeBase64Content, encodeBase64IfAllowed, sha256HexOfBytes} from './binary.js';
import {ensureMaintenanceQuiescence} from './maintenance-quiescence.js';
import {
	NODE_DATABASE_API_PATHS,
	DatabaseBackupRowSchema,
	ListDatabaseBackupsOutputSchema,
	BackupDatabaseOutputSchema,
	RestoreDatabaseOutputSchema,
	FetchDatabaseBackupOutputSchema,
	PostDatabaseBackupOutputSchema,
	type BackupDatabaseInput,
	type FetchDatabaseBackupInput,
	type FixDatabaseInput,
	type PostDatabaseBackupInput,
	type RestoreDatabaseInput,
} from './schemas.js';
import {
	managementGetRecord,
	postSignedManagementRequest,
	postSignedMultipartBackup,
	postSignedRawResponse,
} from './signed-post.js';
import {
	sensitiveExportTransportAllowed,
	sensitiveExportTransportError,
} from './transport.js';
import {
	buildManagementPostRequest,
	managementSign,
	DEFAULT_MANAGEMENT_SIGNING,
} from '../management-signer.js';

function pickString(row: Record<string, unknown>, ...keys: string[]): string {
	for (const key of keys) {
		const value = row[key];
		if (typeof value === 'string' && value.trim()) {
			return value.trim();
		}
	}
	return '';
}

function pickBool(row: Record<string, unknown>, ...keys: string[]): boolean {
	for (const key of keys) {
		if (key in row) return Boolean(row[key]);
	}
	return false;
}

function pickNumber(row: Record<string, unknown>, ...keys: string[]): number | undefined {
	for (const key of keys) {
		const value = row[key];
		if (typeof value === 'number' && Number.isFinite(value)) {
			return value;
		}
	}
	return undefined;
}

export async function listDatabaseBackups(
	config: NodeSdkConfig,
): Promise<SdkResult<z.infer<typeof ListDatabaseBackupsOutputSchema>>> {
	const result = await managementGetRecord(config, NODE_DATABASE_API_PATHS.listDatabaseBackups);
	if (!result.ok) return result;

	const backupsRaw = result.data.backups ?? result.data.Backups;
	const backups: z.infer<typeof DatabaseBackupRowSchema>[] = [];
	if (Array.isArray(backupsRaw)) {
		for (const item of backupsRaw) {
			if (!item || typeof item !== 'object') continue;
			const row = item as Record<string, unknown>;
			const backupId = pickString(row, 'backupId', 'BackupId');
			if (!backupId) continue;
			backups.push({
				backupId,
				backupUtc: pickString(row, 'backupUtc', 'BackupUtc'),
				notes: pickString(row, 'notes', 'Notes'),
			});
		}
	}
	const parsed = ListDatabaseBackupsOutputSchema.safeParse({backups});
	if (!parsed.success) {
		return {ok: false, reason: 'listDatabaseBackups response failed validation.'};
	}
	return {ok: true, data: parsed.data};
}

export async function checkDatabase(
	config: NodeSdkConfig,
): Promise<SdkResult<Record<string, unknown>>> {
	return managementGetRecord(config, NODE_DATABASE_API_PATHS.checkDatabase);
}

export async function backupDatabase(
	config: NodeSdkConfig,
	input: BackupDatabaseInput,
): Promise<SdkResult<z.infer<typeof BackupDatabaseOutputSchema>>> {
	const quiescence = await ensureMaintenanceQuiescence(config, input);
	if (!quiescence.ok) return quiescence;

	const posted = await postSignedManagementRequest(config, NODE_DATABASE_API_PATHS.backupDatabase, () => {
		const body: Record<string, unknown> = {};
		if (input.includeGroupIds?.length) body.includeGroupIds = input.includeGroupIds;
		if (input.excludeGroupIds?.length) body.excludeGroupIds = input.excludeGroupIds;
		if (input.mongoRootUsername) body.mongoRootUsername = input.mongoRootUsername;
		if (input.mongoRootPassword) body.mongoRootPassword = input.mongoRootPassword;
		if (input.notes) body.notes = input.notes;
		return body;
	});
	if (!posted.ok) return posted;

	const row = posted.data.data;
	const output = {
		backupId: pickString(row, 'backupId', 'BackupId'),
		path: pickString(row, 'path', 'Path'),
		backupUtc: pickString(row, 'backupUtc', 'BackupUtc') || undefined,
		ciphertextSha256: pickString(row, 'ciphertextSha256', 'CiphertextSha256') || undefined,
		ciphertextByteLength: pickNumber(row, 'ciphertextByteLength', 'CiphertextByteLength'),
		backupFileSizeBytes: pickNumber(row, 'backupFileSizeBytes', 'BackupFileSizeBytes'),
		notes: pickString(row, 'notes', 'Notes') || undefined,
	};
	const parsed = BackupDatabaseOutputSchema.safeParse(output);
	if (!parsed.success || !parsed.data.backupId) {
		return {ok: false, reason: 'backupDatabase response failed validation.'};
	}
	return {ok: true, data: parsed.data};
}

export async function restoreDatabase(
	config: NodeSdkConfig,
	input: RestoreDatabaseInput,
): Promise<SdkResult<z.infer<typeof RestoreDatabaseOutputSchema>>> {
	const quiescence = await ensureMaintenanceQuiescence(config, input);
	if (!quiescence.ok) return quiescence;

	const posted = await postSignedManagementRequest(config, NODE_DATABASE_API_PATHS.restoreDatabase, () => {
		const body: Record<string, unknown> = {};
		if (input.backupId) body.backupId = input.backupId;
		if (input.backupPath) body.backupPath = input.backupPath;
		if (input.mongoRootUsername) body.mongoRootUsername = input.mongoRootUsername;
		if (input.mongoRootPassword) body.mongoRootPassword = input.mongoRootPassword;
		return body;
	});
	if (!posted.ok) return posted;

	const row = posted.data.data;
	const output = {
		restoredFrom: pickString(row, 'restoredFrom', 'RestoredFrom'),
		backupId: pickString(row, 'backupId', 'BackupId'),
		exhaustedGlobalNonceKeyGens:
			pickString(row, 'exhaustedGlobalNonceKeyGens', 'ExhaustedGlobalNonceKeyGens') || undefined,
	};
	const parsed = RestoreDatabaseOutputSchema.safeParse(output);
	if (!parsed.success || !parsed.data.restoredFrom) {
		return {ok: false, reason: 'restoreDatabase response failed validation.'};
	}
	return {ok: true, data: parsed.data};
}

export async function fetchDatabaseBackup(
	config: NodeSdkConfig,
	input: FetchDatabaseBackupInput,
): Promise<SdkResult<z.infer<typeof FetchDatabaseBackupOutputSchema>>> {
	if (!sensitiveExportTransportAllowed(config)) {
		return {ok: false, reason: sensitiveExportTransportError()};
	}
	const quiescence = await ensureMaintenanceQuiescence(config, input);
	if (!quiescence.ok) return quiescence;

	const fetched = await postSignedRawResponse(
		config,
		NODE_DATABASE_API_PATHS.fetchDatabaseBackup,
		() => ({backupId: input.backupId.trim()}),
	);
	if (!fetched.ok) return fetched;

	const bytes = fetched.data.bytes;
	const sha256 = await sha256HexOfBytes(bytes);
	let savedPath: string | undefined;
	if (input.userFolderPath) {
		const text = Buffer.from(bytes).toString('utf8');
		const written = await writeUserFolderFile(config, input.userFolderPath, text);
		if (!written.ok) return written;
		savedPath = written.data.path;
	}

	const contentBase64 =
		input.returnBase64 === false ? undefined : encodeBase64IfAllowed(bytes);

	const output = {
		backupId: input.backupId.trim(),
		sizeBytes: bytes.length,
		sha256,
		savedPath,
		contentBase64,
	};
	const parsed = FetchDatabaseBackupOutputSchema.safeParse(output);
	if (!parsed.success) {
		return {ok: false, reason: 'fetchDatabaseBackup output failed validation.'};
	}
	return {ok: true, data: parsed.data};
}

export async function postDatabaseBackup(
	config: NodeSdkConfig,
	input: PostDatabaseBackupInput,
): Promise<SdkResult<z.infer<typeof PostDatabaseBackupOutputSchema>>> {
	const quiescence = await ensureMaintenanceQuiescence(config, input);
	if (!quiescence.ok) return quiescence;

	let bytes: Uint8Array;
	let filename = 'upload.json';
	if (input.userFolderPath) {
		const file = await getUserFolderFile(config, input.userFolderPath);
		if (!file.ok) return file;
		bytes = Buffer.from(file.data.content, 'utf8');
		const parts = input.userFolderPath.replace(/\\/g, '/').split('/');
		filename = parts[parts.length - 1] || filename;
	} else if (input.contentBase64) {
		const decoded = decodeBase64Content(input.contentBase64);
		if (!decoded.ok) return decoded;
		bytes = decoded.bytes;
	} else {
		return {ok: false, reason: 'userFolderPath or contentBase64 is required.'};
	}

	const contentSha256 = await sha256HexOfBytes(bytes);
	const built = await buildManagementPostRequest(
		config,
		{
			path: NODE_DATABASE_API_PATHS.postDatabaseBackup,
			buildRequestFields: () => ({contentSha256}),
		},
		DEFAULT_MANAGEMENT_SIGNING,
	);
	if (!built.ok) return built;

	const signed = await managementSign(config, DEFAULT_MANAGEMENT_SIGNING, built.data.unsignedBody, {
		publicKey: built.data.selectedSigningKey?.value,
	});
	if (!signed.ok) return signed;

	const posted = await postSignedMultipartBackup(
		config,
		NODE_DATABASE_API_PATHS.postDatabaseBackup,
		signed.data,
		bytes,
		filename,
	);
	if (!posted.ok) return posted;

	const row = posted.data;
	const output = {
		backupId: pickString(row, 'backupId', 'BackupId'),
		path: pickString(row, 'path', 'Path'),
		backupFileSizeBytes: pickNumber(row, 'backupFileSizeBytes', 'BackupFileSizeBytes') ?? 0,
		contentSha256: pickString(row, 'contentSha256', 'ContentSha256') || contentSha256,
		alreadyPresent: pickBool(row, 'alreadyPresent', 'AlreadyPresent') || undefined,
		message: pickString(row, 'message', 'Message') || undefined,
	};
	const parsed = PostDatabaseBackupOutputSchema.safeParse(output);
	if (!parsed.success || !parsed.data.backupId) {
		return {ok: false, reason: 'postDatabaseBackup response failed validation.'};
	}
	return {ok: true, data: parsed.data};
}

export async function fixDatabase(
	config: NodeSdkConfig,
	input: FixDatabaseInput,
): Promise<SdkResult<Record<string, unknown>>> {
	const quiescence = await ensureMaintenanceQuiescence(config, input);
	if (!quiescence.ok) return quiescence;

	const posted = await postSignedManagementRequest(config, NODE_DATABASE_API_PATHS.fixDatabase, () => {
		const body: Record<string, unknown> = {
			instruction: input.instruction,
			report: input.report,
		};
		if (input.mongoRootUsername) body.mongoRootUsername = input.mongoRootUsername;
		if (input.mongoRootPassword) body.mongoRootPassword = input.mongoRootPassword;
		return body;
	});
	if (!posted.ok) return posted;
	return {ok: true, data: posted.data.data};
}

export {requestMaintenanceRestartPrep} from './maintenance-quiescence.js';
