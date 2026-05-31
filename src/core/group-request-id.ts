import {z} from 'zod';
import type {SdkResult} from './result.js';

/** Backend IDs: `NewGroup` + 25 hex chars (timestamp + random suffix). */
const GROUP_REQUEST_ID_RE = /^NewGroup[a-f0-9]{25}$/i;
const GROUP_REQUEST_SUFFIX_RE = /^[a-f0-9]{25}$/i;

export function normalizeGroupRequestId(raw: string): SdkResult<string> {
	const trimmed = raw.trim();
	if (!trimmed) {
		return {ok: false, reason: 'Group request ID is required.'};
	}
	if (GROUP_REQUEST_ID_RE.test(trimmed)) {
		return {ok: true, data: `NewGroup${trimmed.slice(8)}`};
	}
	if (GROUP_REQUEST_SUFFIX_RE.test(trimmed)) {
		return {ok: true, data: `NewGroup${trimmed}`};
	}
	if (/^newgroup[a-f0-9]+$/i.test(trimmed) && trimmed.length < 33) {
		return {
			ok: false,
			reason: `Group request ID "${trimmed}" looks truncated. Full IDs look like NewGroup202603271129339998910db0b (NewGroup + 25 hex characters).`,
		};
	}
	return {
		ok: false,
		reason: `Invalid group request ID "${trimmed}". Expected form NewGroup202603271129339998910db0b (NewGroup prefix + 25 hex characters).`,
	};
}

export const GroupRequestIdSchema = z
	.string()
	.min(1)
	.transform((val, ctx) => {
		const normalized = normalizeGroupRequestId(val);
		if (!normalized.ok) {
			ctx.addIssue({code: 'custom', message: normalized.reason});
			return z.NEVER;
		}
		return normalized.data;
	})
	.describe(
		'Full group request ID with NewGroup prefix (e.g. NewGroup202603271129339998910db0b). A 25-character hex suffix without NewGroup is also accepted and normalized automatically.',
	);

export const GroupRequestIdOptionalSchema = GroupRequestIdSchema.optional();

export function clarifyGroupRequestLookupError(reason: string): string {
	const lower = reason.toLowerCase();
	if (lower.includes('nil result') || lower.includes('newgroup')) {
		return (
			'Group request not found on this node. Use the full request ID with the NewGroup prefix ' +
			'(e.g. NewGroup202603271129339998910db0b). If you only have the hex suffix, the SDK accepts it and adds NewGroup automatically.'
		);
	}
	return reason;
}
