/** Common writable subtrees under user_folder (node UI + agent guidance). */
export const USER_FOLDER_WRITE_ROOTS = [
	'evm/',
	'data/',
	'.mcp-foundry-workspace/',
] as const;

export type UserFolderPathOptions = {
	/** Allow `.` (list root). Default false. */
	allowDot?: boolean;
	/** Writes must include a subdirectory (not a loose root file). Default false. */
	requireSubtree?: boolean;
};

export function normalizeUserFolderPath(raw: string): string {
	let path = raw.trim().replace(/\\/g, '/');
	while (path.startsWith('./')) {
		path = path.slice(2);
	}
	path = path.replace(/^\/+/, '');
	path = path.replace(/\/+/g, '/');
	if (path.length > 1) {
		path = path.replace(/\/+$/, '');
	}
	return path;
}

/** Returns an error message, or null when the path is valid. */
export function userFolderPathError(
	raw: string,
	options: UserFolderPathOptions = {},
): string | null {
	const trimmed = raw.trim();
	if (!trimmed) {
		return 'user_folder path is required.';
	}
	if (trimmed.includes('\0')) {
		return 'user_folder path must not contain null bytes.';
	}
	if (/^[a-zA-Z]:/.test(trimmed) || trimmed.startsWith('~')) {
		return 'user_folder path must be relative to user_folder (no drive letters or ~).';
	}

	const path = normalizeUserFolderPath(trimmed);
	if (!path) {
		return 'user_folder path is required.';
	}

	if (path === '.') {
		return options.allowDot ? null : 'user_folder path must name a file or subdirectory.';
	}

	if (path.includes('..')) {
		return 'user_folder path must not contain .. segments.';
	}

	for (const segment of path.split('/')) {
		if (segment === '..') {
			return 'user_folder path must not contain .. segments.';
		}
	}

	if (options.requireSubtree && !path.includes('/')) {
		return (
			'writes must target a file inside a subdirectory (e.g. evm/src/Contract.sol, ' +
			'data/out.json), not the user_folder root.'
		);
	}

	return null;
}

export function assertUserFolderPath(
	raw: string,
	options: UserFolderPathOptions = {},
): {ok: true; path: string} | {ok: false; reason: string} {
	const error = userFolderPathError(raw, options);
	if (error) {
		return {ok: false, reason: error};
	}
	return {ok: true, path: normalizeUserFolderPath(raw)};
}
