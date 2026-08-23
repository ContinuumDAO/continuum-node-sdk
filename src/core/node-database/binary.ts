import {DATABASE_BACKUP_BASE64_MAX_BYTES} from './schemas.js';

type SdkBinaryResult =
	| {ok: true; bytes: Uint8Array}
	| {ok: false; reason: string};

export async function sha256HexOfBytes(bytes: Uint8Array): Promise<string> {
	const view = new Uint8Array(bytes);
	const hash = await crypto.subtle.digest('SHA-256', view);
	return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}

export function decodeBase64Content(contentBase64: string): SdkBinaryResult {
	const trimmed = contentBase64.trim();
	if (!trimmed) {
		return {ok: false, reason: 'contentBase64 is required.'};
	}
	try {
		const bytes = Uint8Array.from(Buffer.from(trimmed, 'base64'));
		if (bytes.length > DATABASE_BACKUP_BASE64_MAX_BYTES) {
			return {
				ok: false,
				reason: `contentBase64 exceeds ${DATABASE_BACKUP_BASE64_MAX_BYTES} bytes; use userFolderPath instead.`,
			};
		}
		return {ok: true, bytes};
	} catch {
		return {ok: false, reason: 'contentBase64 is not valid base64.'};
	}
}

export function encodeBase64IfAllowed(bytes: Uint8Array): string | undefined {
	if (bytes.length > DATABASE_BACKUP_BASE64_MAX_BYTES) {
		return undefined;
	}
	return Buffer.from(bytes).toString('base64');
}
