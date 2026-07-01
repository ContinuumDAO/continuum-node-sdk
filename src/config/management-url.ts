/** Browser-safe management API base URL (no node:path / node:os). */
export function buildManagementBaseUrl(
	baseUrl: string,
	managementPort: number,
): string {
	const trimmed = baseUrl.replace(/\/+$/, '');
	return `${trimmed}:${managementPort}`;
}
