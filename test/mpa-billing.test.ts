import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	canPayKeyGenMonthFromCredit,
	canPayVpnMonthFromCredit,
	keyGenPayMonthDisabledReason,
	shouldSyncKeyGenMonthAfterDeposit,
	vpnPayMonthDisabledReason,
} from '../dist/core/mpc/mpa-billing-helpers.js';
import {MpaTopUpInputSchema, MpaWalletStatusSchema} from '../dist/core/mpc/schemas.js';

const baseStatus = {
	registered: true,
	remainingDepositWei: '1000000',
	monthlyFeeWei: '500000',
	monthlyFee: '0.5',
	feeTokenSymbol: 'USDC',
	feeTokenDecimals: 6,
	globalNonce: 42,
	fundedForCurrentMonth: false,
};

test('keyGenPayMonthDisabledReason when pool covers monthly fee', () => {
	assert.equal(keyGenPayMonthDisabledReason(baseStatus), null);
	assert.equal(canPayKeyGenMonthFromCredit(baseStatus), true);
});

test('keyGenPayMonthDisabledReason when month already active', () => {
	const reason = keyGenPayMonthDisabledReason({...baseStatus, fundedForCurrentMonth: true});
	assert.match(reason ?? '', /already active/);
	assert.equal(canPayKeyGenMonthFromCredit({...baseStatus, fundedForCurrentMonth: true}), false);
});

test('shouldSyncKeyGenMonthAfterDeposit after sufficient deposit', () => {
	const status = {...baseStatus, remainingDepositWei: '200000', fundedForCurrentMonth: false};
	assert.equal(shouldSyncKeyGenMonthAfterDeposit(status, 400000n), true);
	assert.equal(shouldSyncKeyGenMonthAfterDeposit(status, 100000n), false);
});

test('vpnPayMonthDisabledReason when pool insufficient', () => {
	const vpn = {
		vpnBillingRegistered: true,
		vpnBillingMonthActive: false,
		vpnCreditBalanceWei: '100',
		vpnMonthlyFeeWei: '500000',
	};
	assert.match(vpnPayMonthDisabledReason(vpn) ?? '', /deposit first/);
	assert.equal(canPayVpnMonthFromCredit(vpn), false);
});

test('MpaWalletStatusSchema accepts billing month fields', () => {
	const parsed = MpaWalletStatusSchema.safeParse({
		registered: true,
		fundedForCurrentMonth: false,
		canPayMonthFromCredit: true,
		payMonthDisabledReason: null,
		monthlyFeeWei: '500000',
		remainingDepositWei: '1000000',
	});
	assert.equal(parsed.success, true);
});

test('MpaTopUpInputSchema accepts activateBillingMonthAfterDeposit', () => {
	const parsed = MpaTopUpInputSchema.safeParse({
		keyGenId: 'KeyGen202606061714459993c372497',
		amountWei: '1000000',
		activateBillingMonthAfterDeposit: true,
	});
	assert.equal(parsed.success, true);
	if (!parsed.success) return;
	assert.equal(parsed.data.activateBillingMonthAfterDeposit, true);
});
