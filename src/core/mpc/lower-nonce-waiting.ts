/**
 * Get Sig keeps each saved nonce. When another open request for the same key and chain
 * still holds a lower nonce, name both sign requests. Signing continues.
 */

import type {NodeSdkConfig} from '../../config/schema.js';
import {buildManagementQueryPath, managementGet} from '../../api/management-api.js';
import {mpcGetSignResultById} from './client.js';
import {listSignRequests} from './sign-request-lifecycle.js';
import {
	getBatchLength,
	getMessageRawForDetail,
	isBatchSignRequest,
	keyGenIdFromRecord,
	mpcAuthEnvelopeData,
	readSignRequestListRowId,
	tryParseNonceFromMessageRawForGetSig,
} from './sign-request-utils.js';

export type NonceQueueBlocker = {
	requestId: string;
	nonces: number[];
};

const SKIP_STATUSES = new Set(['shelved', 'expired', 'blocked', 'executed']);

function formatNonceList(nonces: number[]): string {
	const uniq = [...new Set(nonces)].sort((a, b) => a - b);
	if (uniq.length === 1) return `nonce ${uniq[0]}`;
	return `nonces ${uniq.join(', ')}`;
}

function joinBlockers(parts: string[]): string {
	if (parts.length === 1) return parts[0]!;
	if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
	return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Warning text naming this sign request and every older one still holding a lower nonce. */
export function lowerNonceWaitingWarning(args: {
	currentRequestId: string;
	currentNonces: number[];
	blockers: NonceQueueBlocker[];
}): string | null {
	const currentRequestId = args.currentRequestId.trim();
	const currentNonces = args.currentNonces.filter(n => Number.isFinite(n) && n >= 0);
	if (!currentRequestId || currentNonces.length === 0) return null;
	const minCurrent = Math.min(...currentNonces);

	const byId = new Map<string, number[]>();
	for (const blocker of args.blockers) {
		const requestId = blocker.requestId.trim();
		if (!requestId || requestId === currentRequestId) continue;
		const below = blocker.nonces.filter(n => Number.isFinite(n) && n >= 0 && n < minCurrent);
		if (below.length === 0) continue;
		const prev = byId.get(requestId) ?? [];
		byId.set(requestId, [...prev, ...below]);
	}
	if (byId.size === 0) return null;

	const ordered = [...byId.entries()]
		.map(([requestId, nonces]) => ({
			requestId,
			nonces: [...new Set(nonces)].sort((a, b) => a - b),
		}))
		.sort((a, b) => a.nonces[0]! - b.nonces[0]! || a.requestId.localeCompare(b.requestId));

	const currentLabel = `${currentRequestId} (${formatNonceList(currentNonces)})`;
	const waitingText = joinBlockers(
		ordered.map(b => `${b.requestId} (${formatNonceList(b.nonces)})`),
	);
	const tail =
		ordered.length === 1
			? `This signature is fine, but it will not confirm until ${ordered[0]!.requestId} is executed.`
			: 'This signature is fine, but it will not confirm until those sign requests are executed.';
	return `${currentLabel} is waiting on ${waitingText}. ${tail}`;
}

function rowString(row: Record<string, unknown>, keys: string[]): string {
	for (const key of keys) {
		const v = row[key];
		if (v != null && String(v).trim() !== '') return String(v).trim();
	}
	return '';
}

function rowStatus(row: Record<string, unknown>): string {
	return rowString(row, ['status', 'Status']).toLowerCase();
}

function chainIdOf(row: Record<string, unknown>): string {
	return rowString(row, ['DestinationChainID', 'destinationChainID', 'destinationChainId']);
}

function sameChain(a: string, b: string): boolean {
	if (a === b) return true;
	const na = Number(a);
	const nb = Number(b);
	return Number.isFinite(na) && Number.isFinite(nb) && na === nb;
}

function noncesOf(row: Record<string, unknown>): number[] {
	const n = isBatchSignRequest(row) ? getBatchLength(row) : 1;
	const out: number[] = [];
	for (let i = 0; i < n; i++) {
		const parsed = tryParseNonceFromMessageRawForGetSig(getMessageRawForDetail(row, i));
		if (parsed != null) out.push(parsed);
	}
	return out;
}

function skipped(row: Record<string, unknown>): boolean {
	if (row.shelved === true || row.Shelved === true) return true;
	return SKIP_STATUSES.has(rowStatus(row));
}

function asRows(data: unknown): Record<string, unknown>[] {
	if (!Array.isArray(data)) return [];
	return data.filter(
		(row): row is Record<string, unknown> =>
			row != null && typeof row === 'object' && !Array.isArray(row),
	);
}

async function listActiveSignResults(
	config: NodeSdkConfig,
): Promise<Record<string, unknown>[]> {
	try {
		const path = buildManagementQueryPath('/listSignResults', {
			filter: 'active',
			pagenum: '0',
			pagesize: '0',
		});
		const raw = await managementGet<unknown>(config, path);
		if (!raw.ok) return [];
		const data = mpcAuthEnvelopeData(raw.data) ?? raw.data;
		return asRows(data);
	} catch {
		return [];
	}
}

async function successRequestStillWaiting(
	config: NodeSdkConfig,
	requestId: string,
): Promise<boolean> {
	const result = await mpcGetSignResultById(config, requestId);
	if (!result.ok) return result.reason.toLowerCase().includes('not found');
	const status = rowStatus(result.data);
	if (status === 'executed' || status === 'shelved') return false;
	if (result.data.shelved === true || result.data.Shelved === true) return false;
	return true;
}

/**
 * Look up open sign requests for this key and chain. Returns a warning when one of them
 * holds a nonce below this request, or null when the queue is clear or the lookup fails open.
 */
export async function loadLowerNonceWaitingWarning(
	config: NodeSdkConfig,
	args: {
		currentRequestId: string;
		chainId: string;
		keyGenId: string;
		currentNonces: number[];
	},
): Promise<string | null> {
	const currentRequestId = args.currentRequestId.trim();
	const chainId = args.chainId.trim();
	const keyGenId = args.keyGenId.trim();
	const currentNonces = args.currentNonces.filter(n => Number.isFinite(n) && n >= 0);
	if (!currentRequestId || !chainId || !keyGenId || currentNonces.length === 0) return null;

	try {
		const [live, pending, success, active] = await Promise.all([
			listSignRequests(config, {filter: 'live', pagenum: 0, pagesize: 0}),
			listSignRequests(config, {filter: 'pending', pagenum: 0, pagesize: 0}),
			listSignRequests(config, {filter: 'success', pagenum: 0, pagesize: 0}),
			listActiveSignResults(config),
		]);
		const rows = [live, pending, success].flatMap(listed =>
			listed.ok ? asRows(listed.data.requests) : [],
		);
		const activeIds = new Set(active.map(readSignRequestListRowId).filter(Boolean));
		const seen = new Set<string>();
		const blockers: NonceQueueBlocker[] = [];
		const minCurrent = Math.min(...currentNonces);

		const consider = async (row: Record<string, unknown>, fromActiveResult: boolean) => {
			const requestId = readSignRequestListRowId(row);
			if (!requestId || requestId === currentRequestId || seen.has(requestId)) return;
			if (!sameChain(chainIdOf(row), chainId) || keyGenIdFromRecord(row) !== keyGenId) return;
			if (skipped(row)) return;
			const nonces = noncesOf(row);
			if (nonces.length === 0 || Math.min(...nonces) >= minCurrent) return;
			const status = rowStatus(row);
			if (!fromActiveResult && status === 'success' && !activeIds.has(requestId)) {
				const waiting = await successRequestStillWaiting(config, requestId);
				if (!waiting) return;
			}
			seen.add(requestId);
			blockers.push({requestId, nonces});
		};

		for (const row of rows) await consider(row, false);
		for (const row of active) await consider(row, true);

		return lowerNonceWaitingWarning({currentRequestId, currentNonces, blockers});
	} catch {
		return null;
	}
}
