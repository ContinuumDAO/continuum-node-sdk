import {formatUnits} from 'viem';

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
	monthlyFeeWei?: string;
	monthlyFee?: string;
	overageFeePerSigWei?: string;
	purchasedOverageSignatures?: number;
	activeFreeSignaturesPerMonth?: number;
	fundedForCurrentMonth?: boolean;
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
): boolean {
	return (
		isKeyGenBillingMonthUnsynced(status) &&
		keyGenPoolCoversMonthlyFeeAfterDeposit(status, depositAmountWei)
	);
}

/** Why Pay month is unavailable, or null when sync billing can run. */
export function keyGenPayMonthDisabledReason(status: MpaWalletStatusData | null): string | null {
	if (!status?.registered) return 'Register KeyGen billing first.';
	if (status.fundedForCurrentMonth === true) return 'Billing month is already active.';
	const pool = BigInt(status.remainingDepositWei ?? '0');
	const monthly = BigInt(status.monthlyFeeWei ?? '0');
	if (monthly === 0n) return 'Monthly fee is not configured.';
	if (pool < monthly) {
		const symbol = status.feeTokenSymbol ?? 'USDC';
		const fee = status.monthlyFee ?? formatUnits(monthly, status.feeTokenDecimals ?? 6);
		return `Credit pool must cover the monthly fee (${fee} ${symbol}).`;
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
};

export function vpnPayMonthDisabledReason(vpn: MpaVpnBillingStatusData | null): string | null {
	const registered = vpn?.vpnBillingRegistered ?? vpn?.registered;
	if (!registered) return 'Register VPN billing first.';
	const monthActive = vpn?.vpnBillingMonthActive ?? vpn?.fundedForCurrentMonth;
	if (monthActive === true) return 'Billing month is already active.';
	const pool = BigInt(vpn?.vpnCreditBalanceWei ?? '0');
	const monthly = BigInt(vpn?.vpnMonthlyFeeWei ?? '0');
	if (monthly === 0n) return 'Monthly fee is not configured.';
	if (pool < monthly) return 'VPN credit pool must cover the monthly fee; deposit first.';
	return null;
}

export function canPayVpnMonthFromCredit(vpn: MpaVpnBillingStatusData | null): boolean {
	return vpnPayMonthDisabledReason(vpn) === null;
}
