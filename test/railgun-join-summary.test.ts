import assert from 'node:assert/strict';
import test from 'node:test';
import {railgunSpendJoinSummary} from '../dist/core/mpc/railgun-join.js';
import {SignRequestSummarySchema} from '../dist/core/mpc/schemas.js';
import type {RailgunKeyGenSpend} from '../src/core/railgun-keygen-store.ts';

const originator = 'node-originator';
const joiner = 'node-joiner';

function spend(overrides: Partial<RailgunKeyGenSpend> = {}): RailgunKeyGenSpend {
	return {
		spendId: 'ab'.repeat(16),
		status: 'pending',
		kind: 'transfer',
		chainId: 1,
		tokenAddress: '0xabc',
		amountWei: '10',
		recipientAddress: '0zk1qyabc',
		memoText: 'pay rent',
		purpose: {[originator]: 'pay rent'},
		thoughts: {[joiner]: 'looks right'},
		originator,
		createdAt: '2026-10-24T11:00:00Z',
		deadline: '2026-10-25T11:00:00Z',
		approvals: [originator],
		quorum: 2,
		txHash: '',
		error: '',
		...overrides,
	};
}

test('a Railgun join row exposes originator purpose text and passes the list schema', () => {
	const {summary} = railgunSpendJoinSummary('KeyGen1', spend(), joiner);
	assert.equal(summary.purpose, 'pay rent');
	assert.deepEqual(summary.thoughts, {[joiner]: 'looks right'});
	assert.equal(summary.agreementKind, 'railgun_spend');
	const parsed = SignRequestSummarySchema.safeParse(summary);
	assert.equal(parsed.success, true, parsed.success ? '' : parsed.error.message);
});

test('a purpose map is rejected by the list schema', () => {
	const {summary} = railgunSpendJoinSummary('KeyGen1', spend(), joiner);
	const parsed = SignRequestSummarySchema.safeParse({
		...summary,
		purpose: {[originator]: 'pay rent'},
	});
	assert.equal(parsed.success, false);
});
