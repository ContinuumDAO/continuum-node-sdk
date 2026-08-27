import assert from 'node:assert/strict';
import {test} from 'node:test';
import {decodeBase64Content, encodeBase64IfAllowed, sha256HexOfBytes} from '../dist/core/node-database/binary.js';
import {
	DATABASE_BACKUP_BASE64_MAX_BYTES,
	PostAddedManagementKeyInputSchema,
	PostDatabaseBackupInputSchema,
	RestoreDatabaseInputSchema,
	RestoreDatabaseOutputSchema,
} from '../dist/core/node-database/schemas.js';
import {
	sensitiveExportTransportAllowed,
	sensitiveExportTransportError,
} from '../dist/core/node-database/transport.js';
import {resolveToolGroupId} from '../dist/mcp/deferred/tool-group-map.js';

test('RestoreDatabaseInputSchema requires confirmRestore', () => {
	const bad = RestoreDatabaseInputSchema.safeParse({backupId: 'bk1'});
	assert.equal(bad.success, false);
	const good = RestoreDatabaseInputSchema.safeParse({
		backupId: 'bk1',
		confirmRestore: true,
	});
	assert.equal(good.success, true);
});

test('RestoreDatabaseOutputSchema keeps post-restore check hint', () => {
	const parsed = RestoreDatabaseOutputSchema.safeParse({
		restoredFrom: '/app/database_backups/x.backup',
		backupId: 'x.backup',
		hint: 'Run check_database next (then POST /fixDatabase if it reports nonce issues).',
		unconfirmedGlobalNonceKeyGens: '2',
	});
	assert.equal(parsed.success, true);
	if (parsed.success) {
		assert.match(parsed.data.hint ?? '', /check_database/);
	}
});

test('PostDatabaseBackupInputSchema requires userFolderPath or contentBase64', () => {
	const bad = PostDatabaseBackupInputSchema.safeParse({});
	assert.equal(bad.success, false);
	const good = PostDatabaseBackupInputSchema.safeParse({userFolderPath: 'data/backups/x.json'});
	assert.equal(good.success, true);
});

test('PostAddedManagementKeyInputSchema accepts one key material field', () => {
	const pemOnly = PostAddedManagementKeyInputSchema.safeParse({
		publicKeyHex: 'a'.repeat(64),
		privateKeyPem: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
	});
	assert.equal(pemOnly.success, true);
	const both = PostAddedManagementKeyInputSchema.safeParse({
		publicKeyHex: 'a'.repeat(64),
		privateKeyPem: 'pem',
		ed25519PrivateSeedHex: 'b'.repeat(64),
	});
	assert.equal(both.success, false);
});

test('decodeBase64Content enforces inline size cap', () => {
	const small = Buffer.alloc(16).toString('base64');
	assert.equal(decodeBase64Content(small).ok, true);
	const huge = Buffer.alloc(DATABASE_BACKUP_BASE64_MAX_BYTES + 1).toString('base64');
	const rejected = decodeBase64Content(huge);
	assert.equal(rejected.ok, false);
	if (!rejected.ok) {
		assert.match(rejected.reason, /userFolderPath/);
	}
});

test('encodeBase64IfAllowed omits oversized payloads', () => {
	const small = new Uint8Array(8);
	assert.ok(encodeBase64IfAllowed(small));
	const huge = new Uint8Array(DATABASE_BACKUP_BASE64_MAX_BYTES + 1);
	assert.equal(encodeBase64IfAllowed(huge), undefined);
});

test('sha256HexOfBytes is lowercase hex', async () => {
	const hash = await sha256HexOfBytes(new TextEncoder().encode('hello'));
	assert.match(hash, /^[0-9a-f]{64}$/);
});

test('sensitiveExportTransportAllowed accepts https and loopback', () => {
	const httpsCfg = {
		node: {baseUrl: 'https://node.example', managementPort: 8446},
		signer: {defaultKey: 'k', defaultKeyPath: null},
	} as const;
	const loopbackCfg = {
		node: {baseUrl: 'http://127.0.0.1', managementPort: 8446},
		signer: {defaultKey: 'k', defaultKeyPath: null},
	} as const;
	const remoteCfg = {
		node: {baseUrl: 'http://192.168.1.10', managementPort: 8446},
		signer: {defaultKey: 'k', defaultKeyPath: null},
	} as const;
	assert.equal(sensitiveExportTransportAllowed(httpsCfg), true);
	assert.equal(sensitiveExportTransportAllowed(loopbackCfg), true);
	assert.equal(sensitiveExportTransportAllowed(remoteCfg), false);
	assert.match(sensitiveExportTransportError(), /HTTPS/);
});

test('node_database tools resolve to pack groups', () => {
	assert.equal(resolveToolGroupId('backup_database'), 'node_database:backup');
	assert.equal(resolveToolGroupId('restore_database'), 'node_database:backup');
	assert.equal(resolveToolGroupId('fetch_bootstrap_key'), 'node_database:bootstrap');
	assert.equal(resolveToolGroupId('remove_bootstrap_key'), 'node_database:bootstrap');
	assert.equal(resolveToolGroupId('fetch_added_management_key'), 'node_database:added-keys');
	assert.equal(resolveToolGroupId('list_database_backups'), 'node_database:backup');
});
