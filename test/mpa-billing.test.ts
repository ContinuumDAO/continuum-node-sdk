import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	canPayKeyGenMonthFromCredit,
	keyGenPayMonthDisabledReason,
	shouldSyncKeyGenMonthAfterDeposit,
} from '../dist/core/mpc/mpa-billing-helpers.js';
import {storedFeeTokenSymbol} from '../dist/core/mpc/mpa-payment-tokens.js';
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
