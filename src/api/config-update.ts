import {managementSigFields} from '../core/mpc/management-post-sig.js';

/** SHA-256 hex (lowercase, no 0x) of UTF-8 bytes — matches mpc-auth hashing of plannedYaml. */
export async function sha256HexUtf8(text: string): Promise<string> {
	const data = new TextEncoder().encode(text);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	return Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/** Opaque `signedMessage` line for POST /configUpdateImplement. */
export async function signedMessageForConfigUpdateImplement(plannedYaml: string): Promise<string> {
	return `configUpdateImplement|${await sha256HexUtf8(plannedYaml)}`;
}

/** Unsigned POST /configUpdateImplement body. */
export function buildConfigUpdateImplementPostBody(
	nonce: number,
	nodeKey: string | null | undefined,
	plannedYaml: string,
	signedMessage: string,
	clientSig = '',
	extras?: Record<string, unknown>,
): Record<string, unknown> {
	return {
		...managementSigFields(nonce, nodeKey),
		plannedYaml,
		signedMessage,
		clientSig: clientSig.trim().replace(/^0x/i, ''),
		...extras,
	};
}
