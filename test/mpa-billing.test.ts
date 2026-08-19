import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	canPayKeyGenMonthFromCredit,
	canPayVpnMonthFromCredit,
	keyGenPayMonthDisabledReason,
	shouldSyncKeyGenMonthAfterDeposit,
	vpnPayMonthDisabledReason,
} from '../dist/core/mpc/mpa-billing-helpers.js';
import {storedFeeTokenSymbol, vpnMonthShortfalls} from '../dist/core/mpc/mpa-payment-tokens.js';
import {MpaTopUpInputSchema, MpaVpnHostInputSchema, MpaWalletStatusSchema} from '../dist/core/mpc/schemas.js';

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

test('keyGenPayMonthDisabledReason when veCTM or trial waives the month', () => {
	const waived = {
		...baseStatus,
		remainingDepositWei: '0',
		monthActivationWaived: true,
		qualifiesForVeCtmWaiver: true,
	};
	assert.equal(keyGenPayMonthDisabledReason(waived), null);
	assert.equal(canPayKeyGenMonthFromCredit(waived), true);
	assert.equal(shouldSyncKeyGenMonthAfterDeposit(waived, 0n), true);
});

test('keyGenPayMonthDisabledReason still requires pool when not waived', () => {
	const short = {...baseStatus, remainingDepositWei: '0', monthActivationWaived: false};
	assert.match(keyGenPayMonthDisabledReason(short) ?? '', /Credit pool must cover/);
	assert.match(keyGenPayMonthDisabledReason(short) ?? '', /or CTM/);
	assert.equal(canPayKeyGenMonthFromCredit(short), false);
});

test('keyGenPayMonthDisabledReason when CTM already covers the month', () => {
	const coveredByCtm = {
		...baseStatus,
		remainingDepositWei: '0',
		requiredMinimumTopUpWei: '0',
		remainingCtmCreditWei: '1000000000000000000',
		ctmTokenSymbol: 'CTM',
	};
	assert.equal(keyGenPayMonthDisabledReason(coveredByCtm), null);
	assert.equal(canPayKeyGenMonthFromCredit(coveredByCtm), true);
});

test('shouldSyncKeyGenMonthAfterDeposit for a CTM top-up', () => {
	const status = {
		...baseStatus,
		remainingDepositWei: '0',
		requiredMinimumTopUpCtmWei: '400000',
	};
	assert.equal(shouldSyncKeyGenMonthAfterDeposit(status, 400000n, 'ctm'), true);
	assert.equal(shouldSyncKeyGenMonthAfterDeposit(status, 100000n, 'ctm'), false);
});

test('MpaTopUpInputSchema accepts paymentToken', () => {
	const parsed = MpaTopUpInputSchema.safeParse({
		keyGenId: 'KeyGen202606061714459993c372497',
		amountWei: '1000000',
		paymentToken: 'ctm',
	});
	assert.equal(parsed.success, true);
	if (!parsed.success) return;
	assert.equal(parsed.data.paymentToken, 'ctm');
});

test('vpnPayMonthDisabledReason when pool insufficient', () => {
	const vpn = {
		vpnBillingRegistered: true,
		vpnBillingMonthActive: false,
		vpnCreditBalanceWei: '100',
		vpnMonthlyFeeWei: '500000',
	};
	assert.match(vpnPayMonthDisabledReason(vpn) ?? '', /deposit the fee token or CTM first/);
	assert.equal(canPayVpnMonthFromCredit(vpn), false);
});

test('vpnPayMonthDisabledReason when CTM already covers the month', () => {
	const vpn = {
		vpnBillingRegistered: true,
		vpnBillingMonthActive: false,
		vpnCreditBalanceWei: '0',
		vpnMonthlyFeeWei: '500000',
		requireMinimumTopUpWei: '0',
		remainingCtmCreditWei: '1000000000000000000',
		ctmTokenSymbol: 'CTM',
	};
	assert.equal(vpnPayMonthDisabledReason(vpn), null);
	assert.equal(canPayVpnMonthFromCredit(vpn), true);
});

test('vpnMonthShortfalls uses fee token first then CTM', () => {
	const covered = vpnMonthShortfalls({
		feeCreditWei: 100n,
		ctmCreditWei: 400n,
		monthlyFeeWei: 500n,
		ctmPerFeeToken: 1000n,
		ctmPaymentsPaused: false,
	});
	assert.equal(covered.requiredMinimumTopUpWei, 0n);
	assert.equal(covered.requiredMinimumTopUpCtmWei, 0n);

	const short = vpnMonthShortfalls({
		feeCreditWei: 100n,
		ctmCreditWei: 0n,
		monthlyFeeWei: 500n,
		ctmPerFeeToken: 2000n,
		ctmPaymentsPaused: false,
	});
	assert.equal(short.requiredMinimumTopUpWei, 400n);
	assert.equal(short.requiredMinimumTopUpCtmWei, 800n);
});

test('MpaVpnHostInputSchema accepts paymentToken', () => {
	const parsed = MpaVpnHostInputSchema.safeParse({
		keyGenId: 'KeyGen202606061714459993c372497',
		hostIpAddress: '203.0.113.10',
		paymentToken: 'ctm',
	});
	assert.equal(parsed.success, true);
	if (!parsed.success) return;
	assert.equal(parsed.data.paymentToken, 'ctm');
});

test('storedFeeTokenSymbol never assumes USDC', () => {
	assert.equal(storedFeeTokenSymbol('TUSD'), 'TUSD');
	assert.equal(storedFeeTokenSymbol('USDC'), 'USDC');
	assert.equal(storedFeeTokenSymbol(''), 'fee token');
	assert.equal(storedFeeTokenSymbol(undefined), 'fee token');
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
