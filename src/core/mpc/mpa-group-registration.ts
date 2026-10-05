import {normalizeNodeKey} from './sign-request-utils.js';

function nodeKeysFromRecord(row: Record<string, unknown> | null | undefined): string[] {
	if (!row) return [];
	const out: string[] = [];
	const raw = row.keylist ?? row.KeyList ?? row.keyList;
	if (Array.isArray(raw)) {
		for (const k of raw) {
			if (typeof k === 'string' && k.trim()) out.push(k.trim());
		}
	}
	for (const mapKey of ['ClientKeys', 'clientkeys', 'SigList', 'siglist'] as const) {
		const m = row[mapKey];
		if (m && typeof m === 'object' && !Array.isArray(m)) {
			for (const k of Object.keys(m as Record<string, unknown>)) {
				if (k.trim()) out.push(k.trim());
			}
		}
	}
	return out;
}

/** Unique KeyGen member node keys (list + optional attached node). */
export function collectKeyGenMemberNodeKeys(
	...sources: Array<Record<string, unknown> | string | null | undefined>
): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const src of sources) {
		const keys = typeof src === 'string' ? [src.trim()] : nodeKeysFromRecord(src);
		for (const k of keys) {
			if (!k) continue;
			const id = normalizeNodeKey(k);
			if (!id || seen.has(id)) continue;
			seen.add(id);
			out.push(k);
		}
	}
	return out;
}

/**
 * Billing nodeKey for a KeyGen: this node if it registered, else the first group member that did.
 */
export async function pickRegisteredMpaNodeKey(
	localNodeKey: string | undefined,
	localRegistered: boolean,
	candidateNodeKeys: string[],
	isRegistered: (nodeKey: string) => boolean | Promise<boolean>,
): Promise<string | null> {
	const local = localNodeKey?.trim() ?? '';
	if (localRegistered && local) return local;
	const localId = local ? normalizeNodeKey(local) : '';
	for (const k of candidateNodeKeys) {
		const trimmed = k.trim();
		if (!trimmed) continue;
		if (localId && normalizeNodeKey(trimmed) === localId) continue;
		if (await isRegistered(trimmed)) return trimmed;
	}
	return localRegistered ? local || null : null;
}

export async function findRegisteredMpaNodeKey(opts: {
	keyGenId: string;
	addressKind: string;
	localNodeKey?: string | null;
	localRegistered?: boolean;
	candidateNodeKeys: string[];
	isRegistered: (nodeKey: string) => Promise<boolean>;
}): Promise<string | null> {
	return pickRegisteredMpaNodeKey(
		opts.localNodeKey ?? undefined,
		opts.localRegistered === true,
		opts.candidateNodeKeys,
		opts.isRegistered,
	);
}

/** Prefer billing nodeKey for veCTM waiver / month-activation chain reads. */
export function mpaBillingNodeKeyForVeCtmReads(
	billingNodeKey: string | null | undefined,
	localNodeKey: string | null | undefined,
): string {
	return (billingNodeKey ?? localNodeKey ?? '').trim();
}

export function keyGenGroupVeCtmWaived(input: {
	qualifiesForVeCtmWaiver?: boolean;
	veCtmAttachGroupWaived?: boolean;
}): boolean {
	return Boolean(input.qualifiesForVeCtmWaiver || input.veCtmAttachGroupWaived);
}
