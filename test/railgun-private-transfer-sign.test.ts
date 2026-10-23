import assert from 'node:assert/strict';
import test from 'node:test';
import {buildManagementCanonicalJson, buildManagementUnsignedBody} from '../src/api/canonical-json.ts';
import {railgunPrivateTransferSignFields, railgunUnshieldSignFields} from '../src/core/railgun-private-transfer-sign.ts';

test('private transfer sign fields match the management signature JSON', () => {
	const bare = buildManagementCanonicalJson(
		buildManagementUnsignedBody({nonce: 4, nodeKey: 'ab'}, railgunPrivateTransferSignFields({
			keyGenId: 'KeyGen1',
			chainId: 1,
			tokenAddress: '0xabc',
			amountWei: '10',
			recipientAddress: '0zk1qyabc',
			memoText: '   ',
			purpose: '',
		})),
	);
	assert.equal(
		bare,
		'{"nonce":4,"clientSig":"","nodeKey":"ab","amountWei":"10","chainId":1,"keyGenId":"KeyGen1","recipientAddress":"0zk1qyabc","tokenAddress":"0xabc"}',
	);
	const noted = buildManagementCanonicalJson(
		buildManagementUnsignedBody({nonce: 4, nodeKey: 'ab'}, railgunPrivateTransferSignFields({
			keyGenId: 'KeyGen1',
			chainId: 1,
			tokenAddress: '0xabc',
			amountWei: '10',
			recipientAddress: '0zk1qyabc',
			purpose: 'hello',
		})),
	);
	assert.equal(
		noted,
		'{"nonce":4,"clientSig":"","nodeKey":"ab","amountWei":"10","chainId":1,"keyGenId":"KeyGen1","memoText":"hello","purpose":"hello","recipientAddress":"0zk1qyabc","tokenAddress":"0xabc"}',
	);
});

test('unshield sign fields match the management signature JSON', () => {
	const bare = buildManagementCanonicalJson(
		buildManagementUnsignedBody({nonce: 4, nodeKey: 'ab'}, railgunUnshieldSignFields({
			keyGenId: 'KeyGen1',
			chainId: 1,
			tokenAddress: '0xabc',
			amountWei: '10',
			recipientAddress: '0x1111111111111111111111111111111111111111',
			purpose: '   ',
		})),
	);
	assert.equal(
		bare,
		'{"nonce":4,"clientSig":"","nodeKey":"ab","amountWei":"10","chainId":1,"keyGenId":"KeyGen1","recipientAddress":"0x1111111111111111111111111111111111111111","tokenAddress":"0xabc"}',
	);
	const noted = buildManagementCanonicalJson(
		buildManagementUnsignedBody({nonce: 4, nodeKey: 'ab'}, railgunUnshieldSignFields({
			keyGenId: 'KeyGen1',
			chainId: 1,
			tokenAddress: '0xabc',
			amountWei: '10',
			recipientAddress: '0x1111111111111111111111111111111111111111',
			purpose: 'hello',
		})),
	);
	assert.equal(
		noted,
		'{"nonce":4,"clientSig":"","nodeKey":"ab","amountWei":"10","chainId":1,"keyGenId":"KeyGen1","purpose":"hello","recipientAddress":"0x1111111111111111111111111111111111111111","tokenAddress":"0xabc"}',
	);
});
