import assert from 'node:assert/strict';
import test from 'node:test';
import {buildManagementCanonicalJson, buildManagementUnsignedBody} from '../src/api/canonical-json.ts';
import {railgunPrivateTransferSignFields, railgunSpendExecuteFields, railgunUnshieldSignFields} from '../src/core/railgun-private-transfer-sign.ts';

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

test('agree and execute sign the same management JSON the node checks', () => {
	const spendId = 'ab'.repeat(16)
	const execute = buildManagementCanonicalJson(
		buildManagementUnsignedBody({nonce: 4, nodeKey: 'ab'}, {
			keyGenId: 'KeyGen1',
			spendId,
		}),
	)
	assert.equal(
		execute,
		`{"nonce":4,"clientSig":"","nodeKey":"ab","keyGenId":"KeyGen1","spendId":"${spendId}"}`,
	)
	const agree = buildManagementCanonicalJson(
		buildManagementUnsignedBody({nonce: 4, nodeKey: 'ab'}, {
			keyGenId: 'KeyGen1',
			spendId,
			thoughts: 'ok',
		}),
	)
	assert.equal(
		agree,
		`{"nonce":4,"clientSig":"","nodeKey":"ab","keyGenId":"KeyGen1","spendId":"${spendId}","thoughts":"ok"}`,
	)
	const chosen = buildManagementCanonicalJson(
		buildManagementUnsignedBody({nonce: 4, nodeKey: 'ab'}, railgunSpendExecuteFields({
			keyGenId: 'KeyGen1',
			spendId,
			broadcasterAddress: '0zk1qyabc',
			broadcasterFeesId: 'fee1',
		})),
	)
	const omitted = buildManagementCanonicalJson(
		buildManagementUnsignedBody({nonce: 4, nodeKey: 'ab'}, railgunSpendExecuteFields({
			keyGenId: 'KeyGen1',
			spendId,
			broadcasterAddress: '  ',
			broadcasterFeesId: '',
		})),
	)
	assert.equal(
		omitted,
		`{"nonce":4,"clientSig":"","nodeKey":"ab","keyGenId":"KeyGen1","spendId":"${spendId}"}`,
	)
	assert.equal(
		chosen,
		`{"nonce":4,"clientSig":"","nodeKey":"ab","broadcasterAddress":"0zk1qyabc","broadcasterFeesId":"fee1","keyGenId":"KeyGen1","spendId":"${spendId}"}`,
	)
})

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
