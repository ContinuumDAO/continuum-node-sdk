/** Roots under user_folder where Foundry dry-run artifacts may appear. */
export const FORGE_DRY_RUN_SCAN_ROOTS = [
	'broadcast',
	'.mcp-foundry-workspace/broadcast',
	'data/artifacts/forge',
] as const;

export type ParsedForgeDryRunPath = {
	chainId?: string;
	scriptName?: string;
};

/** Parse `broadcast/<Script>.s.sol/<chainId>/dry-run/run-latest.json` segments. */
export function parseForgeDryRunPath(path: string): ParsedForgeDryRunPath {
	const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '');
	const match = normalized.match(
		/(?:^|\/)(?:broadcast\/)?([^/]+\.s\.sol)\/(\d+)\/dry-run\/run-latest\.json$/i,
	);
	if (!match) {
		const artifactMatch = normalized.match(
			/^data\/artifacts\/forge\/(\d+)\/([^/]+)\/run-latest\.json$/i,
		);
		if (artifactMatch) {
			return {chainId: artifactMatch[1], scriptName: artifactMatch[2]};
		}
		return {};
	}
	return {chainId: match[2], scriptName: match[1]};
}

export function forgeDryRunArtifactPath(
	chainId: string,
	scriptName: string,
): string {
	const safeScript = scriptName.replace(/[^\w.-]+/g, '_');
	return `data/artifacts/forge/${chainId}/${safeScript}/run-latest.json`;
}

export function forgeDryRunHelperArtifactPath(
	chainId: string,
	scriptName: string,
): string {
	const safeScript = scriptName.replace(/[^\w.-]+/g, '_');
	return `data/artifacts/multisign/forge-dry-run/${chainId}/${safeScript}/helper.json`;
}

export function joinedMultiSignHelperArtifactPath(
	chainId: string,
	firstNonce: number,
): string {
	return `data/artifacts/multisign/joined/${chainId}/helper-n${firstNonce}.json`;
}

export function isForgeDryRunFilePath(path: string): boolean {
	const normalized = path.replace(/\\/g, '/');
	if (!normalized.endsWith('/run-latest.json') && normalized !== 'run-latest.json') {
		return false;
	}
	if (normalized.includes('/dry-run/run-latest.json')) return true;
	return normalized.startsWith('data/artifacts/forge/');
}
