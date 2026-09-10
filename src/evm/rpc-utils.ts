import type {KeyGenResultById} from '../core/mpc/types.js';

export function isValidRpcUrl(url: string): boolean {
	const t = url.trim();
	if (!t) return false;
	try {
		const u = new URL(t);
		return u.protocol === 'http:' || u.protocol === 'https:';
	} catch {
		return false;
	}
}

/** @deprecated KeyGen ClientKeys / clientId is unused. Always returns null. */
export function getClientIdFromKeyGenResult(
	_data: KeyGenResultById | null | undefined,
): string | null {
	return null;
}
