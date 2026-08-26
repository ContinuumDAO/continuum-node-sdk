import {
	createPublicClient,
	defineChain,
	formatUnits,
	getAddress,
	http,
	type Address,
} from 'viem';
import {buildManagementQueryPath, managementGet} from '../../api/management-api.js';
import type {NodeSdkConfig} from '../../config/schema.js';
import {
	MPA_WALLET_CONTRACT_CONFIG,
	MPA_WALLET_READ_ABI,
} from '../../config/mpa-wallet.js';
import {fetchGlobalNonceByKeyGenId, fetchKeyGenResult} from '../keygen-read.js';
import {mpcAuthEnvelopeData} from './sign-request-utils.js';
import {feeAddressKindForKeyGen} from './address-kind.js';
import {nodeId} from '../general.js';
import {
	canPayKeyGenMonthFromCredit,
	keyGenPayMonthDisabledReason,
	type MpaWalletStatusData,
} from './mpa-billing-helpers.js';
import {fetchMpaPaymentTokenMeta, storedFeeTokenSymbol} from './mpa-payment-tokens.js';

export type {MpaWalletStatusData} from './mpa-billing-helpers.js';

export type MpaFeeStatusFromNode = {
	globalnonce?: number;
	remainingnonces: number;
	remainingdepositwei: string;
	requireminimumtopupwei: string;
	currentmonthlyfeewei: string;
	currentoveragefeepernoncewei: string;
	activefreesignaturespermonth?: number;
	purchasedoveragesignatures?: number;
	feetokensymbol?: string;
	feetokendecimals?: number;
	freetransactionsleft?: number;
	registered: boolean;
	fundedforcurrentmonth?: boolean;
	paidthroughmonth?: number;
};

function getMpaPublicClient() {
	const chain = defineChain({
		id: MPA_WALLET_CONTRACT_CONFIG.chainId,
		name: MPA_WALLET_CONTRACT_CONFIG.chainName,
		nativeCurrency: {decimals: 18, name: 'Ether', symbol: 'ETH'},
		rpcUrls: {default: {http: [MPA_WALLET_CONTRACT_CONFIG.rpcUrl]}},
	});
	return createPublicClient({
		chain,
		transport: http(MPA_WALLET_CONTRACT_CONFIG.rpcUrl),
	});
}

function billingAddressFromEth(eth: string): Address {
	return getAddress(eth.startsWith('0x') ? eth : `0x${eth}`) as Address;
}

function unwrapRecord(raw: unknown): Record<string, unknown> | null {
	const data = mpcAuthEnvelopeData(raw) ?? raw;
	if (data != null && typeof data === 'object' && !Array.isArray(data)) {
		return data as Record<string, unknown>;
	}
	return null;
}

function parseOptionalBool(raw: unknown): boolean | undefined {
	if (typeof raw === 'boolean') return raw;
	if (raw === 'true' || raw === '1' || raw === 1) return true;
	if (raw === 'false' || raw === '0' || raw === 0) return false;
	return undefined;
}

function parseBillingMonthUtc(raw: unknown): number | undefined {
	if (typeof raw === 'number' && raw > 0) return raw;
	if (typeof raw === 'string' && raw.trim()) {
		const n = Number(raw);
		if (Number.isFinite(n) && n > 0) return n;
	}
	return undefined;
}

