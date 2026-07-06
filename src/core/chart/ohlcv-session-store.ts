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

const store = new Map<string, BoundOhlcvFetch>();

export function clearOhlcvSession(sessionKey: string): void {
	store.delete(sessionKey);
}

export function getBoundOhlcvFetch(sessionKey: string): BoundOhlcvFetch | undefined {
	return store.get(sessionKey);
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
	'No OHLCV in this request and no bound fetch in this session. Run fetch_ohlcv once, then pass `{ title, ohlcvDigest }` from meta.sessionBind on follow-ups — do not re-paste candle JSON.';

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
		return {ok: true, data: input};
	}

	if (Array.isArray(input.rows) && input.rows.length > 0) {
		return {ok: true, data: input};
	}

	const bound = store.get(sessionKey);
	if (!bound) {
		return {ok: false, reason: SESSION_MISS_REASON};
	}

	const requestedDigest = input.ohlcvDigest?.trim();
	if (requestedDigest && bound.fingerprint?.digest !== requestedDigest) {
		return {ok: false, reason: DIGEST_MISMATCH_REASON};
	}

	if (input.title?.trim() && bound.title && bound.title !== input.title.trim()) {
		return {
			ok: false,
			reason:
				'`title` does not match the bound session fetch. Use the same title as the chart step, or pass matching meta.ohlcvFingerprint.digest via `ohlcvDigest`.',
		};
	}

	return {
		ok: true,
		data: {
			...input,
			toolResult: bound.toolResult,
		},
	};
}
