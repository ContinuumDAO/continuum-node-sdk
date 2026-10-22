import assert from 'node:assert/strict';
import test from 'node:test';
import {balancesCarriedIntoScan, balancesSavedFromScan} from '../src/core/railgun-scan-balances.ts';

const copied = [{tokenAddress: '0xusdc', spendable: '997500', pending: '0'}];

test('an unfinished scan does not keep another wallet amount stored on an error record', () => {
	assert.deepEqual(
		balancesCarriedIntoScan({scanStatus: 'error', balances: copied}),
		[],
	);
	assert.deepEqual(
		balancesCarriedIntoScan({scanStatus: 'ready', balances: copied}),
		copied,
	);
	assert.deepEqual(
		balancesSavedFromScan({scanned: [], live: copied, settled: false}),
		[],
	);
	assert.deepEqual(
		balancesSavedFromScan({scanned: copied, live: [], settled: false}),
		copied,
	);
});