function feeStatusToMpaWalletStatus(
	fee: MpaFeeStatusFromNode,
	globalNonce?: number | null,
): MpaWalletStatusData {
	const decimals = fee.feetokendecimals ?? 18;
	const symbol = storedFeeTokenSymbol(fee.feetokensymbol);
	const depositWei = BigInt(fee.remainingdepositwei || '0');
	const monthlyWei = BigInt(fee.currentmonthlyfeewei || '0');
	const topUp = BigInt(fee.requireminimumtopupwei || '0');
	const freeLeft = fee.freetransactionsleft;
	const heuristicFunded =
		topUp === 0n && fee.registered && (fee.remainingnonces > 0 || depositWei >= monthlyWei);
	const funded =
		fee.fundedforcurrentmonth === true
			? true
			: fee.fundedforcurrentmonth === false
				? false
				: heuristicFunded;
	return {
		registered: fee.registered,
		globalNonce: fee.globalnonce ?? globalNonce ?? undefined,
		remainingNonces: fee.remainingnonces,
		freeTransactionsLeft: freeLeft,
		remainingDepositWei: fee.remainingdepositwei,
		remainingDeposit: formatUnits(depositWei, decimals),
		feeTokenSymbol: symbol,
		feeTokenDecimals: decimals,
		requiredMinimumTopUpWei: fee.requireminimumtopupwei,
		monthlyFeeWei: fee.currentmonthlyfeewei,
		monthlyFee: formatUnits(monthlyWei, decimals),
		overageFeePerSigWei: fee.currentoveragefeepernoncewei,
		purchasedOverageSignatures: fee.purchasedoveragesignatures,
		activeFreeSignaturesPerMonth: fee.activefreesignaturespermonth,
		fundedForCurrentMonth: funded,
		hasEverDeposited: depositWei > 0n,
	};
}

function parseFeeStatusPayload(data: Record<string, unknown>): MpaFeeStatusFromNode | null {
	const rn = data.remainingnonces ?? data.RemainingNonces;
	if (typeof rn !== 'number') return null;
	const gn = data.globalnonce ?? data.GlobalNonce;
	return {
		globalnonce: typeof gn === 'number' ? gn : undefined,
		remainingnonces: rn,
		remainingdepositwei: String(data.remainingdepositwei ?? data.RemainingDepositWei ?? '0'),
		requireminimumtopupwei: String(
			data.requireminimumtopupwei ?? data.RequireMinimumTopUpWei ?? '0',
		),
		currentmonthlyfeewei: String(data.currentmonthlyfeewei ?? data.CurrentMonthlyFeeWei ?? '0'),
		currentoveragefeepernoncewei: String(
			data.currentoveragefeepernoncewei ?? data.CurrentOverageFeePerNonceWei ?? '0',
		),
		activefreesignaturespermonth:
			typeof data.activefreesignaturespermonth === 'number'
				? data.activefreesignaturespermonth
				: undefined,
		purchasedoveragesignatures:
			typeof data.purchasedoveragesignatures === 'number'
				? data.purchasedoveragesignatures
				: undefined,
		feetokensymbol: typeof data.feetokensymbol === 'string' ? data.feetokensymbol : undefined,
		feetokendecimals:
			typeof data.feetokendecimals === 'number' ? data.feetokendecimals : undefined,
		freetransactionsleft:
			typeof data.freetransactionsleft === 'number' ? data.freetransactionsleft : undefined,
		registered: Boolean(data.registered ?? data.Registered),
		fundedforcurrentmonth: parseOptionalBool(
			data.fundedforcurrentmonth ?? data.FundedForCurrentMonth,
		),
		paidthroughmonth: parseBillingMonthUtc(data.paidthroughmonth ?? data.PaidThroughMonth),
	};
}

export async function fetchFeeStatusByKeyGenId(
	config: NodeSdkConfig,
	keyGenId: string,
): Promise<MpaFeeStatusFromNode | null> {
	const path = buildManagementQueryPath('/getFeeStatusByKeyGenId', {id: keyGenId});
	const raw = await managementGet<unknown>(config, path);
	if (!raw.ok) return null;
	const data = unwrapRecord(raw.data);
	if (!data) return null;
	return parseFeeStatusPayload(data);
}

async function resolveKeyGenGlobalNonceForChain(
	config: NodeSdkConfig,
	keyGenAddress: string,
	keyGenId: string,
	nodeGlobalNonce: number | null,
	feeStatusGlobalNonce?: number,
): Promise<number> {
	if (nodeGlobalNonce != null) return nodeGlobalNonce;
	if (feeStatusGlobalNonce != null) return feeStatusGlobalNonce;
	const trimmed = keyGenAddress.trim();
	if (!trimmed) return 0;
	try {
		const client = getMpaPublicClient();
		return await client.getTransactionCount({
			address: billingAddressFromEth(trimmed),
			blockTag: 'pending',
		});
	} catch {
		return 0;
	}
}

