import assert from 'node:assert/strict';
import test from 'node:test';
import {combineShares, splitSecret} from '../src/core/shamir.ts';

test('shamir quorum reconstructs the secret and one share does not', () => {
	const secret = new TextEncoder().encode('railgun test mnemonic words');
	const shares = splitSecret(secret, 2, 3);
	assert.equal(shares.length, 3);
	assert.equal(combineShares([shares[0]!, shares[2]!]), 'railgun test mnemonic words');
	assert.notEqual(combineShares([shares[0]!, shares[1]!]).length, 0);
	assert.throws(() => combineShares([shares[1]!]));
});
