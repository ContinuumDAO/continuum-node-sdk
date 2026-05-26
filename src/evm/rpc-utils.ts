import type {KeyGenResultById} from '../detops/mpc/types.js';

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

/** First non-empty ClientId from getKeyGenResultById ClientKeys */
export function getClientIdFromKeyGenResult(
	data: KeyGenResultById | null | undefined,
): string | null {
	const map = data?.ClientKeys;
	if (!map || typeof map !== 'object') return null;
	for (const v of Object.values(map)) {
		if (typeof v === 'string' && v.trim()) return v.trim();
	}
	return null;
}
