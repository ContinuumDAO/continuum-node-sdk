import type {NodeSdkConfig} from '../../config/schema.js';
import {getMaintenanceRestartGate} from '../node-config.js';
import type {SdkResult} from '../result.js';
import {NODE_DATABASE_API_PATHS} from './schemas.js';
import {postSignedManagementRequest} from './signed-post.js';

export const DATABASE_BACKUP_GATE_POLL_MS = 1500;
export const DATABASE_BACKUP_GATE_MAX_MS = 5 * 60 * 1000;

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export async function requestMaintenanceRestartPrep(
	config: NodeSdkConfig,
): Promise<SdkResult<{ok: true}>> {
	const posted = await postSignedManagementRequest(
		config,
		NODE_DATABASE_API_PATHS.requestRestartPrep,
		() => ({}),
	);
	if (!posted.ok) return posted;
	return {ok: true, data: {ok: true}};
}

export async function pollMaintenanceRestartGateUntilReady(
	config: NodeSdkConfig,
): Promise<SdkResult<{ok: true}>> {
	const deadline = Date.now() + DATABASE_BACKUP_GATE_MAX_MS;
	while (Date.now() < deadline) {
		const gate = await getMaintenanceRestartGate(config);
		if (!gate.ok) return gate;
		if (gate.data.readyForProcessExit) {
			return {ok: true, data: {ok: true}};
		}
		await sleep(DATABASE_BACKUP_GATE_POLL_MS);
	}
	return {
		ok: false,
		reason:
			'Timed out waiting for maintenance restart gate (readyForProcessExit). Try again when the node is quiet.',
	};
}

export async function ensureMaintenanceQuiescence(
	config: NodeSdkConfig,
	options: {skipQuiescence?: boolean; requestRestartPrep?: boolean} = {},
): Promise<SdkResult<{ok: true}>> {
	if (options.skipQuiescence) {
		return {ok: true, data: {ok: true}};
	}
	if (options.requestRestartPrep !== false) {
		const prep = await requestMaintenanceRestartPrep(config);
		if (!prep.ok) return prep;
	}
	return pollMaintenanceRestartGateUntilReady(config);
}
