import path from 'node:path';
import {expandHome} from '../../config/paths.js';
import {parseNodeSdkConfig, type NodeSdkConfig} from '../../config/schema.js';

/** Resolve KEY_ROOT / MPA_PATH for Docker (compose sets KEY_ROOT=/app/.mpa). */
function resolveKeyRoot(): string {
	const raw =
		process.env['KEY_ROOT']?.trim() ||
		process.env['MPA_PATH']?.trim() ||
		'~/.mpa';
	if (raw === '~') {
		return path.join(expandHome('~'), '.mpa');
	}
	const tildePrefix = raw.startsWith('~/') || raw.startsWith('~\\');
	if (tildePrefix) {
		let rest = raw.slice(2).replace(/^[\\/]+/, '');
		if (!rest) {
			return path.join(expandHome('~'), '.mpa');
		}
		return path.join(expandHome('~'), rest);
	}
	return path.resolve(raw);
}

/** Build NodeSdkConfig from container / process env (mpc-config compose defaults). */
export function nodeSdkConfigFromEnv(): NodeSdkConfig {
	const keyRoot = resolveKeyRoot();
	// SDK management key discovery uses $HOME/.mpa/management_keys
	if (process.env['KEY_ROOT']?.trim()) {
		const home = path.dirname(keyRoot.replace(/[/\\]+$/, ''));
		if (home.length > 0) {
			process.env['HOME'] = home;
		}
		process.env['MPA_PATH'] = keyRoot;
	}

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
			mpcConfigPath: keyRoot,
		},
		signer: {
			defaultKey: process.env['MCP_DEFAULT_SIGNER_KEY']?.trim() || 'preferred',
			defaultKeyPath: process.env['MCP_DEFAULT_SIGNER_KEY_PATH']?.trim() ?? null,
		},
	});
}
