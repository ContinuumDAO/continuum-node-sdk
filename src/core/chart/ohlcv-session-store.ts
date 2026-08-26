import type {SdkResult} from '../result.js';
import {extractOhlcvBarsFromUnknown} from './fetch-result.js';
import {buildOhlcvFingerprint, type OhlcvFingerprint} from './ohlcv-integrity.js';
import {invalidStringToolResultReason, isUnparsedJsonString} from './ohlcv-window.js';

export type BoundOhlcvFetch = {
	toolResult: unknown;
	fingerprint: OhlcvFingerprint | null;
	title?: string;
	boundAt: number;
};

export type OhlcvSessionResolveInput = {
	toolResult?: unknown;
	rows?: unknown;
	title?: string;
	ohlcvDigest?: string;
	allowRowsOnly?: boolean;
};

export type OhlcvSessionBindHint = {
	ohlcvDigest: string;
	title?: string;
	reuseInput: {title?: string; ohlcvDigest: string};
};

/** Per-request / ALS session key → latest bind (legacy within a single HTTP request). */
const store = new Map<string, BoundOhlcvFetch>();
/**
 * Explicit durable handle: ohlcvDigest → bound fetch.
 * Cross-request chart/analyze flows use `{ title, ohlcvDigest }` from meta.sessionBind —
 * not transport session ids (MCP 2026-07-28 has no Mcp-Session-Id).
 */
const digestStore = new Map<string, BoundOhlcvFetch>();

const DIGEST_HANDLE_TTL_MS = 30 * 60 * 1000;
const DIGEST_HANDLE_MAX = 64;

function pruneDigestStore(now = Date.now()): void {
	for (const [digest, bound] of digestStore) {
		if (now - bound.boundAt > DIGEST_HANDLE_TTL_MS) {
			digestStore.delete(digest);
		}
	}
	if (digestStore.size <= DIGEST_HANDLE_MAX) {
		return;
	}
	const ordered = [...digestStore.entries()].sort((a, b) => a[1].boundAt - b[1].boundAt);
	const drop = ordered.length - DIGEST_HANDLE_MAX;
	for (let i = 0; i < drop; i++) {
		digestStore.delete(ordered[i]![0]);
	}
}

export function clearOhlcvSession(sessionKey: string): void {
	// Session key is ephemeral per HTTP request; digest handles outlive it.
	store.delete(sessionKey);
}

export function clearOhlcvDigestHandle(ohlcvDigest: string): void {
	const d = ohlcvDigest.trim();
	if (d) {
		digestStore.delete(d);
	}
}

export function getBoundOhlcvFetch(sessionKey: string): BoundOhlcvFetch | undefined {
	return store.get(sessionKey);
}

export function getBoundOhlcvFetchByDigest(ohlcvDigest: string): BoundOhlcvFetch | undefined {
	const d = ohlcvDigest.trim();
	if (!d) {
		return undefined;
	}
	pruneDigestStore();
	return digestStore.get(d);
}

function fingerprintFromToolResult(toolResult: unknown): OhlcvFingerprint | null {
	const bars = extractOhlcvBarsFromUnknown(toolResult, {maxPoints: 10_000});
	if (!bars?.length) {
		return null;
	}
	return buildOhlcvFingerprint(bars as Record<string, unknown>[]);
}

/** Store the latest OHLCV fetch for a session (fetch, chart, or analyze with full toolResult). */
export function bindOhlcvSessionFetch(
	sessionKey: string,
	toolResult: unknown,
	options: {title?: string; fingerprint?: OhlcvFingerprint | null} = {},
): BoundOhlcvFetch | null {
	if (toolResult == null || typeof toolResult !== 'object') {
		return null;
	}
	const fingerprint =
		options.fingerprint ?? fingerprintFromToolResult(toolResult);
	const bound: BoundOhlcvFetch = {
		toolResult,
		fingerprint,
		...(options.title?.trim() ? {title: options.title.trim()} : {}),
		boundAt: Date.now(),
	};
	store.set(sessionKey, bound);
	const digest = fingerprint?.digest?.trim();
	if (digest) {
		pruneDigestStore(bound.boundAt);
		digestStore.set(digest, bound);
	}
	return bound;
}

export function buildOhlcvSessionBindHint(
	bound: BoundOhlcvFetch,
): OhlcvSessionBindHint | undefined {
	const digest = bound.fingerprint?.digest;
	if (!digest) {
		return undefined;
	}
	return {
		ohlcvDigest: digest,
		...(bound.title ? {title: bound.title} : {}),
		reuseInput: {
			...(bound.title ? {title: bound.title} : {}),
			ohlcvDigest: digest,
		},
	};
}

const DIGEST_MISMATCH_REASON =
	'`ohlcvDigest` does not match the bound session fetch. Pass the digest from the prior chart/analyze meta.sessionBind, or pass the full fetch object once after re-fetching.';

const SESSION_MISS_REASON =
	'No OHLCV in this request and no bound fetch for the given ohlcvDigest (or session). Run fetch_ohlcv once, then pass `{ title, ohlcvDigest }` from meta.sessionBind on follow-ups — do not re-paste candle JSON.';

