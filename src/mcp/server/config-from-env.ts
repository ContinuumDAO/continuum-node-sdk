import {parseNodeSdkConfig, type NodeSdkConfig} from '../../config/schema.js';

/** mpc-config / continuum-mcp-server: keys bind-mounted under /app (added_keys/, bootstrap_key/). */
export const CONTINUUM_MCP_APP_ROOT = '/app';

/** Build NodeSdkConfig for continuum-mcp-server (Docker WORKDIR /app). */
export function nodeSdkConfigFromEnv(): NodeSdkConfig {
	process.env['HOME'] = CONTINUUM_MCP_APP_ROOT;

	const authHost = (process.env['MPC_AUTH_URL'] ?? 'http://app').replace(
		/\/+$/,
		'',
	);
	const managementPort = Number(process.env['MPC_AUTH_PORT'] ?? '8080');
	if (
		!Number.isInteger(managementPort) ||
		managementPort <= 0 ||
		managementPort > 65_535
	) {
		throw new Error(
			`Invalid MPC_AUTH_PORT: ${String(process.env['MPC_AUTH_PORT'])}`,
		);
	}

	const baseUrl = /^https?:\/\//i.test(authHost)
		? authHost
		: `http://${authHost}`;

	return parseNodeSdkConfig({
		node: {
			baseUrl,
			managementPort,
			mpcConfigPath: CONTINUUM_MCP_APP_ROOT,
		},
		signer: {
			defaultKey: process.env['MCP_DEFAULT_SIGNER_KEY']?.trim() || 'bootstrap',
			defaultKeyPath: process.env['MCP_DEFAULT_SIGNER_KEY_PATH']?.trim() ?? null,
		},
	});
}
