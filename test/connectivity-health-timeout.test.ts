import assert from 'node:assert/strict';
import {test} from 'node:test';
import {connectivityHealthFetchTimeoutMs} from '../src/core/connectivity-health-timeout.ts';

test('connectivityHealthFetchTimeoutMs stays above the node ping budget', () => {
	assert.equal(connectivityHealthFetchTimeoutMs(), 30_000);
	assert.equal(connectivityHealthFetchTimeoutMs(5), 30_000);
	assert.equal(connectivityHealthFetchTimeoutMs(10), 30_000);
	assert.equal(connectivityHealthFetchTimeoutMs(20), 35_000);
	assert.equal(connectivityHealthFetchTimeoutMs(200), 120_000);
});
