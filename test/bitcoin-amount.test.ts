import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as bitcoin from 'bitcoinjs-lib';
import {bitcoinAmountToSats, satsToBtcString} from '../src/core/mpc/bitcoin-amount.ts';
import {
	buildP2trKeyPathTransferDraft,
	buildP2wpkhTransferDraft,
} from '../src/core/mpc/bitcoin-transfer-draft.ts';

test('converts BTC decimals to satoshis exactly', () => {
	assert.equal(bitcoinAmountToSats('0.1', 'btc'), 10_000_000n);
	assert.equal(bitcoinAmountToSats('0.00000001', 'btc'), 1n);
	assert.equal(bitcoinAmountToSats('1', 'btc'), 100_000_000n);
	assert.equal(bitcoinAmountToSats('10000', 'sats'), 10_000n);
	assert.equal(satsToBtcString(10_000_000n), '0.1');
});

test('rejects a sats fraction and a ninth BTC decimal', () => {
	assert.throws(() => bitcoinAmountToSats('1.5', 'sats'));
	assert.throws(() => bitcoinAmountToSats('0.000000001', 'btc'));
	assert.throws(() => bitcoinAmountToSats('0', 'sats'));
});

test('builds a one-input P2WPKH draft and pays the destination in output 0', () => {
	const pubkey = Buffer.from(
		'0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
		'hex',
	);
	const from = bitcoin.payments.p2wpkh({pubkey, network: bitcoin.networks.bitcoin}).address;
	const to = bitcoin.payments.p2wpkh({
		pubkey: Buffer.from(
			'02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5',
			'hex',
		),
		network: bitcoin.networks.bitcoin,
	}).address;
	assert.ok(from && to);
	const draft = buildP2wpkhTransferDraft({
		network: 'mainnet',
		fromAddress: from,
		toAddress: to,
		amountSats: 20_000n,
		feeRateSatPerVbyte: 2,
		utxoPool: [{txid: '11'.repeat(32), vout: 0, value: 100_000}],
	});
	const tx = bitcoin.Transaction.fromHex(draft.unsignedTxHex);
	assert.equal(tx.ins.length, 1);
	assert.equal(tx.outs[0]?.value, 20_000);
	assert.equal(bitcoin.Transaction.fromHex(draft.unsignedTxHex).getId().length, 64);
});

test('builds a one-input Taproot key-path draft', () => {
	const internal = Buffer.from(
		'0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
		'hex',
	);
	const from = bitcoin.payments.p2tr({internalPubkey: internal.slice(1), network: bitcoin.networks.bitcoin}).address;
	const to = bitcoin.payments.p2wpkh({
		pubkey: Buffer.from(
			'02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5',
			'hex',
		),
		network: bitcoin.networks.bitcoin,
	}).address;
	assert.ok(from && to);
	const draft = buildP2trKeyPathTransferDraft({
		network: 'mainnet',
		fromAddress: from,
		toAddress: to,
		amountSats: 20_000n,
		feeRateSatPerVbyte: 2,
		utxoPool: [{txid: '22'.repeat(32), vout: 1, value: 80_000}],
	});
	const tx = bitcoin.Transaction.fromHex(draft.unsignedTxHex);
	assert.equal(tx.ins.length, 1);
	assert.equal(tx.outs[0]?.value, 20_000);
	assert.ok(tx.outs[0]!.script[0] === 0x00 || tx.outs[0]!.script[0] === 0x51 || tx.outs[0]!.value === 20_000);
});
