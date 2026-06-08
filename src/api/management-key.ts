import fs from 'node:fs';
import {Buffer} from 'node:buffer';
import {createPrivateKey, createPublicKey, sign} from 'node:crypto';
import {discoverKeys, resolveKeyPath} from '../config/keys.js';
import type {NodeSdkConfig} from '../config/schema.js';

const PKCS8_ED25519_PREFIX = Buffer.from(
	'302e020100300506032b657004220420',
	'hex',
);
const OPENSSH_MAGIC = Buffer.from('openssh-key-v1\0');

function readSshString(
	buf: Buffer,
	offset: number,
): {value: Buffer; offset: number} {
	const len = buf.readUInt32BE(offset);
	offset += 4;
	return {value: buf.subarray(offset, offset + len), offset: offset + len};
}

function privateKeyFromSeed(seed: Buffer) {
	return createPrivateKey({
		key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]),
		format: 'der',
		type: 'pkcs8',
	});
}

function parseOpenSshEd25519Seed(blob: Buffer): Buffer {
	if (!blob.subarray(0, OPENSSH_MAGIC.length).equals(OPENSSH_MAGIC)) {
		throw new Error('Invalid OpenSSH private key: bad magic');
	}

	let offset = OPENSSH_MAGIC.length;
	const ciphername = readSshString(blob, offset);
	offset = ciphername.offset;
	const kdfname = readSshString(blob, offset);
	offset = kdfname.offset;
	const kdfoptions = readSshString(blob, offset);
	offset = kdfoptions.offset;

	if (ciphername.value.toString('ascii') !== 'none') {
		throw new Error('Passphrase-protected OpenSSH private keys are not supported');
	}
	if (kdfname.value.toString('ascii') !== 'none') {
		throw new Error('Passphrase-protected OpenSSH private keys are not supported');
	}
	if (kdfoptions.value.length !== 0) {
		throw new Error('Passphrase-protected OpenSSH private keys are not supported');
	}

	const nkeys = blob.readUInt32BE(offset);
	offset += 4;
	if (nkeys !== 1) {
		throw new Error('Invalid OpenSSH private key: expected exactly one key');
	}

	const publicKeySection = readSshString(blob, offset);
	offset = publicKeySection.offset;
	const privateSection = readSshString(blob, offset);

	let sectionOffset = 0;
	const check1 = privateSection.value.readUInt32BE(sectionOffset);
	sectionOffset += 4;
	const check2 = privateSection.value.readUInt32BE(sectionOffset);
	sectionOffset += 4;
	if (check1 !== check2) {
		throw new Error('Invalid OpenSSH private key: check integers mismatch');
	}

	const keytype = readSshString(privateSection.value, sectionOffset);
	sectionOffset = keytype.offset;
	if (keytype.value.toString('ascii') !== 'ssh-ed25519') {
		throw new Error('Invalid OpenSSH private key: expected ssh-ed25519 key type');
	}

	const publicKey = readSshString(privateSection.value, sectionOffset);
	sectionOffset = publicKey.offset;
	const privateKey = readSshString(privateSection.value, sectionOffset);
	if (privateKey.value.length !== 64) {
		throw new Error('Invalid OpenSSH private key: unexpected Ed25519 private key length');
	}

	return privateKey.value.subarray(0, 32);
}

function loadOpenSshPrivateKeyFromPem(text: string) {
	const base64 = text
		.split('\n')
		.map(line => line.trim())
		.filter(line => line && !line.startsWith('-----'))
		.join('');
	const seed = parseOpenSshEd25519Seed(Buffer.from(base64, 'base64'));
	return privateKeyFromSeed(seed);
}

function parseSshEd25519PublicKeyWire(wire: Buffer): string | undefined {
	if (wire.length < 4) {
		return undefined;
	}

	let offset = 0;
	const typeField = readSshString(wire, offset);
	offset = typeField.offset;
	if (typeField.value.toString('ascii') !== 'ssh-ed25519') {
		return undefined;
	}

	const keyField = readSshString(wire, offset);
	if (keyField.value.length !== 32) {
		return undefined;
	}

	return keyField.value.toString('hex').toLowerCase();
}

