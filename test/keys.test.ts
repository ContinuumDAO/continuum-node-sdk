import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {
	discoverBootstrapKey,
	discoverKeys,
} from '../dist/config/keys.js';
import {resolveKeyPathForPublicKey} from '../dist/api/management-key.js';
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

test('discoverBootstrapKey finds bootstrap_ed25519', () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mpc-config-'));
	const bootstrapDir = path.join(tempRoot, 'bootstrap_key');
	fs.mkdirSync(bootstrapDir, {recursive: true});
	fs.copyFileSync(
		path.join(fixturesRoot, 'bootstrap_key/bootstrap_ed25519'),
		path.join(bootstrapDir, 'bootstrap_ed25519'),
	);
	fs.copyFileSync(
		path.join(fixturesRoot, 'bootstrap_key/bootstrap_ed25519.pub'),
		path.join(bootstrapDir, 'bootstrap_ed25519.pub'),
	);

	const bootstrap = discoverBootstrapKey(tempRoot);
	assert.ok(bootstrap);
	assert.equal(bootstrap.id, 'bootstrap');
	assert.equal(bootstrap.kind, 'bootstrap');
	assert.equal(bootstrap.path, path.join(bootstrapDir, 'bootstrap_ed25519'));
});

test('discoverBootstrapKey prefers ed25519_private.hex when present', () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mpc-config-'));
	const bootstrapDir = path.join(tempRoot, 'bootstrap_key');
	fs.mkdirSync(bootstrapDir, {recursive: true});
	fs.copyFileSync(
		path.join(fixturesRoot, 'bootstrap_key/bootstrap_ed25519'),
		path.join(bootstrapDir, 'bootstrap_ed25519'),
	);
	fs.writeFileSync(
		path.join(bootstrapDir, 'ed25519_private.hex'),
		'f100fbebcbd9d6c1675b54f84e494a85c1ff4458a6e7a244e8af4836f432dbb2\n',
	);

	const bootstrap = discoverBootstrapKey(tempRoot);
	assert.equal(
		bootstrap?.path,
		path.join(bootstrapDir, 'ed25519_private.hex'),
	);
});

test('discoverKeys includes bootstrap and added keys', () => {
	const keys = discoverKeys(fixturesRoot);
	assert.equal(keys.length, 2);
	assert.equal(keys[0]?.kind, 'bootstrap');
	assert.equal(keys[1]?.id, 'added_key_1');
});

test('resolveKeyPathForPublicKey matches bootstrap pubkey', () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mpc-config-'));
	const bootstrapDir = path.join(tempRoot, 'bootstrap_key');
	fs.mkdirSync(bootstrapDir, {recursive: true});
	fs.copyFileSync(
		path.join(fixturesRoot, 'bootstrap_key/bootstrap_ed25519'),
		path.join(bootstrapDir, 'bootstrap_ed25519'),
	);
	fs.copyFileSync(
		path.join(fixturesRoot, 'bootstrap_key/bootstrap_ed25519.pub'),
		path.join(bootstrapDir, 'bootstrap_ed25519.pub'),
	);

	const config = makeConfig(tempRoot);
	const keyPath = resolveKeyPathForPublicKey(config, BOOTSTRAP_PUB_HEX);
	assert.equal(keyPath, path.join(bootstrapDir, 'bootstrap_ed25519'));
});
