import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {
	ensureLocalManagementSigner,
	getLocalManagementSignerStatus,
	managementSignEd25519,
	resolveOnDiskBootstrapFirstSignerOption,
} from '../dist/core/management-signer.js';
import type {NodeSdkConfig} from '../dist/config/schema.js';

const fixturesRoot = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'fixtures/mpc-config',
);
const BOOTSTRAP_PUB_HEX =
	'5d0b57aa6c62211f5ae93b9e92942e211652b89bc89a75dddb8aeb5d2580f8b4';

function makeConfig(mpcConfigPath: string): NodeSdkConfig {
	return {
		node: {
			baseUrl: 'http://127.0.0.1',
			managementPort: 3000,
			mpcConfigPath,
		},
		signer: {
			defaultKey: 'bootstrap',
			defaultKeyPath: null,
		},
	};
}

test('managementSignEd25519 signs with bootstrap OpenSSH key', async () => {
	const config = makeConfig(fixturesRoot);
	const result = await managementSignEd25519(config, {
		nonce: 1,
		nodeKey: 'test-node',
		clientSig: '',
		publicKey: BOOTSTRAP_PUB_HEX,
	});

	assert.equal(result.ok, true);
	if (result.ok) {
		assert.match(result.data.body.clientSig, /^[a-f0-9]{128}$/);
	}
});

test('ensureLocalManagementSigner succeeds for bootstrap pubkey', async () => {
	const signer = await ensureLocalManagementSigner(BOOTSTRAP_PUB_HEX, {
		keyRoot: fixturesRoot,
		toMcpApiError: message => new Error(message),
	});
	assert.equal(signer.fileName, 'bootstrap_ed25519');
});

test('getLocalManagementSignerStatus reports bootstrap key as available', async () => {
	const status = await getLocalManagementSignerStatus(
		{
			id: `eddsa:${BOOTSTRAP_PUB_HEX}`,
			kind: 'EdDSA',
			value: BOOTSTRAP_PUB_HEX,
			nonce: 1,
		},
		{
			keyRoot: fixturesRoot,
			toMcpApiError: message => new Error(message),
		},
	);
	assert.equal(status.available, true);
});

test('tx-check KeyGen prefers bootstrap_key over another allowed Ed25519', async () => {
	const {privateKey, publicKey} = generateKeyPairSync('ed25519');
	const seedHex = Buffer.from(
		(privateKey.export({format: 'jwk'}) as {d: string}).d,
		'base64url',
	).toString('hex');
	const pubHex = Buffer.from(
		(publicKey.export({format: 'jwk'}) as {x: string}).x,
		'base64url',
	).toString('hex');
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mpc-config-'));
	const bootstrapDir = path.join(tempRoot, 'bootstrap_key');
	fs.mkdirSync(bootstrapDir, {recursive: true});
	fs.writeFileSync(path.join(bootstrapDir, 'ed25519_private.hex'), `${seedHex}\n`);

	const other = '11'.repeat(32);
	const selected = await resolveOnDiskBootstrapFirstSignerOption(
		[
			{
				id: `eddsa:${other}`,
				kind: 'EdDSA',
				value: other,
				nonce: 1,
				label: 'added',
			},
			{
				id: `eddsa:${pubHex}`,
				kind: 'EdDSA',
				value: pubHex,
				nonce: 2,
				label: 'bootstrap',
			},
		],
		{
			keyRoot: tempRoot,
			toMcpApiError: message => new Error(message),
		},
	);
	assert.equal(selected.value.toLowerCase(), pubHex);
});
