import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {serializeTransaction} from 'viem';
import {lowerNonceWaitingWarning} from '../dist/core/mpc/lower-nonce-waiting.js';
import {messageRawToCalldata} from '../dist/core/mpc/sign-request-utils.js';

describe('native transfer calldata', () => {
	it('returns 0x for a serialized native transfer instead of the transaction bytes', () => {
		const unsigned = serializeTransaction({
			type: 'eip1559',
			to: '0x0000000000000000000000000000000000000001',
			data: '0x',
			value: 1n,
			gas: 21000n,
			maxFeePerGas: 2n,
			maxPriorityFeePerGas: 1n,
			nonce: 5,
			chainId: 1,
		});
		assert.equal(messageRawToCalldata(unsigned), '0x');
	});

	it('returns contract calldata from a serialized transaction', () => {
		const data = '0xa9059cbb';
		const unsigned = serializeTransaction({
			type: 'eip1559',
			to: '0x0000000000000000000000000000000000000001',
			data,
			value: 0n,
			gas: 50000n,
			maxFeePerGas: 2n,
			maxPriorityFeePerGas: 1n,
			nonce: 5,
			chainId: 1,
		});
		assert.equal(messageRawToCalldata(unsigned), data);
	});
});

describe('lower nonce waiting warning', () => {
	it('names this sign request and the older one', () => {
		assert.equal(
			lowerNonceWaitingWarning({
				currentRequestId: 'SignCurrent',
				currentNonces: [7],
				blockers: [{requestId: 'SignOlder', nonces: [5]}],
			}),
			'SignCurrent (nonce 7) is waiting on SignOlder (nonce 5). This signature is fine, but it will not confirm until SignOlder is executed.',
		);
	});
});
