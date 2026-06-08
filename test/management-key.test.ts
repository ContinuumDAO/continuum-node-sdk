import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {
	readPublicKeyHex,
	readPublicKeyHexFromPrivateKeyPath,
	signUtf8Message,
} from '../dist/api/management-key.js';

const fixturesRoot = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'fixtures/mpc-config',
);
const bootstrapKey = path.join(fixturesRoot, 'bootstrap_key/bootstrap_ed25519');
const addedKey = path.join(fixturesRoot, 'added_keys/added_key_1');
const hexSeed = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'fixtures/hex-seed/ed25519_private.hex',
);
const encryptedKey = path.join(
	fixturesRoot,
	'bootstrap_key/encrypted_ed25519',
);

const BOOTSTRAP_PUB_HEX =
	'5d0b57aa6c62211f5ae93b9e92942e211652b89bc89a75dddb8aeb5d2580f8b4';
const ADDED_PUB_HEX =
	'ebfbd9e08385e1684a7d116d7c6e34077b12439a5d760ddda461db085b910058';

test('signUtf8Message signs OpenSSH bootstrap private key', () => {
	const signature = signUtf8Message(bootstrapKey, 'continuum-test-message');
	assert.match(signature, /^[a-f0-9]{128}$/);
});

test('signUtf8Message signs PKCS#8 added private key', () => {
	const signature = signUtf8Message(addedKey, 'continuum-test-message');
	assert.match(signature, /^[a-f0-9]{128}$/);
});

test('signUtf8Message signs 64-char hex seed', () => {
	const signature = signUtf8Message(hexSeed, 'continuum-test-message');
	assert.match(signature, /^[a-f0-9]{128}$/);
});

test('readPublicKeyHex parses ssh-ed25519 .pub files', () => {
	assert.equal(readPublicKeyHex(bootstrapKey), BOOTSTRAP_PUB_HEX);
});

test('readPublicKeyHex parses raw hex .pub files', () => {
	assert.equal(readPublicKeyHex(addedKey), ADDED_PUB_HEX);
});

test('readPublicKeyHexFromPrivateKeyPath uses bootstrap .pub sibling', () => {
	assert.equal(
		readPublicKeyHexFromPrivateKeyPath(bootstrapKey),
		BOOTSTRAP_PUB_HEX,
	);
});

test('encrypted OpenSSH private key fails with explicit error', () => {
	assert.throws(
		() => signUtf8Message(encryptedKey, 'continuum-test-message'),
		/Passphrase-protected OpenSSH private keys are not supported/,
	);
});
