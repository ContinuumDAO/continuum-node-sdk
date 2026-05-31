import {z} from 'zod';
import type {SdkResult} from '../result.js';

/** Backend IDs: `Sign` + 25 lowercase hex chars (timestamp + random suffix). */
const SIGN_REQUEST_ID_RE = /^Sign[a-f0-9]{25}$/i;
const SIGN_REQUEST_SUFFIX_RE = /^[a-f0-9]{25}$/i;

export function normalizeSignRequestId(raw: string): SdkResult<string> {
	const trimmed = raw.trim();
	if (!trimmed) {
		return {ok: false, reason: 'Sign request ID is required.'};
	}
	if (SIGN_REQUEST_ID_RE.test(trimmed)) {
		return {ok: true, data: `Sign${trimmed.slice(4)}`};
	}
	if (SIGN_REQUEST_SUFFIX_RE.test(trimmed)) {
		return {ok: true, data: `Sign${trimmed}`};
	}
	if (/^sign[a-f0-9]+$/i.test(trimmed) && trimmed.length < 29) {
		return {
			ok: false,
			reason: `Sign request ID "${trimmed}" looks truncated. Full IDs look like Sign202605311437369991f054aa2 (Sign + 25 hex characters).`,
		};
	}
	return {
		ok: false,
		reason: `Invalid sign request ID "${trimmed}". Expected form Sign202605311437369991f054aa2 (Sign prefix + 25 hex characters).`,
	};
}

export const SignRequestIdSchema = z
	.string()
	.min(1)
	.transform((val, ctx) => {
		const normalized = normalizeSignRequestId(val);
		if (!normalized.ok) {
			ctx.addIssue({code: 'custom', message: normalized.reason});
			return z.NEVER;
		}
		return normalized.data;
	})
	.describe(
		'Full sign request ID with Sign prefix (e.g. Sign202605311437369991f054aa2). A 25-character hex suffix without Sign is also accepted and normalized automatically.',
	);

export const SignRequestIdOptionalSchema = SignRequestIdSchema.optional();

export function clarifySignRequestLookupError(reason: string): string {
	const lower = reason.toLowerCase();
	if (lower.includes('nil result') || lower.includes('signrequestresult')) {
		return (
			'Sign request or sign result not found on this node. Use the full request ID with the Sign prefix ' +
			'(e.g. Sign202605311437369991f054aa2). If you only have the hex suffix, the SDK accepts it and adds Sign automatically. ' +
			'Confirm the request exists on this node (originator or participant).'
		);
	}
	return reason;
}
