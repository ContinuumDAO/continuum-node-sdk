import assert from 'node:assert/strict';
import test from 'node:test';
import {existingRailgunKeyGenAddress} from '../src/core/railgun-address.ts';

test('a saved 0zk address stays even when the stored quorum is below 2', () => {
	assert.equal(
		existingRailgunKeyGenAddress({
			walletConfigured: true,
			railgunAddress: '  0zk1qy-saved  ',
		}),
		'0zk1qy-saved',
	);
	assert.equal(
		existingRailgunKeyGenAddress({walletConfigured: false, railgunAddress: '0zk1qy-saved'}),
		'',
	);
	assert.equal(
		existingRailgunKeyGenAddress({walletConfigured: true, railgunAddress: '   '}),
		'',
	);
});
