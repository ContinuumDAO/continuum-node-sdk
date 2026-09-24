import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {NodeSdkConfig} from '../dist/config/schema.js';
import {getDockerUpdateStatus} from '../dist/core/node-info.js';
import {
	DEFAULT_PINNED_GROUPS,
	isToolPinnedAtInit,
	PINNED_TOOL_NAMES,
	TOOL_GROUP_BY_NAME,
} from '../dist/mcp/deferred/tool-group-map.js';

function configWith(fetchImpl: NodeSdkConfig['customFetch']): NodeSdkConfig {
	return {
		node: {
			baseUrl: 'http://127.0.0.1',
			managementPort: 8080,
			mpcConfigPath: '/tmp/continuum-node-sdk-docker-update-status',
		},
		signer: {defaultKey: 'bootstrap', defaultKeyPath: null},
		customFetch: fetchImpl,
	};
}

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: {'content-type': 'application/json'},
	});
}

test('get_docker_update_status is a pinned node_info tool', () => {
	assert.equal(TOOL_GROUP_BY_NAME.get_docker_update_status, 'node_info');
	assert.equal(PINNED_TOOL_NAMES.has('get_docker_update_status'), true);
	assert.equal(
		isToolPinnedAtInit('get_docker_update_status', 'node_info', new Set(DEFAULT_PINNED_GROUPS)),
		true,
	);
});

test('getDockerUpdateStatus returns the update and the running image', async () => {
	const config = configWith(async (url) => {
		const path = new URL(url).pathname;
		if (path === '/maintenance/dockerUpdateStatus') {
			return jsonResponse({
				code: 0,
				data: {
					phase: 'finished',
					ok: false,
					tag: 'v1.5.128',
					attemptId: '42',
					startedAt: '2026-09-24T10:00:00Z',
					finishedAt: '2026-09-24T10:01:00Z',
					message:
						'The mpc-auth image did not update. Docker could not download continuumdao/mpc-auth:v1.5.128. This node is still running the previous image.',
					runningVersion: 'v1.5.127',
					runningVersionDate: '2026-09-23T15:53:08Z',
					imageRepository: 'continuumdao/mpc-auth',
					runningImage: 'continuumdao/mpc-auth:v1.5.127',
				},
			});
		}
		return jsonResponse({code: 1, error: `unexpected ${path}`});
	});
	const result = await getDockerUpdateStatus(config);
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.data.phase, 'finished');
	assert.equal(result.data.ok, false);
	assert.equal(result.data.tag, 'v1.5.128');
	assert.equal(result.data.runningVersion, 'v1.5.127');
	assert.equal(result.data.runningVersionDate, '2026-09-23T15:53:08Z');
	assert.equal(result.data.runningImage, 'continuumdao/mpc-auth:v1.5.127');
	assert.match(result.data.message ?? '', /still running the previous image/);
});

test('getDockerUpdateStatus fills the running version from GET /version', async () => {
	const config = configWith(async (url) => {
		const path = new URL(url).pathname;
		if (path === '/maintenance/dockerUpdateStatus') {
			return jsonResponse({
				code: 0,
				data: {phase: 'idle', ok: true, message: ''},
			});
		}
		if (path === '/version') {
			return jsonResponse({
				code: 0,
				data: {version: 'v1.5.127', versionDate: '2026-09-23T15:53:08Z', cggmp24UpstreamGitRev: 'abc'},
			});
		}
		return jsonResponse({code: 1, error: `unexpected ${path}`});
	});
	const result = await getDockerUpdateStatus(config);
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.data.phase, 'idle');
	assert.equal(result.data.runningVersion, 'v1.5.127');
	assert.equal(result.data.runningVersionDate, '2026-09-23T15:53:08Z');
});
