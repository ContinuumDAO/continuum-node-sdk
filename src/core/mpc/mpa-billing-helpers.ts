import {formatUnits} from 'viem';
import {storedFeeTokenSymbol} from './mpa-payment-tokens.js';

export type MpaWalletStatusData = {
	registered: boolean;
	freeTransactionsLeft?: number;
	hasEverDeposited?: boolean;
	remainingDeposit?: string;
	remainingDepositWei?: string;
	feeTokenSymbol?: string;
	feeTokenDecimals?: number;
	remainingNonces?: number;
	globalNonce?: number;
	requiredMinimumTopUpWei?: string;
	requiredMinimumTopUpCtmWei?: string;
	remainingCtmCreditWei?: string;
	remainingCtmCredit?: string;
	ctmTokenSymbol?: string;
	ctmTokenDecimals?: number;
	ctmPaymentsPaused?: boolean;
	monthlyFeeWei?: string;
	monthlyFee?: string;
	overageFeePerSigWei?: string;
	purchasedOverageSignatures?: number;
	activeFreeSignaturesPerMonth?: number;
	fundedForCurrentMonth?: boolean;
	/** True when the next syncBilling charges zero (veCTM group waiver or unused node trial). */
	monthActivationWaived?: boolean;
	qualifiesForVeCtmWaiver?: boolean;
	qualifiesForNodeTrial?: boolean;
	canPayMonthFromCredit?: boolean;
	payMonthDisabledReason?: string | null;
	error?: string;
};

/** Current UTC billing month is not activated on-chain. */
export function isKeyGenBillingMonthUnsynced(status: MpaWalletStatusData | null): boolean {
	return !!status?.registered && status.fundedForCurrentMonth !== true;
}

export function keyGenPoolCoversMonthlyFeeAfterDeposit(
	status: MpaWalletStatusData | null,
	depositAmountWei: bigint,
): boolean {
	if (!status) return false;
	const pool = BigInt(status.remainingDepositWei ?? '0') + depositAmountWei;
	const monthly = BigInt(status.monthlyFeeWei ?? '0');
	return monthly > 0n && pool >= monthly;
}

export function shouldSyncKeyGenMonthAfterDeposit(
	status: MpaWalletStatusData | null,
	depositAmountWei: bigint,
	paymentToken: 'fee' | 'ctm' = 'fee',
): boolean {
	if (!isKeyGenBillingMonthUnsynced(status)) return false;
	if (status?.monthActivationWaived === true) return true;
	if (paymentToken === 'ctm') {
		const shortfall = BigInt(status?.requiredMinimumTopUpCtmWei ?? '0');
		return depositAmountWei >= shortfall;
	}
	if (status?.requiredMinimumTopUpWei != null && BigInt(status.requiredMinimumTopUpWei) === 0n) {
		return true;
	}
	return keyGenPoolCoversMonthlyFeeAfterDeposit(status, depositAmountWei);
}

/** Why Pay month is unavailable, or null when sync billing can run. */
export function keyGenPayMonthDisabledReason(status: MpaWalletStatusData | null): string | null {
	if (!status?.registered) return 'Register KeyGen billing first.';
	if (status.fundedForCurrentMonth === true) return 'Billing month is already active.';
	if (status.monthActivationWaived === true) {
		if (status.globalNonce == null) return 'Global nonce not loaded yet.';
		return null;
	}
	const shortfall = BigInt(status.requiredMinimumTopUpWei ?? '0');
	const pool = BigInt(status.remainingDepositWei ?? '0');
	const monthly = BigInt(status.monthlyFeeWei ?? '0');
	if (monthly === 0n) return 'Monthly fee is not configured.';
	if (shortfall > 0n || (status.requiredMinimumTopUpWei == null && pool < monthly)) {
		const symbol = storedFeeTokenSymbol(status.feeTokenSymbol);
		const fee = status.monthlyFee ?? formatUnits(monthly, status.feeTokenDecimals ?? 6);
		const ctm = status.ctmPaymentsPaused ? '' : ` or ${status.ctmTokenSymbol ?? 'CTM'}`;
		return `Credit pool must cover the monthly fee (${fee} ${symbol}). Deposit ${symbol}${ctm}, then pay the month.`;
	}
	if (status.globalNonce == null) return 'Global nonce not loaded yet.';
	return null;
}

export function canPayKeyGenMonthFromCredit(status: MpaWalletStatusData | null): boolean {
	return keyGenPayMonthDisabledReason(status) === null;
}

export type MpaVpnBillingStatusData = {
	registered?: boolean;
	vpnBillingRegistered?: boolean;
	fundedForCurrentMonth?: boolean;
	vpnBillingMonthActive?: boolean;
	vpnCreditBalanceWei?: string;
	vpnMonthlyFeeWei?: string;
	requireMinimumTopUpWei?: string;
	requiredMinimumTopUpCtmWei?: string;
	remainingCtmCreditWei?: string;
	ctmTokenSymbol?: string;
	ctmPaymentsPaused?: boolean;
};

export function vpnPayMonthDisabledReason(vpn: MpaVpnBillingStatusData | null): string | null {
	const registered = vpn?.vpnBillingRegistered ?? vpn?.registered;
	if (!registered) return 'Register VPN billing first.';
	const monthActive = vpn?.vpnBillingMonthActive ?? vpn?.fundedForCurrentMonth;
	if (monthActive === true) return 'Billing month is already active.';
	const monthly = BigInt(vpn?.vpnMonthlyFeeWei ?? '0');
	if (monthly === 0n) return 'Monthly fee is not configured.';
	const shortfall =
		vpn?.requireMinimumTopUpWei != null
			? BigInt(vpn.requireMinimumTopUpWei)
			: BigInt(vpn?.vpnCreditBalanceWei ?? '0') < monthly
				? monthly
				: 0n;
	if (shortfall > 0n) {
		const ctm = vpn?.ctmPaymentsPaused ? '' : ` or ${vpn?.ctmTokenSymbol ?? 'CTM'}`;
		return `VPN credit pool must cover the monthly fee; deposit the fee token${ctm} first.`;
	}
	return null;
}

export function canPayVpnMonthFromCredit(vpn: MpaVpnBillingStatusData | null): boolean {
	return vpnPayMonthDisabledReason(vpn) === null;
}
