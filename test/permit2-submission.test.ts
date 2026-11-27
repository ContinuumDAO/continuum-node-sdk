import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
	permit2SubmissionPurpose,
	signRequestPurposeText,
} from '../dist/core/mpc/deliver-permit2.js';

describe('permit2 submission', () => {
	it('matches the transaction opened for a Permit2 signature', () => {
		const purpose = permit2SubmissionPurpose('Sign20261127000000000abc');
		assert.equal(purpose, 'Permit2 permit Sign20261127000000000abc');
		const row = {Purpose: {node: purpose}};
		assert.equal(signRequestPurposeText(row).includes(purpose), true);
		assert.equal(signRequestPurposeText({purpose: 'something else'}).includes(purpose), false);
	});
});
