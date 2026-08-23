import type {NodeSdkConfig} from '../../config/schema.js';
import type {z} from 'zod';
import type {SdkResult} from '../result.js';
import {ensureMaintenanceQuiescence} from './maintenance-quiescence.js';
import {
	NODE_DATABASE_API_PATHS,
	FetchBootstrapKeyOutputSchema,
	PostBootstrapKeyOutputSchema,
	RemoveBootstrapKeyOutputSchema,
	FetchAddedManagementKeyOutputSchema,
	PostAddedManagementKeyOutputSchema,
	RemoveAddedManagementKeyOutputSchema,
	type FetchAddedManagementKeyInput,
	type FetchBootstrapKeyInput,
	type PostAddedManagementKeyInput,
	type PostBootstrapKeyInput,
	type RemoveAddedManagementKeyInput,
} from './schemas.js';
import {postSignedManagementRequest} from './signed-post.js';
import {
	sensitiveExportTransportAllowed,
	sensitiveExportTransportError,
} from './transport.js';

function pickString(row: Record<string, unknown>, ...keys: string[]): string {
	for (const key of keys) {
		const value = row[key];
		if (typeof value === 'string' && value.trim()) {
			return value.trim();
		}
	}
	return '';
}

function pickBool(row: Record<string, unknown>, ...keys: string[]): boolean {
	for (const key of keys) {
		if (key in row) return Boolean(row[key]);
	}
	return false;
}

function pickNumber(row: Record<string, unknown>, ...keys: string[]): number | undefined {
	for (const key of keys) {
		const value = row[key];
		if (typeof value === 'number' && Number.isFinite(value)) {
			return value;
		}
	}
	return undefined;
}

export async function fetchBootstrapKey(
	config: NodeSdkConfig,
	input: FetchBootstrapKeyInput = {},
): Promise<SdkResult<z.infer<typeof FetchBootstrapKeyOutputSchema>>> {
	if (!sensitiveExportTransportAllowed(config)) {
		return {ok: false, reason: sensitiveExportTransportError()};
	}
	const quiescence = await ensureMaintenanceQuiescence(config, input);
	if (!quiescence.ok) return quiescence;

	const posted = await postSignedManagementRequest(
		config,
		NODE_DATABASE_API_PATHS.fetchBootstrapKey,
		() => ({}),
	);
	if (!posted.ok) return posted;

	const row = posted.data.data;
	const seed = pickString(row, 'ed25519PrivateSeedHex', 'Ed25519PrivateSeedHex').replace(/^0x/i, '');
	const output = {
		publicMgtKey: pickString(row, 'publicMgtKey', 'PublicMgtKey'),
		ed25519PrivateSeedHex: seed.toLowerCase(),
		format: pickString(row, 'format', 'Format') || undefined,
	};
	const parsed = FetchBootstrapKeyOutputSchema.safeParse(output);
	if (!parsed.success) {
		return {ok: false, reason: 'fetchBootstrapKey response failed validation.'};
	}
	return {ok: true, data: parsed.data};
}

export async function postBootstrapKey(
	config: NodeSdkConfig,
	input: PostBootstrapKeyInput,
): Promise<SdkResult<z.infer<typeof PostBootstrapKeyOutputSchema>>> {
	const posted = await postSignedManagementRequest(
		config,
		NODE_DATABASE_API_PATHS.postBootstrapKey,
		() => ({
			ed25519PrivateSeedHex: input.ed25519PrivateSeedHex.trim().replace(/^0x/i, '').toLowerCase(),
		}),
	);
	if (!posted.ok) return posted;

	const row = posted.data.data;
	const output = {
		path: pickString(row, 'path', 'Path'),
		wrote: pickBool(row, 'wrote', 'Wrote'),
		alreadyPresent: pickBool(row, 'alreadyPresent', 'AlreadyPresent'),
		message: pickString(row, 'message', 'Message') || undefined,
		restartRequiredForMpc:
			pickBool(row, 'restartRequiredForMpc', 'RestartRequiredForMpc') || undefined,
	};
	const parsed = PostBootstrapKeyOutputSchema.safeParse(output);
	if (!parsed.success || !parsed.data.path) {
		return {ok: false, reason: 'postBootstrapKey response failed validation.'};
	}
	return {ok: true, data: parsed.data};
}

export async function removeBootstrapKey(
	config: NodeSdkConfig,
): Promise<SdkResult<z.infer<typeof RemoveBootstrapKeyOutputSchema>>> {
	const posted = await postSignedManagementRequest(
		config,
		NODE_DATABASE_API_PATHS.removeBootstrapKey,
		() => ({}),
	);
	if (!posted.ok) return posted;

	const row = posted.data.data;
	const output = {
		path: pickString(row, 'path', 'Path'),
		removed: pickBool(row, 'removed', 'Removed'),
		message: pickString(row, 'message', 'Message') || undefined,
	};
	const parsed = RemoveBootstrapKeyOutputSchema.safeParse(output);
	if (!parsed.success || !parsed.data.path) {
		return {ok: false, reason: 'removeBootstrapKey response failed validation.'};
	}
	return {ok: true, data: parsed.data};
}

