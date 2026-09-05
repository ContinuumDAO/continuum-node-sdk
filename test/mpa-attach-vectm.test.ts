import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	ATTACH_VECTM_SIGNATURE,
	VECTM_NODE_INFO_TUPLE,
	attachVeCtmComposeArgs,
} from '../src/core/mpc/mpa-authority-vectm-args.ts';

test('attachVeCtm selector is 4-arg including groupId', () => {
	assert.equal(
		ATTACH_VECTM_SIGNATURE,
		`attachVeCtm(string,uint256,${VECTM_NODE_INFO_TUPLE},string)`,
	);
	assert.doesNotMatch(ATTACH_VECTM_SIGNATURE, /attachVeCtm\(string,uint256,\([^)]+\)\)$/);
});

test('attachVeCtmComposeArgs binds the attaching KeyGen groupId last', () => {
	const args = attachVeCtmComposeArgs('nodekey', '21', {forumHandle: '@op'}, 'group-a');
	assert.equal(args.length, 4);
	assert.deepEqual(
		args.map(a => a.name),
		['nodeKey', 'tokenId', 'nodeInfo', 'groupId'],
	);
	assert.equal(args[3]?.value, 'group-a');
});
