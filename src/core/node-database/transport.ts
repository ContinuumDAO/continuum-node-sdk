import {buildManagementUrl} from '../../api/management-api.js';
import type {NodeSdkConfig} from '../../config/schema.js';

/** fetchBootstrapKey / fetchDatabaseBackup require TLS or loopback management URL. */
export function sensitiveExportTransportAllowed(config: NodeSdkConfig): boolean {
	const url = buildManagementUrl(config, '/').replace(/\/$/, '');
	try {
		const parsed = new URL(url);
		if (parsed.protocol === 'https:') {
			return true;
		}
		const host = parsed.hostname.toLowerCase();
		return host === '127.0.0.1' || host === 'localhost' || host === '::1';
	} catch {
		return false;
	}
}

export function sensitiveExportTransportError(): string {
	return 'This route requires HTTPS or a loopback management URL (127.0.0.1 / localhost / ::1).';
}