async function fetchMpaWalletStatusFromChain(
	keyGenId: string,
	currentNonce: number,
	addressKind: string,
	nodeKey: string,
): Promise<MpaWalletStatusData | null> {
	const client = getMpaPublicClient();
	const contractAddress = MPA_WALLET_CONTRACT_CONFIG.contractAddress as Address;

	try {
		const registered = await client.readContract({
			address: contractAddress,
			abi: MPA_WALLET_READ_ABI,
			functionName: 'isKeyGenRegistered',
			args: [keyGenId, addressKind, nodeKey],
		});
		if (!registered) return {registered: false, globalNonce: currentNonce};

		const [sub, rates] = await Promise.all([
			client.readContract({
				address: contractAddress,
				abi: MPA_WALLET_READ_ABI,
				functionName: 'getSubscriptionStatus',
				args: [keyGenId, addressKind, nodeKey],
			}),
			client.readContract({
				address: contractAddress,
				abi: MPA_WALLET_READ_ABI,
				functionName: 'getActiveRates',
			}),
		]);
		const [, , , signatureCountAtMonthStart, keyGenCreditBalance, fundedForCurrentMonth, purchasedOverage] =
			sub;
		const [monthlyFee, freeSignaturesPerMonth, overageFee] = rates;

		const [remainingNonces, requiredTopUp] = await Promise.all([
			client.readContract({
				address: contractAddress,
				abi: MPA_WALLET_READ_ABI,
				functionName: 'getRemainingNonces',
				args: [keyGenId, addressKind, nodeKey, BigInt(currentNonce)],
			}),
			client.readContract({
				address: contractAddress,
				abi: MPA_WALLET_READ_ABI,
				functionName: 'getRequiredMinimumTopUp',
				args: [keyGenId, addressKind, nodeKey],
			}),
		]);

		const sigAtStart = Number(signatureCountAtMonthStart);
		const freeLeft = fundedForCurrentMonth
			? Math.max(0, Number(freeSignaturesPerMonth) - Math.max(0, currentNonce - sigAtStart))
			: 0;

		const meta = await fetchMpaPaymentTokenMeta();
		const [ctmBalance, requiredTopUpCtm] = await Promise.all([
			client.readContract({
				address: contractAddress,
				abi: MPA_WALLET_READ_ABI,
				functionName: 'getNodeCtmCreditBalance',
				args: [nodeKey],
			}),
			client.readContract({
				address: contractAddress,
				abi: MPA_WALLET_READ_ABI,
				functionName: 'getRequiredMinimumTopUpCtm',
				args: [keyGenId, addressKind, nodeKey],
			}),
		]);

		return {
			registered: true,
			globalNonce: currentNonce,
			freeTransactionsLeft: freeLeft,
			remainingNonces: Number(remainingNonces),
			remainingDepositWei: keyGenCreditBalance.toString(),
			remainingDeposit: formatUnits(keyGenCreditBalance, meta.feeTokenDecimals),
			requiredMinimumTopUpWei: requiredTopUp.toString(),
			requiredMinimumTopUpCtmWei: requiredTopUpCtm.toString(),
			remainingCtmCreditWei: ctmBalance.toString(),
			remainingCtmCredit: formatUnits(ctmBalance, meta.ctmTokenDecimals),
			monthlyFeeWei: monthlyFee.toString(),
			monthlyFee: formatUnits(monthlyFee, meta.feeTokenDecimals),
			overageFeePerSigWei: overageFee.toString(),
			purchasedOverageSignatures: Number(purchasedOverage),
			activeFreeSignaturesPerMonth: Number(freeSignaturesPerMonth),
			fundedForCurrentMonth: Boolean(fundedForCurrentMonth),
			feeTokenSymbol: meta.feeTokenSymbol,
			feeTokenDecimals: meta.feeTokenDecimals,
			ctmTokenSymbol: meta.ctmTokenSymbol,
			ctmTokenDecimals: meta.ctmTokenDecimals,
			ctmPaymentsPaused: meta.ctmPaymentsPaused,
			hasEverDeposited: keyGenCreditBalance > 0n || ctmBalance > 0n,
		};
	} catch {
		return null;
	}
}

