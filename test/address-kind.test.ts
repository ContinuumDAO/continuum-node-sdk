import assert from 'node:assert/strict';
import {test} from 'node:test';
import {feeAddressKindForKeyGen} from '../dist/core/mpc/address-kind.js';

test('maps secp256k1 to ethereum', () => {
	assert.equal(feeAddressKindForKeyGen({keytype: 'secp256k1'}), 'ethereum');
});

test('maps bitcoin-taproot', () => {
	assert.equal(feeAddressKindForKeyGen({keytype: 'bitcoin-taproot'}), 'bitcoinTaproot');
});

test('defaults ed25519 to solana when multiple addresses exist', () => {
	assert.equal(
		feeAddressKindForKeyGen({
			keytype: 'ed25519',
			solanaaddress: 'So1',
			nearaddress: 'near1',
		}),
		'solana',
	);
});

test('maps a near-only ed25519 key', () => {
	assert.equal(feeAddressKindForKeyGen({keytype: 'ed25519', nearaddress: 'near1'}), 'near');
});
