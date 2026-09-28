import {z} from 'zod';
import {
	buildManagementQueryPath,
	managementGet,
	managementPost,
} from '../../api/management-api.js';
import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../result.js';
import {
	buildManagementPostRequest,
	managementSign,
	DEFAULT_MANAGEMENT_SIGNING,
	type ManagementSigningMethod,
} from '../management-signer.js';

export const FORUM_SESSION_API_PATHS = {
	get: '/getForumSession',
	set: '/setForumSession',
	clear: '/clearForumSession',
} as const;

const addressSchema = z
	.string()
	.trim()
	.regex(/^0x[0-9a-fA-F]{40}$/, 'address must be a 20-byte hex ethereum address');

export const GetForumSessionInputSchema = z
	.object({
		address: addressSchema,
	})
	.strict();

export const ClearForumSessionInputSchema = z
	.object({
		address: addressSchema,
	})
	.strict();

export const ForumSessionSchema = z
	.object({
		found: z.boolean(),
		address: z.string().optional(),
		ticket: z.string().optional(),
		username: z.string().optional(),
		uid: z.number().int().optional(),
		updatedAt: z.string().optional(),
	})
	.strict();

export type ForumSession = z.infer<typeof ForumSessionSchema>;

export function parseForumSessionData(raw: unknown): ForumSession | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return null;
	}
	const row = raw as Record<string, unknown>;
	const found = Boolean(row.found ?? row.Found);
	if (!found) {
		const parsed = ForumSessionSchema.safeParse({found: false});
		return parsed.success ? parsed.data : null;
	}
	const uidRaw = row.uid ?? row.UID;
	const uid = typeof uidRaw === 'number' && Number.isFinite(uidRaw) ? uidRaw : undefined;
	const username = String(row.username ?? row.Username ?? '').trim();
	const updatedAt = String(row.updatedAt ?? row.UpdatedAt ?? '').trim();
	const parsed = ForumSessionSchema.safeParse({
		found: true,
		address: String(row.address ?? row.Address ?? ''),
		ticket: String(row.ticket ?? row.Ticket ?? ''),
		...(username ? {username} : {}),
		...(uid !== undefined ? {uid} : {}),
		...(updatedAt ? {updatedAt} : {}),
	});
	if (!parsed.success || !parsed.data.ticket) {
		return null;
	}
	return parsed.data;
}

/** GET /getForumSession — ticket stored on this node for a KeyGen address. */
export async function getForumSession(
	config: NodeSdkConfig,
	address: string,
): Promise<SdkResult<ForumSession>> {
	const parsed = addressSchema.safeParse(address);
	if (!parsed.success) {
		return {ok: false, reason: 'address must be a 20-byte hex ethereum address'};
	}
	const path = buildManagementQueryPath(FORUM_SESSION_API_PATHS.get, {
		address: parsed.data,
	});
	const result = await managementGet<unknown>(config, path);
	if (!result.ok) {
		return result;
	}
	const session = parseForumSessionData(result.data);
	if (!session) {
		return {ok: false, reason: 'Forum session response failed validation.'};
	}
	return {ok: true, data: session};
}

/** POST /clearForumSession — management-signed delete of the stored ticket. */
export async function clearForumSession(
	config: NodeSdkConfig,
	address: string,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<{ok: true}>> {
	const parsed = addressSchema.safeParse(address);
	if (!parsed.success) {
		return {ok: false, reason: 'address must be a 20-byte hex ethereum address'};
	}
	const built = await buildManagementPostRequest(
		config,
		{
			path: FORUM_SESSION_API_PATHS.clear,
			buildRequestFields: () => ({address: parsed.data}),
		},
		signing,
	);
	if (!built.ok) {
		return built;
	}
	const signed = await managementSign(config, signing, built.data.unsignedBody);
	if (!signed.ok) {
		return signed;
	}
	const posted = await managementPost<unknown>(config, built.data.path, signed.data);
	if (!posted.ok) {
		return posted;
	}
	return {ok: true, data: {ok: true}};
}

/** POST /clearForumSession by ticket when Forum sign-out does not include the KeyGen address. */
export async function clearForumSessionByTicket(
	config: NodeSdkConfig,
	ticket: string,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<{ok: true}>> {
	const trimmed = ticket.trim();
	if (!trimmed || trimmed.length > 256) {
		return {ok: false, reason: 'ticket is required'};
	}
	const built = await buildManagementPostRequest(
		config,
		{
			path: FORUM_SESSION_API_PATHS.clear,
			buildRequestFields: () => ({ticket: trimmed}),
		},
		signing,
	);
	if (!built.ok) {
		return built;
	}
	const signed = await managementSign(config, signing, built.data.unsignedBody);
	if (!signed.ok) {
		return signed;
	}
	const posted = await managementPost<unknown>(config, built.data.path, signed.data);
	if (!posted.ok) {
		return posted;
	}
	return {ok: true, data: {ok: true}};
}