export async function fetchAddedManagementKey(
	config: NodeSdkConfig,
	input: FetchAddedManagementKeyInput,
): Promise<SdkResult<z.infer<typeof FetchAddedManagementKeyOutputSchema>>> {
	if (!sensitiveExportTransportAllowed(config)) {
		return {ok: false, reason: sensitiveExportTransportError()};
	}
	const quiescence = await ensureMaintenanceQuiescence(config, input);
	if (!quiescence.ok) return quiescence;

	const pub = input.publicKeyHex.trim().replace(/^0x/i, '').toLowerCase();
	const posted = await postSignedManagementRequest(
		config,
		NODE_DATABASE_API_PATHS.fetchAddedManagementKey,
		() => ({publicKeyHex: pub}),
	);
	if (!posted.ok) return posted;

	const row = posted.data.data;
	const seed = pickString(row, 'ed25519PrivateSeedHex', 'Ed25519PrivateSeedHex').replace(/^0x/i, '');
	const output = {
		publicKeyHex: pickString(row, 'publicKeyHex', 'PublicKeyHex') || pub,
		slotN: pickNumber(row, 'slotN', 'SlotN') ?? 0,
		privateKeyPem: pickString(row, 'privateKeyPem', 'PrivateKeyPem'),
		ed25519PrivateSeedHex: seed.toLowerCase(),
		format: pickString(row, 'format', 'Format') || undefined,
		path: pickString(row, 'path', 'Path') || undefined,
	};
	const parsed = FetchAddedManagementKeyOutputSchema.safeParse(output);
	if (!parsed.success || !parsed.data.privateKeyPem) {
		return {ok: false, reason: 'fetchAddedManagementKey response failed validation.'};
	}
	return {ok: true, data: parsed.data};
}

export async function postAddedManagementKey(
	config: NodeSdkConfig,
	input: PostAddedManagementKeyInput,
): Promise<SdkResult<z.infer<typeof PostAddedManagementKeyOutputSchema>>> {
	const pub = input.publicKeyHex.trim().replace(/^0x/i, '').toLowerCase();
	const posted = await postSignedManagementRequest(
		config,
		NODE_DATABASE_API_PATHS.postAddedManagementKey,
		() => {
			const body: Record<string, unknown> = {publicKeyHex: pub};
			if (input.privateKeyPem) body.privateKeyPem = input.privateKeyPem;
			if (input.ed25519PrivateSeedHex) {
				body.ed25519PrivateSeedHex = input.ed25519PrivateSeedHex
					.trim()
					.replace(/^0x/i, '')
					.toLowerCase();
			}
			return body;
		},
	);
	if (!posted.ok) return posted;

	const row = posted.data.data;
	const output = {
		path: pickString(row, 'path', 'Path'),
		wrote: pickBool(row, 'wrote', 'Wrote'),
		alreadyPresent: pickBool(row, 'alreadyPresent', 'AlreadyPresent'),
		message: pickString(row, 'message', 'Message') || undefined,
		publicKeyHex: pickString(row, 'publicKeyHex', 'PublicKeyHex') || pub,
		slotN: pickNumber(row, 'slotN', 'SlotN'),
	};
	const parsed = PostAddedManagementKeyOutputSchema.safeParse(output);
	if (!parsed.success || !parsed.data.path) {
		return {ok: false, reason: 'postAddedManagementKey response failed validation.'};
	}
	return {ok: true, data: parsed.data};
}

export async function removeAddedManagementKey(
	config: NodeSdkConfig,
	input: RemoveAddedManagementKeyInput,
): Promise<SdkResult<z.infer<typeof RemoveAddedManagementKeyOutputSchema>>> {
	const pub = input.publicKeyHex.trim().replace(/^0x/i, '').toLowerCase();
	const posted = await postSignedManagementRequest(
		config,
		NODE_DATABASE_API_PATHS.removeAddedManagementKey,
		() => ({publicKeyHex: pub}),
	);
	if (!posted.ok) return posted;

	const row = posted.data.data;
	const output = {
		path: pickString(row, 'path', 'Path'),
		removed: pickBool(row, 'removed', 'Removed'),
		message: pickString(row, 'message', 'Message') || undefined,
		publicKeyHex: pickString(row, 'publicKeyHex', 'PublicKeyHex') || pub,
		slotN: pickNumber(row, 'slotN', 'SlotN'),
	};
	const parsed = RemoveAddedManagementKeyOutputSchema.safeParse(output);
	if (!parsed.success || !parsed.data.path) {
		return {ok: false, reason: 'removeAddedManagementKey response failed validation.'};
	}
	return {ok: true, data: parsed.data};
}