export type KeyGenMonthActivationWaiver = {
	monthActivationWaived: boolean;
	qualifiesForVeCtmWaiver: boolean;
	qualifiesForNodeTrial: boolean;
};

/** True when the next KeyGen syncBilling charges zero (group veCTM waiver or unused node trial). */
export async function fetchKeyGenMonthActivationWaived(
	keyGenId: string,
	addressKind: string,
	nodeKey: string,
): Promise<KeyGenMonthActivationWaiver> {
	const none: KeyGenMonthActivationWaiver = {
		monthActivationWaived: false,
		qualifiesForVeCtmWaiver: false,
		qualifiesForNodeTrial: false,
	};
	if (!keyGenId.trim() || !addressKind.trim() || !nodeKey.trim()) return none;
	try {
		const client = getMpaPublicClient();
		const contractAddress = MPA_WALLET_CONTRACT_CONFIG.contractAddress as Address;
		const nodeIdBytes = await client.readContract({
			address: contractAddress,
			abi: MPA_WALLET_READ_ABI,
			functionName: 'nodeIdOfNodeKey',
			args: [nodeKey],
		});
		const [veCtm, trial] = await Promise.all([
			client.readContract({
				address: contractAddress,
				abi: MPA_WALLET_READ_ABI,
				functionName: 'qualifiesForVeCtmWaiver',
				args: [keyGenId, addressKind, nodeKey],
			}),
			client.readContract({
				address: contractAddress,
				abi: MPA_WALLET_READ_ABI,
				functionName: 'qualifiesForNodeTrial',
				args: [nodeIdBytes],
			}),
		]);
		return {
			monthActivationWaived: Boolean(veCtm || trial),
			qualifiesForVeCtmWaiver: Boolean(veCtm),
			qualifiesForNodeTrial: Boolean(trial),
		};
	} catch {
		return none;
	}
}

async function overlayPaymentTokenFields(
	status: MpaWalletStatusData,
	keyGenId: string,
	addressKind: string,
	nodeKey: string,
): Promise<MpaWalletStatusData> {
	try {
		const meta = await fetchMpaPaymentTokenMeta();
		const next: MpaWalletStatusData = {
			...status,
			feeTokenSymbol: meta.feeTokenSymbol,
			feeTokenDecimals: meta.feeTokenDecimals,
			ctmTokenSymbol: meta.ctmTokenSymbol,
			ctmTokenDecimals: meta.ctmTokenDecimals,
			ctmPaymentsPaused: meta.ctmPaymentsPaused,
		};
		if (status.remainingDepositWei != null) {
			next.remainingDeposit = formatUnits(BigInt(status.remainingDepositWei), meta.feeTokenDecimals);
		}
		if (status.monthlyFeeWei != null) {
			next.monthlyFee = formatUnits(BigInt(status.monthlyFeeWei), meta.feeTokenDecimals);
		}
		if (nodeKey.trim() && next.remainingCtmCreditWei == null) {
			const client = getMpaPublicClient();
			const contractAddress = MPA_WALLET_CONTRACT_CONFIG.contractAddress as Address;
			const [ctmBalance, requiredTopUpCtm] = await Promise.all([
				client.readContract({
					address: contractAddress,
					abi: MPA_WALLET_READ_ABI,
					functionName: 'getNodeCtmCreditBalance',
					args: [nodeKey],
				}),
				keyGenId.trim() && addressKind.trim()
					? client.readContract({
							address: contractAddress,
							abi: MPA_WALLET_READ_ABI,
							functionName: 'getRequiredMinimumTopUpCtm',
							args: [keyGenId, addressKind, nodeKey],
						})
					: Promise.resolve(0n),
			]);
			next.remainingCtmCreditWei = ctmBalance.toString();
			next.remainingCtmCredit = formatUnits(ctmBalance, meta.ctmTokenDecimals);
			next.requiredMinimumTopUpCtmWei = requiredTopUpCtm.toString();
		} else if (next.remainingCtmCreditWei != null && next.remainingCtmCredit == null) {
			next.remainingCtmCredit = formatUnits(BigInt(next.remainingCtmCreditWei), meta.ctmTokenDecimals);
		}
		return next;
	} catch {
		return {
			...status,
			feeTokenSymbol: storedFeeTokenSymbol(status.feeTokenSymbol),
		};
	}
}