const ohlcvTitleLookbackSuffixRe =
	/\s*[—–-]\s*last\s+\d+\s*(?:d|days?|h|hours?|w|weeks?)\s*$/iu;
const ohlcvTitleIntervalRe = /^\d+[mhdw]$/i;

/** Strip venue suffixes and lookback so "ETH-PERP 4H — last 30d" matches bound "ETH 4H". */
export function normalizeOhlcvSessionTitle(title: string): string {
	let s = title.trim().replace(/\s*\([^)]*\)\s*$/u, '').trim();
	s = s.replace(ohlcvTitleLookbackSuffixRe, '').trim();
	return s.replace(/\s+/g, ' ');
}

function ohlcvSessionTitleSymbol(token: string): string {
	return token
		.toLowerCase()
		.replace(/[-_/]/g, '')
		.replace(/(?:perpetual|perp|usdc|usdt|usd)$/u, '');
}

function ohlcvSessionTitleCore(title: string): {symbol: string; interval: string} {
	const tokens = normalizeOhlcvSessionTitle(title).toLowerCase().split(/\s+/).filter(Boolean);
	const symbol = tokens[0] ? ohlcvSessionTitleSymbol(tokens[0]) : '';
	const interval = tokens.find(t => ohlcvTitleIntervalRe.test(t)) ?? '';
	return {symbol, interval};
}

export function ohlcvSessionTitlesCompatible(requested?: string, bound?: string): boolean {
	const req = requested?.trim();
	const bnd = bound?.trim();
	if (!req || !bnd) {
		return true;
	}
	if (req === bnd) {
		return true;
	}
	const reqNorm = normalizeOhlcvSessionTitle(req).toLowerCase();
	const bndNorm = normalizeOhlcvSessionTitle(bnd).toLowerCase();
	if (reqNorm === bndNorm || bndNorm.startsWith(reqNorm) || reqNorm.startsWith(bndNorm)) {
		return true;
	}
	const a = ohlcvSessionTitleCore(req);
	const b = ohlcvSessionTitleCore(bnd);
	if (!a.symbol || !b.symbol || a.symbol !== b.symbol) {
		return false;
	}
	return !a.interval || !b.interval || a.interval === b.interval;
}

/** Resolve MCP input: inject bound toolResult from session when only title/digest provided. */
export function resolveOhlcvSessionInput(
	sessionKey: string,
	input: OhlcvSessionResolveInput,
): SdkResult<OhlcvSessionResolveInput & {toolResult?: unknown}> {
	if (input.toolResult != null) {
		if (typeof input.toolResult === 'string') {
			if (isUnparsedJsonString(input.toolResult)) {
				return {ok: false, reason: invalidStringToolResultReason()};
			}
			return {
				ok: false,
				reason:
					'`toolResult` must be the fetch JSON object, not a string. On follow-ups pass `{ title, ohlcvDigest }` from meta.sessionBind instead of re-pasting fetch JSON.',
			};
		}
		const {ohlcvDigest: _unusedDigest, ...rest} = input;
		return {ok: true, data: rest};
	}

	if (Array.isArray(input.rows) && input.rows.length > 0) {
		const {ohlcvDigest: _unusedDigest, ...rest} = input;
		return {ok: true, data: rest};
	}

	const requestedDigest = input.ohlcvDigest?.trim();
	let bound = store.get(sessionKey);
	// Prefer explicit digest handle across HTTP requests (ephemeral ALS session keys).
	if (requestedDigest) {
		pruneDigestStore();
		const byDigest = digestStore.get(requestedDigest);
		if (byDigest) {
			bound = byDigest;
		} else if (bound && bound.fingerprint?.digest !== requestedDigest) {
			return {ok: false, reason: DIGEST_MISMATCH_REASON};
		}
	}
	if (!bound) {
		return {ok: false, reason: SESSION_MISS_REASON};
	}

	const digestMatched = Boolean(
		requestedDigest &&
			(bound.fingerprint?.digest === requestedDigest || digestStore.has(requestedDigest)),
	);
	// Digest is the durable identity. Title is a display label (ETH vs ETH-PERP, lookback suffix).
	if (
		!digestMatched &&
		input.title?.trim() &&
		bound.title &&
		!ohlcvSessionTitlesCompatible(input.title, bound.title)
	) {
		return {
			ok: false,
			reason:
				'`title` does not match the bound session fetch. Use the same title as the chart step, or pass matching meta.ohlcvFingerprint.digest via `ohlcvDigest`.',
		};
	}

	// Drop ohlcvDigest once toolResult is injected — several analyze_* Zod schemas are
	// .strict() and historically omitted the digest field (Unrecognized key: ohlcvDigest).
	const {ohlcvDigest: _resolvedDigest, ...rest} = input;
	return {
		ok: true,
		data: {
			...rest,
			...(bound.title ? {title: bound.title} : {}),
			toolResult: bound.toolResult,
		},
	};
}
