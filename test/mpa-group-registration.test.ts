import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	collectKeyGenMemberNodeKeys,
	pickRegisteredMpaNodeKey,
	mpaBillingNodeKeyForVeCtmReads,
	keyGenGroupVeCtmWaived,
} from '../dist/core/mpc/mpa-group-registration.js';
import {normalizeNodeKey} from '../dist/core/mpc/sign-request-utils.js';

test('collectKeyGenMemberNodeKeys dedupes ClientKeys and keylist', () => {
	const keys = collectKeyGenMemberNodeKeys(
		{ClientKeys: {'0xAbC': 'x', '0xdef': 'y'}, keylist: ['0xabc', '0x999']},
		'0xLOCAL',
	);
	assert.ok(keys.length >= 3);
	assert.equal(keys.filter(k => normalizeNodeKey(k) === normalizeNodeKey('0xabc')).length, 1);
});

test('pickRegisteredMpaNodeKey prefers local when registered', async () => {
	const picked = await pickRegisteredMpaNodeKey('local', true, ['peer'], async () => false);
	assert.equal(picked, 'local');
});

test('pickRegisteredMpaNodeKey scans peers when local not registered', async () => {
	const picked = await pickRegisteredMpaNodeKey(
		'local',
		false,
		['peer-a', 'peer-b'],
		async nk => nk === 'peer-b',
	);
	assert.equal(picked, 'peer-b');
});

test('mpaBillingNodeKeyForVeCtmReads prefers billing node', () => {
	assert.equal(mpaBillingNodeKeyForVeCtmReads('bill', 'local'), 'bill');
	assert.equal(mpaBillingNodeKeyForVeCtmReads(null, 'local'), 'local');
});

test('keyGenGroupVeCtmWaived', () => {
	assert.equal(keyGenGroupVeCtmWaived({qualifiesForVeCtmWaiver: true}), true);
	assert.equal(keyGenGroupVeCtmWaived({veCtmAttachGroupWaived: true}), true);
	assert.equal(keyGenGroupVeCtmWaived({}), false);
});