function enrichKeyGenWalletStatus(status: MpaWalletStatusData): MpaWalletStatusData {
	return {
		...status,
		feeTokenSymbol: storedFeeTokenSymbol(status.feeTokenSymbol),
		canPayMonthFromCredit: canPayKeyGenMonthFromCredit(status),
		payMonthDisabledReason: keyGenPayMonthDisabledReason(status),
	};
}

async function withMonthActivationWaiver(
	status: MpaWalletStatusData,
	keyGenId: string,
	addressKind: string,
	nodeKey: string,
): Promise<MpaWalletStatusData> {
	const withTokens = await overlayPaymentTokenFields(status, keyGenId, addressKind, nodeKey);
	if (!withTokens.registered || !nodeKey) {
		return enrichKeyGenWalletStatus(withTokens);
	}
	const waiver = await fetchKeyGenMonthActivationWaived(keyGenId, addressKind, nodeKey);
	return enrichKeyGenWalletStatus({...withTokens, ...waiver});
}

/** Node fee status with on-chain KeyGen subscription fallback. */
export async function fetchMergedMpaWalletStatus(
	config: NodeSdkConfig,
	keyGenId: string,
	keyGenEthAddress: string,
): Promise<MpaWalletStatusData> {
	const [feeStatus, globalNonceResult, kg, self] = await Promise.all([
		fetchFeeStatusByKeyGenId(config, keyGenId),
		fetchGlobalNonceByKeyGenId(config, keyGenId),
		fetchKeyGenResult(config, keyGenId),
		nodeId(config),
	]);
	const nodeGlobalNonce = globalNonceResult.ok ? globalNonceResult.data : null;
	const resolvedNonce = await resolveKeyGenGlobalNonceForChain(
		config,
		keyGenEthAddress,
		keyGenId,
		nodeGlobalNonce,
		feeStatus?.globalnonce,
	);
	const addressKind = kg.ok ? feeAddressKindForKeyGen(kg.data as Record<string, unknown>) : 'ethereum';
	const nodeKey = self.ok ? self.data.nodeId : '';

	if (feeStatus) {
		const status = feeStatusToMpaWalletStatus(feeStatus, resolvedNonce);
		status.globalNonce = nodeGlobalNonce ?? resolvedNonce;
		if (!status.registered) {
			const chainStatus = nodeKey
				? await fetchMpaWalletStatusFromChain(keyGenId, resolvedNonce, addressKind, nodeKey)
				: null;
			if (chainStatus?.registered) {
				chainStatus.globalNonce = nodeGlobalNonce ?? resolvedNonce;
				return withMonthActivationWaiver(chainStatus, keyGenId, addressKind, nodeKey);
			}
			return withMonthActivationWaiver(status, keyGenId, addressKind, nodeKey);
		}
		const chain = nodeKey
			? await fetchMpaWalletStatusFromChain(keyGenId, resolvedNonce, addressKind, nodeKey)
			: null;
		if (chain?.fundedForCurrentMonth != null) {
			status.fundedForCurrentMonth = chain.fundedForCurrentMonth;
		}
		return withMonthActivationWaiver(status, keyGenId, addressKind, nodeKey);
	}

	const chainStatus = nodeKey
		? await fetchMpaWalletStatusFromChain(keyGenId, resolvedNonce, addressKind, nodeKey)
		: null;
	if (chainStatus) {
		chainStatus.globalNonce = nodeGlobalNonce ?? resolvedNonce;
		return withMonthActivationWaiver(chainStatus, keyGenId, addressKind, nodeKey);
	}
	return enrichKeyGenWalletStatus({
		registered: false,
		error: 'Failed to load MPA wallet status',
		globalNonce: nodeGlobalNonce ?? resolvedNonce,
	});
}
