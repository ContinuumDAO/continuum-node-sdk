import fs from 'node:fs';
import {Buffer} from 'node:buffer';
import {createPrivateKey, createPublicKey, sign} from 'node:crypto';
import {discoverKeys, resolveKeyPath} from '../config/keys.js';
import type {NodeSdkConfig} from '../config/schema.js';

const PKCS8_ED25519_PREFIX = Buffer.from(
	'302e020100300506032b657004220420',
	'hex',
);

function privateKeyFromSeed(seed: Buffer) {
	return createPrivateKey({
		key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]),
		format: 'der',
		type: 'pkcs8',
	});
}

function loadPrivateKeyMaterial(keyPath: string) {
	const raw = fs.readFileSync(keyPath);
	const text = raw.toString('utf8').trim();

	if (
		text.includes('BEGIN PRIVATE KEY') ||
		text.includes('BEGIN EC PRIVATE KEY')
	) {
		return createPrivateKey(text);
	}

	const hex = text.replace(/^0x/i, '');
	if (!/^[\da-f]{64}$/i.test(hex)) {
		throw new Error('Expected PKCS#8 PEM or 64-char hex Ed25519 seed');
	}

	return privateKeyFromSeed(Buffer.from(hex, 'hex'));
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

	return fs.readFileSync(pubPath, 'utf8').trim().replace(/^0x/i, '');
}

/** Read `.pub` sibling or derive 64-hex Ed25519 public key from the private key file. */
export function readPublicKeyHexFromPrivateKeyPath(
	keyPath: string,
): string | undefined {
	const fromPub = readPublicKeyHex(keyPath);
	if (fromPub) {
		return fromPub.replace(/^0x/i, '').toLowerCase();
	}

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
