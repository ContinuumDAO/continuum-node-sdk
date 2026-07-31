import {createPrivateKey, randomBytes, sign} from 'node:crypto';
import type {CoinbaseCdpCredentials} from './credentials.js';

function base64UrlEncode(data: Buffer | string): string {
	const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
	return buf
		.toString('base64')
		.replace(/=/g, '')
		.replace(/\+/g, '-')
		.replace(/\//g, '_');
}

/**
 * Sign a short-lived CDP JWT (ES256) for Advanced Trade / Coinbase App REST.
 * Requires ECDSA PEM private key (Ed25519 PEM may fail — document in skills).
 */
export function signCoinbaseCdpJwt(input: {
	credentials: CoinbaseCdpCredentials;
	method: string;
	host: string;
	path: string;
	expiresInSec?: number;
}): string {
	const now = Math.floor(Date.now() / 1000);
	const expiresIn = input.expiresInSec ?? 120;
	const uri = `${input.method.toUpperCase()} ${input.host}${input.path}`;
	const header = {
		alg: 'ES256',
		kid: input.credentials.apiKeyName,
		nonce: randomBytes(16).toString('hex'),
		typ: 'JWT',
	};
	const payload = {
		iss: 'cdp',
		nbf: now,
		exp: now + expiresIn,
		sub: input.credentials.apiKeyName,
		uri,
	};
	const encodedHeader = base64UrlEncode(JSON.stringify(header));
	const encodedPayload = base64UrlEncode(JSON.stringify(payload));
	const signingInput = `${encodedHeader}.${encodedPayload}`;
	const key = createPrivateKey(input.credentials.privateKeyPem);
	const signature = sign('SHA256', Buffer.from(signingInput, 'utf8'), {
		key,
		dsaEncoding: 'ieee-p1363',
	});
	return `${signingInput}.${base64UrlEncode(signature)}`;
}
