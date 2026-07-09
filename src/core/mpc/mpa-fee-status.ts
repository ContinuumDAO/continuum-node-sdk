import {
	createPublicClient,
	defineChain,
	formatUnits,
	getAddress,
	http,
	type Address,
	type Hex,
} from 'viem';
import {buildManagementQueryPath, managementGet} from '../../api/management-api.js';
import type {NodeSdkConfig} from '../../config/schema.js';
import {
	KEY_GEN_ADDRESS_KIND_ETHEREUM,
	MPA_WALLET_CONTRACT_CONFIG,
	MPA_WALLET_READ_ABI,
} from '../../config/mpa-wallet.js';
import {fetchGlobalNonceByKeyGenId} from '../keygen-read.js';
import {computeVpnHostBinding} from '../vpn/vpn-host-binding.js';
import {mpcAuthEnvelopeData} from './sign-request-utils.js';
import {
	canPayKeyGenMonthFromCredit,
	canPayVpnMonthFromCredit,
	keyGenPayMonthDisabledReason,
	vpnPayMonthDisabledReason,
	type MpaWalletStatusData,
} from './mpa-billing-helpers.js';

const ERC20_SYMBOL_DECIMALS_ABI = [
	{
		inputs: [],
		name: 'symbol',
		outputs: [{name: '', type: 'string', internalType: 'string'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [],
		name: 'decimals',
		outputs: [{name: '', type: 'uint8', internalType: 'uint8'}],
		stateMutability: 'view',
		type: 'function',
	},
] as const;

export type {MpaWalletStatusData} from './mpa-billing-helpers.js';

export type MpaFeeStatusFromNode = {
	globalnonce?: number;
	remainingnonces: number;
	remainingdepositwei: string;
	requireminimumtopupwei: string;
	currentmonthlyfeewei: string;
	currentoveragefeepernoncewei: string;
	activefreesignaturespermonth?: number;
	activevpnmonthlyfeewei?: string;
	purchasedoveragesignatures?: number;
	feetokensymbol?: string;
	feetokendecimals?: number;
	freetransactionsleft?: number;
	registered: boolean;
	fundedforcurrentmonth?: boolean;
	paidthroughmonth?: number;
};

export type MpaVpnFeeStatusFromNode = {
	registered: boolean;
	paidthroughmonth?: number;
	fundedforcurrentmonth?: boolean;
	vpncreditbalancewei: string;
	vpnmonthlyfeewei: string;
	requireminimumtopupwei: string;
	feetokensymbol?: string;
	feetokendecimals?: number;
	hostip?: string;
};

export type MpaVpnSubscriptionStatus = {
	registered: boolean;
	paidThroughMonth: number;
	vpnCreditBalanceWei: string;
	vpnMonthlyFeeWei: string;
	fundedForCurrentMonth: boolean;
};

export type MpaVpnStatusData = {
	registered: boolean;
	vpnBillingRegistered?: boolean;
	nodeKey?: string;
	hostBinding?: string;
	fundedForCurrentMonth?: boolean;
	vpnBillingMonthActive?: boolean;
	paidThroughMonth?: number;
	vpnCreditBalance?: string;
	vpnCreditBalanceWei?: string;
	vpnMonthlyFee?: string;
	vpnMonthlyFeeWei?: string;
	requireMinimumTopUpWei?: string;
	feeTokenSymbol?: string;
	feeTokenDecimals?: number;
	canPayMonthFromCredit?: boolean;
	payMonthDisabledReason?: string | null;
	error?: string;
};

function getMpaPublicClient() {
	const chain = defineChain({
		id: MPA_WALLET_CONTRACT_CONFIG.chainId,
		name: 'Linea Mainnet',
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
	const symbol = fee.feetokensymbol ?? 'TOKEN';
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
		activevpnmonthlyfeewei:
			typeof data.activevpnmonthlyfeewei === 'string' ? data.activevpnmonthlyfeewei : undefined,
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
): Promise<MpaWalletStatusData | null> {
	const client = getMpaPublicClient();
	const contractAddress = MPA_WALLET_CONTRACT_CONFIG.contractAddress as Address;

	try {
		const registered = await client.readContract({
			address: contractAddress,
			abi: MPA_WALLET_READ_ABI,
			functionName: 'isKeyGenRegistered',
			args: [keyGenId, KEY_GEN_ADDRESS_KIND_ETHEREUM],
		});
		if (!registered) return {registered: false, globalNonce: currentNonce};

		const sub = await client.readContract({
			address: contractAddress,
			abi: MPA_WALLET_READ_ABI,
			functionName: 'getSubscriptionStatus',
			args: [keyGenId, KEY_GEN_ADDRESS_KIND_ETHEREUM],
		});
		const [, , signatureCountAtMonthStart, keyGenCreditBalance, monthlyFee, freeSignaturesPerMonth, overageFee, fundedForCurrentMonth, purchasedOverage] =
			sub;

		const [remainingNonces, requiredTopUp] = await Promise.all([
			client.readContract({
				address: contractAddress,
				abi: MPA_WALLET_READ_ABI,
				functionName: 'getRemainingNonces',
				args: [keyGenId, KEY_GEN_ADDRESS_KIND_ETHEREUM, BigInt(currentNonce)],
			}),
			client.readContract({
				address: contractAddress,
				abi: MPA_WALLET_READ_ABI,
				functionName: 'getRequiredMinimumTopUp',
				args: [keyGenId, KEY_GEN_ADDRESS_KIND_ETHEREUM],
			}),
		]);

		const sigAtStart = Number(signatureCountAtMonthStart);
		const freeLeft = fundedForCurrentMonth
			? Math.max(0, Number(freeSignaturesPerMonth) - Math.max(0, currentNonce - sigAtStart))
			: 0;

		const feeToken = await client.readContract({
			address: contractAddress,
			abi: MPA_WALLET_READ_ABI,
			functionName: 'FEE_TOKEN',
		});
		let symbol = 'TOKEN';
		let decimals = 18;
		try {
			const [sym, dec] = await Promise.all([
				client.readContract({
					address: feeToken,
					abi: ERC20_SYMBOL_DECIMALS_ABI,
					functionName: 'symbol',
				}),
				client.readContract({
					address: feeToken,
					abi: ERC20_SYMBOL_DECIMALS_ABI,
					functionName: 'decimals',
				}),
			]);
			symbol = sym ?? symbol;
			decimals = Number(dec ?? decimals);
		} catch {
			// keep defaults
		}

		return {
			registered: true,
			globalNonce: currentNonce,
			freeTransactionsLeft: freeLeft,
			remainingNonces: Number(remainingNonces),
			remainingDepositWei: keyGenCreditBalance.toString(),
			remainingDeposit: formatUnits(keyGenCreditBalance, decimals),
			requiredMinimumTopUpWei: requiredTopUp.toString(),
			monthlyFeeWei: monthlyFee.toString(),
			monthlyFee: formatUnits(monthlyFee, decimals),
			overageFeePerSigWei: overageFee.toString(),
			purchasedOverageSignatures: Number(purchasedOverage),
			activeFreeSignaturesPerMonth: Number(freeSignaturesPerMonth),
			fundedForCurrentMonth: Boolean(fundedForCurrentMonth),
			feeTokenSymbol: symbol,
			feeTokenDecimals: decimals,
			hasEverDeposited: keyGenCreditBalance > 0n,
		};
	} catch {
		return null;
	}
}

function enrichKeyGenWalletStatus(status: MpaWalletStatusData): MpaWalletStatusData {
	return {
		...status,
		canPayMonthFromCredit: canPayKeyGenMonthFromCredit(status),
		payMonthDisabledReason: keyGenPayMonthDisabledReason(status),
	};
}

/** Node fee status with on-chain KeyGen subscription fallback. */
export async function fetchMergedMpaWalletStatus(
	config: NodeSdkConfig,
	keyGenId: string,
	keyGenEthAddress: string,
): Promise<MpaWalletStatusData> {
	const [feeStatus, globalNonceResult] = await Promise.all([
		fetchFeeStatusByKeyGenId(config, keyGenId),
		fetchGlobalNonceByKeyGenId(config, keyGenId),
	]);
	const nodeGlobalNonce = globalNonceResult.ok ? globalNonceResult.data : null;
	const resolvedNonce = await resolveKeyGenGlobalNonceForChain(
		config,
		keyGenEthAddress,
		keyGenId,
		nodeGlobalNonce,
		feeStatus?.globalnonce,
	);

	if (feeStatus) {
		const status = feeStatusToMpaWalletStatus(feeStatus, resolvedNonce);
		status.globalNonce = nodeGlobalNonce ?? resolvedNonce;
		if (!status.registered) {
			const chainStatus = await fetchMpaWalletStatusFromChain(keyGenId, resolvedNonce);
			if (chainStatus?.registered) {
				chainStatus.globalNonce = nodeGlobalNonce ?? resolvedNonce;
				return enrichKeyGenWalletStatus(chainStatus);
			}
			return enrichKeyGenWalletStatus(status);
		}
		const chain = await fetchMpaWalletStatusFromChain(keyGenId, resolvedNonce);
		if (chain?.fundedForCurrentMonth != null) {
			status.fundedForCurrentMonth = chain.fundedForCurrentMonth;
		}
		return enrichKeyGenWalletStatus(status);
	}

	const chainStatus = await fetchMpaWalletStatusFromChain(keyGenId, resolvedNonce);
	if (chainStatus) {
		chainStatus.globalNonce = nodeGlobalNonce ?? resolvedNonce;
		return enrichKeyGenWalletStatus(chainStatus);
	}
	return enrichKeyGenWalletStatus({
		registered: false,
		error: 'Failed to load MPA wallet status',
		globalNonce: nodeGlobalNonce ?? resolvedNonce,
	});
}

function parseVpnFeeStatusPayload(data: Record<string, unknown>): MpaVpnFeeStatusFromNode {
	const billingMonthActive = parseOptionalBool(
		data.fundedforcurrentmonth ??
			data.FundedForCurrentMonth ??
			data.vpnBillingMonthActive ??
			data.VpnBillingMonthActive,
	);
	const accountRegistered = parseOptionalBool(
		data.vpnBillingRegistered ??
			data.VpnBillingRegistered ??
			data.accountRegistered ??
			data.AccountRegistered,
	);
	const legacyRegistered = parseOptionalBool(data.registered ?? data.Registered);
	const poolWei = BigInt(String(data.vpncreditbalancewei ?? data.VpnCreditBalanceWei ?? '0'));
	const paidThrough = parseBillingMonthUtc(data.paidthroughmonth ?? data.PaidThroughMonth);
	const hasPriorBilling = poolWei > 0n || paidThrough != null;
	const monthInactive =
		billingMonthActive === false ||
		(billingMonthActive == null && legacyRegistered === false && hasPriorBilling);
	const registered =
		accountRegistered ??
		(monthInactive && hasPriorBilling ? true : (legacyRegistered ?? false));

	return {
		registered,
		paidthroughmonth: paidThrough,
		fundedforcurrentmonth: billingMonthActive ?? legacyRegistered,
		vpncreditbalancewei: poolWei.toString(),
		vpnmonthlyfeewei: String(data.vpnmonthlyfeewei ?? data.VpnMonthlyFeeWei ?? '0'),
		requireminimumtopupwei: String(
			data.requireminimumtopupwei ?? data.RequireMinimumTopUpWei ?? '0',
		),
		feetokensymbol: typeof data.feetokensymbol === 'string' ? data.feetokensymbol : undefined,
		feetokendecimals:
			typeof data.feetokendecimals === 'number' ? data.feetokendecimals : undefined,
		hostip: typeof data.hostip === 'string' ? data.hostip : undefined,
	};
}

export async function fetchVpnFeeStatusByNode(
	config: NodeSdkConfig,
	hostIp?: string | null,
): Promise<MpaVpnFeeStatusFromNode | null> {
	const path = buildManagementQueryPath('/getVpnFeeStatus', {
		hostIp: hostIp?.trim() || undefined,
	});
	const raw = await managementGet<unknown>(config, path);
	if (!raw.ok) return null;
	const data = unwrapRecord(raw.data);
	if (!data) return null;
	return parseVpnFeeStatusPayload(data);
}

export async function fetchVpnSubscriptionStatus(
	nodeKey: string,
	hostIpAddress: string,
): Promise<MpaVpnSubscriptionStatus | null> {
	try {
		const hostBinding = computeVpnHostBinding(nodeKey, hostIpAddress);
		const client = getMpaPublicClient();
		const contractAddress = MPA_WALLET_CONTRACT_CONFIG.contractAddress as Address;
		const sub = await client.readContract({
			address: contractAddress,
			abi: MPA_WALLET_READ_ABI,
			functionName: 'getVpnSubscriptionStatus',
			args: [nodeKey, hostBinding],
		});
		const [registered, paidThroughMonth, vpnCreditBalance, vpnMonthlyFee, fundedForCurrentMonth] =
			sub;
		return {
			registered: Boolean(registered),
			paidThroughMonth: Number(paidThroughMonth),
			vpnCreditBalanceWei: vpnCreditBalance.toString(),
			vpnMonthlyFeeWei: vpnMonthlyFee.toString(),
			fundedForCurrentMonth: Boolean(fundedForCurrentMonth),
		};
	} catch {
		return null;
	}
}

function vpnChainHasBillingAccount(chain: MpaVpnSubscriptionStatus): boolean {
	if (chain.registered) return true;
	if (chain.paidThroughMonth > 0) return true;
	return BigInt(chain.vpnCreditBalanceWei || '0') > 0n;
}

function mergeVpnFeeStatusWithChain(
	node: MpaVpnFeeStatusFromNode,
	chain: MpaVpnSubscriptionStatus,
): MpaVpnFeeStatusFromNode {
	if (!vpnChainHasBillingAccount(chain)) return node;

	if (!node.registered) {
		return {
			...node,
			registered: true,
			paidthroughmonth: chain.paidThroughMonth,
			fundedforcurrentmonth: chain.fundedForCurrentMonth,
			vpncreditbalancewei: chain.vpnCreditBalanceWei,
			vpnmonthlyfeewei: chain.vpnMonthlyFeeWei || node.vpnmonthlyfeewei,
		};
	}

	const nodePool = BigInt(node.vpncreditbalancewei || '0');
	const chainPool = BigInt(chain.vpnCreditBalanceWei || '0');
	return {
		...node,
		paidthroughmonth: chain.paidThroughMonth ?? node.paidthroughmonth,
		fundedforcurrentmonth: chain.fundedForCurrentMonth,
		vpncreditbalancewei: (chainPool > nodePool ? chainPool : nodePool).toString(),
		vpnmonthlyfeewei: chain.vpnMonthlyFeeWei || node.vpnmonthlyfeewei,
	};
}

function vpnFeeStatusToMpaVpnStatus(
	fee: MpaVpnFeeStatusFromNode,
	nodeKey: string,
	hostBinding: Hex,
): MpaVpnStatusData {
	const decimals = fee.feetokendecimals ?? 6;
	const symbol = fee.feetokensymbol ?? 'USDC';
	const poolWei = BigInt(fee.vpncreditbalancewei || '0');
	const monthlyWei = BigInt(fee.vpnmonthlyfeewei || '0');
	const billingRegistered = fee.registered;
	const monthActive = fee.fundedforcurrentmonth;
	const status: MpaVpnStatusData = {
		registered: billingRegistered,
		vpnBillingRegistered: billingRegistered,
		nodeKey,
		hostBinding,
		fundedForCurrentMonth: monthActive,
		vpnBillingMonthActive: monthActive,
		paidThroughMonth: fee.paidthroughmonth,
		vpnCreditBalanceWei: fee.vpncreditbalancewei,
		vpnCreditBalance: formatUnits(poolWei, decimals),
		vpnMonthlyFeeWei: fee.vpnmonthlyfeewei,
		vpnMonthlyFee: formatUnits(monthlyWei, decimals),
		requireMinimumTopUpWei: fee.requireminimumtopupwei,
		feeTokenSymbol: symbol,
		feeTokenDecimals: decimals,
	};
	return {
		...status,
		canPayMonthFromCredit: canPayVpnMonthFromCredit(status),
		payMonthDisabledReason: vpnPayMonthDisabledReason(status),
	};
}

/** Node VPN fee status with on-chain subscription fallback. */
export async function fetchMergedMpaVpnStatus(
	config: NodeSdkConfig,
	nodeKey: string,
	hostIpAddress: string,
): Promise<MpaVpnStatusData | null> {
	const trimmedKey = nodeKey.trim();
	const trimmedHost = hostIpAddress.trim();
	const hostBinding = computeVpnHostBinding(trimmedKey, trimmedHost);

	const [nodeStatus, chainStatus] = await Promise.all([
		fetchVpnFeeStatusByNode(config, trimmedHost),
		trimmedKey && trimmedHost
			? fetchVpnSubscriptionStatus(trimmedKey, trimmedHost)
			: Promise.resolve(null),
	]);

	let merged: MpaVpnFeeStatusFromNode | null = null;
	if (nodeStatus && chainStatus) {
		merged = mergeVpnFeeStatusWithChain(nodeStatus, chainStatus);
	} else if (nodeStatus) {
		merged = nodeStatus;
	} else if (chainStatus && vpnChainHasBillingAccount(chainStatus)) {
		merged = {
			registered: true,
			paidthroughmonth: chainStatus.paidThroughMonth,
			fundedforcurrentmonth: chainStatus.fundedForCurrentMonth,
			vpncreditbalancewei: chainStatus.vpnCreditBalanceWei,
			vpnmonthlyfeewei: chainStatus.vpnMonthlyFeeWei,
			requireminimumtopupwei: '0',
		};
	}

	if (!merged) return null;
	return vpnFeeStatusToMpaVpnStatus(merged, trimmedKey, hostBinding);
}
