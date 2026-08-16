import {
	buildManagementQueryPath,
	managementGet,
	managementPost,
} from '../../api/management-api.js';
import {
	buildManagementPostRequest,
	managementSign,
	DEFAULT_MANAGEMENT_SIGNING,
	type ManagementSigningMethod,
} from '../management-signer.js';
import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../result.js';

export type UserFolderEntry = {
	name: string;
	type: 'file' | 'dir';
	size: number;
	mtime?: string;
};

export async function listUserFolder(
	config: NodeSdkConfig,
	path = '.',
): Promise<SdkResult<{path: string; entries: UserFolderEntry[]}>> {
	const apiPath = buildManagementQueryPath('/listUserFolder', {
		path: path || '.',
	});
	const result = await managementGet<Record<string, unknown>>(config, apiPath);
	if (!result.ok) return result;

	const data = result.data;
	const entriesRaw = data.entries ?? data.Entries;
	const entries: UserFolderEntry[] = [];
	if (Array.isArray(entriesRaw)) {
		for (const item of entriesRaw) {
			if (!item || typeof item !== 'object') continue;
			const row = item as Record<string, unknown>;
			const name = String(row.name ?? row.Name ?? '').trim();
			if (!name) continue;
			const typeRaw = String(row.type ?? row.Type ?? 'file').toLowerCase();
			entries.push({
				name,
				type: typeRaw === 'dir' ? 'dir' : 'file',
				size: Number(row.size ?? row.Size ?? 0) || 0,
				mtime:
					row.mtime != null || row.Mtime != null
						? String(row.mtime ?? row.Mtime)
						: undefined,
			});
		}
	}

	return {
		ok: true,
		data: {
			path: String(data.path ?? data.Path ?? (path || '.')),
			entries,
		},
	};
}

export async function getUserFolderFile(
	config: NodeSdkConfig,
	path: string,
): Promise<SdkResult<{path: string; content: string; size: number}>> {
	const trimmed = path.trim();
	if (!trimmed) {
		return {ok: false, reason: 'user_folder path is required.'};
	}
	const apiPath = buildManagementQueryPath('/getUserFolderFile', {path: trimmed});
	const result = await managementGet<Record<string, unknown>>(config, apiPath);
	if (!result.ok) return result;

	const data = result.data;
	return {
		ok: true,
		data: {
			path: String(data.path ?? data.Path ?? trimmed),
			content: String(data.content ?? data.Content ?? ''),
			size: Number(data.size ?? data.Size ?? 0) || 0,
		},
	};
}

export async function writeUserFolderFile(
	config: NodeSdkConfig,
	path: string,
	content: string,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<{path: string}>> {
	const trimmed = path.trim();
	if (!trimmed) {
		return {ok: false, reason: 'user_folder path is required.'};
	}

	const built = await buildManagementPostRequest(
		config,
		{
			path: '/writeUserFolderFile',
			buildRequestFields: () => ({path: trimmed, content}),
		},
		signing,
	);
	if (!built.ok) return built;

	const signed = await managementSign(config, signing, built.data.unsignedBody);
	if (!signed.ok) return signed;

	const posted = await managementPost<Record<string, unknown>>(
		config,
		'/writeUserFolderFile',
		signed.data,
	);
	if (!posted.ok) return posted;

	const data = posted.data;
	return {
		ok: true,
		data: {path: String(data.path ?? data.Path ?? trimmed)},
	};
}
