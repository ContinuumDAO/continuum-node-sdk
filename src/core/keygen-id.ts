import {z} from 'zod';
import type {SdkResult} from './result.js';

/** Backend IDs: `KeyGen` + 25 hex chars (timestamp + random suffix). */
const KEYGEN_ID_RE = /^KeyGen[a-f0-9]{25}$/i;
const KEYGEN_SUFFIX_RE = /^[a-f0-9]{25}$/i;

export function normalizeKeyGenRequestId(raw: string): SdkResult<string> {
	const trimmed = raw.trim();
	if (!trimmed) {
		return {ok: false, reason: 'KeyGen request ID is required.'};
	}
	if (KEYGEN_ID_RE.test(trimmed)) {
		return {ok: true, data: `KeyGen${trimmed.slice(6)}`};
	}
	if (KEYGEN_SUFFIX_RE.test(trimmed)) {
		return {ok: true, data: `KeyGen${trimmed}`};
	}
	if (/^keygen[a-f0-9]+$/i.test(trimmed) && trimmed.length < 31) {
		return {
			ok: false,
			reason: `KeyGen request ID "${trimmed}" looks truncated. Full IDs look like KeyGen20260523150955999f20926c7 (KeyGen + 25 hex characters).`,
		};
	}
	return {
		ok: false,
		reason: `Invalid KeyGen request ID "${trimmed}". Expected form KeyGen20260523150955999f20926c7 (KeyGen prefix + 25 hex characters).`,
	};
}

export const KeyGenIdSchema = z
	.string()
	.min(1)
	.transform((val, ctx) => {
		const normalized = normalizeKeyGenRequestId(val);
		if (!normalized.ok) {
			ctx.addIssue({code: 'custom', message: normalized.reason});
			return z.NEVER;
		}
		return normalized.data;
	})
	.describe(
		'Full KeyGen request ID with KeyGen prefix (e.g. KeyGen20260523150955999f20926c7). A 25-character hex suffix without KeyGen is also accepted and normalized automatically.',
	);

export const KeyGenIdOptionalSchema = KeyGenIdSchema.optional();

export function clarifyKeyGenLookupError(reason: string): string {
	const lower = reason.toLowerCase();
	if (lower.includes('nil result') || lower.includes('keygen')) {
		return (
			'KeyGen request or result not found on this node. Use the full request ID with the KeyGen prefix ' +
			'(e.g. KeyGen20260523150955999f20926c7). If you only have the hex suffix, the SDK accepts it and adds KeyGen automatically.'
		);
	}
	return reason;
}
