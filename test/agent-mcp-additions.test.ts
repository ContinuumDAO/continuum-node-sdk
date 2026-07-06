import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {buildRemoveEnvironmentVariable} from '../dist/core/agent/environment-variables.js';
import {buildSetMcpServerFlags} from '../dist/core/agent/mcp-servers.js';
import {
	GetConfiguredNodeKeysDataSchema,
	RemoveEnvironmentVariableInputSchema,
	SetMcpServerFlagsInputSchema,
} from '../dist/schemas/extended.js';
import type {NodeSdkConfig} from '../dist/config/schema.js';

const fixturesRoot = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'fixtures/mpc-config',
);

function makeConfig(): NodeSdkConfig {
	return {
		node: {
			baseUrl: 'http://127.0.0.1',
			managementPort: 3000,
			mpcConfigPath: fixturesRoot,
		},
		signer: {
			defaultKey: 'bootstrap',
			defaultKeyPath: null,
		},
	};
}

test('RemoveEnvironmentVariableInputSchema rejects invalid names', () => {
	const bad = RemoveEnvironmentVariableInputSchema.safeParse({name: '1BAD'});
	assert.equal(bad.success, false);
	const ok = RemoveEnvironmentVariableInputSchema.safeParse({name: 'UNISWAP_API_KEY'});
	assert.equal(ok.success, true);
});

test('buildRemoveEnvironmentVariable rejects invalid variable names', async () => {
	const built = await buildRemoveEnvironmentVariable(makeConfig(), {
		name: 'bad-name',
	});
	assert.equal(built.ok, false);
	if (built.ok) return;
	assert.match(built.reason, /Invalid remove environment variable/i);
});

test('SetMcpServerFlagsInputSchema requires at least one flag', () => {
	const none = SetMcpServerFlagsInputSchema.safeParse({id: 'coinmarketcap-public'});
	assert.equal(none.success, false);
	const ok = SetMcpServerFlagsInputSchema.safeParse({
		id: 'coinmarketcap-public',
		initialLoad: true,
	});
	assert.equal(ok.success, true);
});

test('buildSetMcpServerFlags rejects invalid server id', async () => {
	const built = await buildSetMcpServerFlags(makeConfig(), {
		id: 'INVALID ID',
		initialLoad: true,
	});
	assert.equal(built.ok, false);
});

test('GetConfiguredNodeKeysDataSchema validates peer list shape', () => {
	const parsed = GetConfiguredNodeKeysDataSchema.safeParse({
		nodes: [
			{
				address: '192.168.1.10',
				available: true,
				publicKey: 'abc123',
			},
		],
		total: 1,
		available: 1,
		unavailable: 0,
	});
	assert.equal(parsed.success, true);
});