function parseSshEd25519AuthorizedKeyLine(line: string): string | undefined {
	const trimmed = line.trim();
	if (!trimmed.startsWith('ssh-ed25519 ')) {
		return undefined;
	}

	const parts = trimmed.split(/\s+/);
	if (parts.length < 2) {
		return undefined;
	}

	try {
		return parseSshEd25519PublicKeyWire(Buffer.from(parts[1]!, 'base64'));
	} catch {
		return undefined;
	}
}

function loadPrivateKeyMaterial(keyPath: string) {
	const raw = fs.readFileSync(keyPath);
	const text = raw.toString('utf8').trim();

	if (text.includes('BEGIN OPENSSH PRIVATE KEY')) {
		return loadOpenSshPrivateKeyFromPem(text);
	}

	if (
		text.includes('BEGIN PRIVATE KEY') ||
		text.includes('BEGIN EC PRIVATE KEY')
	) {
		return createPrivateKey(text);
	}

	const hex = text.replace(/^0x/i, '');
	if (!/^[\da-f]{64}$/i.test(hex)) {
		throw new Error('Expected OpenSSH, PKCS#8 PEM, or 64-char hex Ed25519 seed');
	}

	return privateKeyFromSeed(Buffer.from(hex, 'hex'));
}

function deriveEd25519PublicKeyHexFromPrivateKeyMaterial(
	keyPath: string,
): string | undefined {
	try {
		const privateKey = loadPrivateKeyMaterial(keyPath);
		const publicKey = createPublicKey(privateKey);
		const publicJwk = publicKey.export({format: 'jwk'}) as {x?: string};
		if (!publicJwk.x) {
			return undefined;
		}
		return Buffer.from(publicJwk.x, 'base64url').toString('hex').toLowerCase();
	} catch {
		return undefined;
	}
}

export function signUtf8Message(keyPath: string, message: string): string {
	const privateKey = loadPrivateKeyMaterial(keyPath);
	const signature = sign(null, Buffer.from(message, 'utf8'), privateKey);
	return signature.toString('hex');
}

export function readPublicKeyHex(keyPath: string): string | undefined {
	const pubPath = `${keyPath}.pub`;
	if (!fs.existsSync(pubPath)) {
		return undefined;
	}

	const content = fs.readFileSync(pubPath, 'utf8').trim();
	const fromSsh = parseSshEd25519AuthorizedKeyLine(content);
	if (fromSsh) {
		return fromSsh;
	}

	const hex = content.replace(/^0x/i, '');
	if (/^[\da-f]{64}$/i.test(hex)) {
		return hex.toLowerCase();
	}

	return undefined;
}

/** Derive 64-hex Ed25519 public key from private key file contents only. */
export function deriveEd25519PublicKeyHexFromPrivateKeyPath(
	keyPath: string,
): string | undefined {
	return deriveEd25519PublicKeyHexFromPrivateKeyMaterial(keyPath);
}

/** Read `.pub` sibling or derive 64-hex Ed25519 public key from the private key file. */
export function readPublicKeyHexFromPrivateKeyPath(
	keyPath: string,
): string | undefined {
	const fromPub = readPublicKeyHex(keyPath);
	if (fromPub) {
		return fromPub.replace(/^0x/i, '').toLowerCase();
	}

	return deriveEd25519PublicKeyHexFromPrivateKeyMaterial(keyPath);
}

export function resolveSignerPublicKey(
	config: NodeSdkConfig,
): string | undefined {
	const keyPath = resolveKeyPath(
		config.signer.defaultKey,
		config.signer.defaultKeyPath,
		config.node.mpcConfigPath,
	);
	if (!keyPath) {
		return undefined;
	}

	return readPublicKeyHexFromPrivateKeyPath(keyPath);
}

export function resolveKeyPathForPublicKey(
	config: NodeSdkConfig,
	publicKeyHex: string,
): string | undefined {
	const normalized = publicKeyHex.replace(/^0x/i, '').toLowerCase();
	const keys = discoverKeys(config.node.mpcConfigPath);

	for (const key of keys) {
		const pub = readPublicKeyHexFromPrivateKeyPath(key.path)?.toLowerCase();
		if (pub === normalized) {
			return key.path;
		}
	}

	const defaultPath = resolveKeyPath(
		config.signer.defaultKey,
		config.signer.defaultKeyPath,
		config.node.mpcConfigPath,
	);
	if (!defaultPath) {
		return undefined;
	}

	const defaultPub = readPublicKeyHexFromPrivateKeyPath(defaultPath)?.toLowerCase();
	return defaultPub === normalized ? defaultPath : undefined;
}
