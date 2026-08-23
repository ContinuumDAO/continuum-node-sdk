import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
	EIP712_SIGN_REQUEST_KIND,
	getEip712Delivery,
	getEip712LegsFromDetail,
	getEip712MessageHashesFromDetail,
	isEip712BodyForSign,
} from '../dist/core/mpc/eip712-sign-request.js';

describe('eip712 array envelope', () => {
	it('reads extraJSON.eip712[] and per-leg delivery', () => {
		const detail = {
			msgHash: 'aa'.repeat(32),
			messageHashes: ['aa'.repeat(32), 'bb'.repeat(32)],
			extraJSON: {
				signRequestKind: EIP712_SIGN_REQUEST_KIND,
				eip712: [
					{digest: `0x${'aa'.repeat(32)}`, primaryType: 'ClobAuth', delivery: {kind: 'none'}},
					{digest: `0x${'bb'.repeat(32)}`, primaryType: 'Order', delivery: {kind: 'none'}},
				],
			},
		};
		const legs = getEip712LegsFromDetail(detail);
		assert.equal(legs.length, 2);
		assert.equal(legs[0]?.delivery.kind, 'none');
		assert.equal(getEip712Delivery(detail, 1)?.kind, 'none');
		assert.deepEqual(getEip712MessageHashesFromDetail(detail), ['aa'.repeat(32), 'bb'.repeat(32)]);
		assert.equal(isEip712BodyForSign(detail), true);
	});

	it('does not treat a singular eip712 object as a leg', () => {
		const detail = {
			msgHash: 'aa'.repeat(32),
			extraJSON: {
				signRequestKind: EIP712_SIGN_REQUEST_KIND,
				eip712: {digest: `0x${'aa'.repeat(32)}`, delivery: {kind: 'none'}},
			},
		};
		assert.equal(getEip712LegsFromDetail(detail).length, 0);
		assert.equal(getEip712Delivery(detail), null);
	});

	it('rejects EIP-712 bodies that include proposal tx params', () => {
		assert.equal(
			isEip712BodyForSign({
				proposalTxParams: {gasLimit: '1'},
				extraJSON: {signRequestKind: EIP712_SIGN_REQUEST_KIND, eip712: []},
			}),
			false,
		);
	});
});
