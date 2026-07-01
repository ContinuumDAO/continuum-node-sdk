import {
	createPublicClient,
	defineChain,
	formatUnits,
	getAddress,
	http,
	type Address,
	type Hex,
} from 'viem';
import type {NodeSdkConfig} from '../../config/schema.js';
import {
	KEY_GEN_ADDRESS_KIND_ETHEREUM,
	MPA_WALLET_CONTRACT_CONFIG,
	MPA_WALLET_READ_ABI,
} from '../../config/mpa-wallet.js';
import type {SdkResult} from '../result.js';
import {
	MpaOveragePurchaseInputSchema,
	MpaSyncBillingInputSchema,
	MpaVpnDepositInputSchema,
	MpaVpnHostInputSchema,
	MpaVpnStatusInputSchema,
} from './schemas.js';
import {fetchKeyGenResult} from '../keygen.js';
import {fetchMergedMpaVpnStatus, type MpaVpnStatusData} from './mpa-fee-status.js';
import {canPayVpnMonthFromCredit, vpnPayMonthDisabledReason} from './mpa-billing-helpers.js';
import {
	appendFeeTokenApproveIfNeeded,
	prepareMpaRegisterVpnActions,
	prepareMpaSyncBillingActions,
	prepareMpaSyncVpnBillingActions,
	prepareMpaVpnDepositActions,
	type MpaProposalAction,
} from './mpa-billing-actions.js';
import {buildMultiSignProposal} from '../../evm/proposal-builder.js';
import {signAndSubmitMultiSignRequest} from './sign-request-body.js';
import {assertExecutorNativeSufficientForProposal} from './gas-preflight.js';
import {nodeId} from '../general.js';
import {computeVpnHostBinding} from '../vpn/vpn-host-binding.js';

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

function isWithdrawAuthority(executor: Address, authority: Address | string | null | undefined): boolean {
	if (authority == null || String(authority).trim() === '') return false;
	try {
		return executor.toLowerCase() === getAddress(String(authority)).toLowerCase();
	} catch {
		return false;
	}
}

async function resolveKeyGenExecutor(
	config: NodeSdkConfig,
	keyGenId: string,
): Promise<
	SdkResult<{
		keyGenResult: Awaited<ReturnType<typeof fetchKeyGenResult>> extends SdkResult<infer T>
			? T
			: never;
		billingAddress: Address;
	}>
> {
	const kg = await fetchKeyGenResult(config, keyGenId);
	if (!kg.ok) return kg;
	const eth = kg.data.ethereumaddress?.trim();
	if (!eth) {
		return {ok: false, reason: 'KeyGen has no ethereum address.'};
	}
	const billingAddress = getAddress(eth.startsWith('0x') ? eth : `0x${eth}`) as Address;
	return {ok: true, data: {keyGenResult: kg.data, billingAddress}};
}

async function resolveVpnHost(
	config: NodeSdkConfig,
	hostIpAddress: string,
	nodeKeyOverride?: string,
): Promise<SdkResult<{nodeKey: string; hostBinding: Hex}>> {
	let nodeKey = nodeKeyOverride?.trim();
	if (!nodeKey) {
		const self = await nodeId(config);
		if (!self.ok) return self;
		nodeKey = self.data.nodeId;
	}
	return {
		ok: true,
		data: {nodeKey, hostBinding: computeVpnHostBinding(nodeKey, hostIpAddress)},
	};
}

async function fetchFeeTokenMeta(client: ReturnType<typeof getMpaPublicClient>) {
	const mpa = MPA_WALLET_CONTRACT_CONFIG.contractAddress as Address;
	const feeToken = await client.readContract({
		address: mpa,
		abi: MPA_WALLET_READ_ABI,
		functionName: 'FEE_TOKEN',
	});
	const [symbol, decimals] = await Promise.all([
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
	return {feeToken, symbol: symbol ?? 'TOKEN', decimals: Number(decimals ?? 18)};
}

async function submitMpaProposal(
	config: NodeSdkConfig,
	input: {
		keyGenResult: Awaited<ReturnType<typeof fetchKeyGenResult>> extends SdkResult<infer T> ? T : never;
		purpose?: string;
		useCustomGas?: boolean;
		startingNonce?: number;
		actions: MpaProposalAction[];
	},
): Promise<SdkResult<{requestId: string}>> {
	const built = await buildMultiSignProposal(config, {
		keyGenResult: input.keyGenResult,
		chainId: MPA_WALLET_CONTRACT_CONFIG.chainId,
		purpose: input.purpose ?? 'MPA billing on Linea',
		useCustomGas: input.useCustomGas,
		startingNonce: input.startingNonce,
		actions: input.actions,
	});
	if (!built.ok) return built;

	const preflight = await assertExecutorNativeSufficientForProposal(config, {
		keyGenResult: input.keyGenResult,
		chainId: MPA_WALLET_CONTRACT_CONFIG.chainId,
		proposal: built.data,
	});
	if (!preflight.ok) return preflight;

	return signAndSubmitMultiSignRequest(config, built.data.unsignedBody);
}

export async function createMpaSyncBillingMultiSignRequest(
	config: NodeSdkConfig,
	input: unknown,
): Promise<SdkResult<{requestId: string}>> {
	const parsed = MpaSyncBillingInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid MPA sync billing input.'};
	}

	const prepared = await prepareMpaSyncBillingActions(config, {
		keyGenId: parsed.data.keyGenId,
		globalNonce: parsed.data.globalNonce,
	});
	if (!prepared.ok) return prepared;

	const exec = await resolveKeyGenExecutor(config, parsed.data.keyGenId);
	if (!exec.ok) return exec;

	return submitMpaProposal(config, {
		keyGenResult: exec.data.keyGenResult,
		purpose: parsed.data.purpose ?? 'Activate KeyGen MPA billing month',
		useCustomGas: parsed.data.useCustomGas,
		startingNonce: parsed.data.startingNonce,
		actions: prepared.data.actions,
	});
}

export async function createMpaOveragePurchaseMultiSignRequest(
	config: NodeSdkConfig,
	input: unknown,
): Promise<SdkResult<{requestId: string}>> {
	const parsed = MpaOveragePurchaseInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid MPA overage purchase input.'};
	}

	const exec = await resolveKeyGenExecutor(config, parsed.data.keyGenId);
	if (!exec.ok) return exec;

	const client = getMpaPublicClient();
	const mpa = MPA_WALLET_CONTRACT_CONFIG.contractAddress as Address;
	const keyGenId = parsed.data.keyGenId;
	const signatureCount = BigInt(parsed.data.signatureCount);

	if (signatureCount <= 0n) {
		return {ok: false, reason: 'signatureCount must be positive.'};
	}

	const registered = await client.readContract({
		address: mpa,
		abi: MPA_WALLET_READ_ABI,
		functionName: 'isKeyGenRegistered',
		args: [keyGenId, KEY_GEN_ADDRESS_KIND_ETHEREUM],
	});
	if (!registered) {
		return {ok: false, reason: 'KeyGen is not registered with MPA wallet.'};
	}

	const sub = await client.readContract({
		address: mpa,
		abi: MPA_WALLET_READ_ABI,
		functionName: 'getSubscriptionStatus',
		args: [keyGenId, KEY_GEN_ADDRESS_KIND_ETHEREUM],
	});
	const [, , , nodeCreditBalance, , , overageFeePerSignature, fundedForCurrentMonth] = sub;

	if (!fundedForCurrentMonth) {
		return {ok: false, reason: 'Billing month must be active before purchasing overage.'};
	}

	const requiredTopUp = await client.readContract({
		address: mpa,
		abi: MPA_WALLET_READ_ABI,
		functionName: 'getRequiredMinimumTopUp',
		args: [keyGenId, KEY_GEN_ADDRESS_KIND_ETHEREUM],
	});
	if (requiredTopUp > 0n) {
		return {ok: false, reason: 'Minimum top-up is still required before overage purchase.'};
	}

	const overageTotalWei = signatureCount * overageFeePerSignature;
	if (overageTotalWei <= 0n) {
		return {ok: false, reason: 'Overage fee is zero.'};
	}

	const withdrawAuthority = await client.readContract({
		address: mpa,
		abi: MPA_WALLET_READ_ABI,
		functionName: 'getKeyGenWithdrawAuthority',
		args: [keyGenId, KEY_GEN_ADDRESS_KIND_ETHEREUM],
	});
	const isAuthority = isWithdrawAuthority(exec.data.billingAddress, withdrawAuthority);

	const actions: MpaProposalAction[] = [];

	if (isAuthority) {
		if (nodeCreditBalance < overageTotalWei) {
			return {
				ok: false,
				reason: 'Insufficient credit pool balance for overage purchase.',
			};
		}
	} else {
		await appendFeeTokenApproveIfNeeded(
			client,
			actions,
			exec.data.billingAddress,
			overageTotalWei,
		);
	}

	actions.push({
		signature: 'purchaseOverageSignatures(string,string,uint256)',
		contractAddress: mpa,
		args: [
			{name: 'keyGenId', type: 'string', value: keyGenId},
			{name: 'addressKind', type: 'string', value: KEY_GEN_ADDRESS_KIND_ETHEREUM},
			{name: 'signatureCount', type: 'uint256', value: signatureCount.toString()},
		],
	});

	return submitMpaProposal(config, {
		keyGenResult: exec.data.keyGenResult,
		purpose: parsed.data.purpose ?? `Purchase ${signatureCount.toString()} MPA overage signature(s)`,
		useCustomGas: parsed.data.useCustomGas,
		startingNonce: parsed.data.startingNonce,
		actions,
	});
}

export async function registerVpnOnLinea(
	config: NodeSdkConfig,
	input: unknown,
): Promise<SdkResult<{requestId: string}>> {
	const parsed = MpaVpnHostInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid VPN registration input.'};
	}

	const prepared = await prepareMpaRegisterVpnActions(config, {
		keyGenId: parsed.data.keyGenId,
		hostIpAddress: parsed.data.hostIpAddress,
		nodeKey: parsed.data.nodeKey,
	});
	if (!prepared.ok) return prepared;

	const exec = await resolveKeyGenExecutor(config, parsed.data.keyGenId);
	if (!exec.ok) return exec;

	return submitMpaProposal(config, {
		keyGenResult: exec.data.keyGenResult,
		purpose: parsed.data.purpose ?? 'Register VPN billing account on Linea',
		useCustomGas: parsed.data.useCustomGas,
		startingNonce: parsed.data.startingNonce,
		actions: prepared.data.actions,
	});
}

export async function createMpaVpnDepositMultiSignRequest(
	config: NodeSdkConfig,
	input: unknown,
): Promise<SdkResult<{requestId: string}>> {
	const parsed = MpaVpnDepositInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid MPA VPN deposit input.'};
	}

	const prepared = await prepareMpaVpnDepositActions(config, {
		keyGenId: parsed.data.keyGenId,
		hostIpAddress: parsed.data.hostIpAddress,
		amountWei: parsed.data.amountWei,
		activateOnDeposit: parsed.data.activateOnDeposit,
		nodeKey: parsed.data.nodeKey,
	});
	if (!prepared.ok) return prepared;

	const exec = await resolveKeyGenExecutor(config, parsed.data.keyGenId);
	if (!exec.ok) return exec;

	return submitMpaProposal(config, {
		keyGenResult: exec.data.keyGenResult,
		purpose:
			parsed.data.purpose ??
			(parsed.data.activateOnDeposit
				? 'Deposit VPN credits and activate billing month'
				: 'Deposit VPN credits'),
		useCustomGas: parsed.data.useCustomGas,
		startingNonce: parsed.data.startingNonce,
		actions: prepared.data.actions,
	});
}

export async function createMpaSyncVpnBillingMultiSignRequest(
	config: NodeSdkConfig,
	input: unknown,
): Promise<SdkResult<{requestId: string}>> {
	const parsed = MpaVpnHostInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid MPA VPN sync billing input.'};
	}

	const prepared = await prepareMpaSyncVpnBillingActions(config, {
		keyGenId: parsed.data.keyGenId,
		hostIpAddress: parsed.data.hostIpAddress,
		nodeKey: parsed.data.nodeKey,
	});
	if (!prepared.ok) return prepared;

	const exec = await resolveKeyGenExecutor(config, parsed.data.keyGenId);
	if (!exec.ok) return exec;

	return submitMpaProposal(config, {
		keyGenResult: exec.data.keyGenResult,
		purpose: parsed.data.purpose ?? 'Activate VPN MPA billing month',
		useCustomGas: parsed.data.useCustomGas,
		startingNonce: parsed.data.startingNonce,
		actions: prepared.data.actions,
	});
}

export async function getMpaVpnStatus(
	config: NodeSdkConfig,
	input: unknown,
): Promise<SdkResult<MpaVpnStatusData>> {
	const parsed = MpaVpnStatusInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid MPA VPN status input.'};
	}

	const vpnHost = await resolveVpnHost(
		config,
		parsed.data.hostIpAddress,
		parsed.data.nodeKey,
	);
	if (!vpnHost.ok) return vpnHost;

	try {
		const merged = await fetchMergedMpaVpnStatus(
			config,
			vpnHost.data.nodeKey,
			parsed.data.hostIpAddress,
		);
		if (merged) {
			return {ok: true, data: merged};
		}

		const client = getMpaPublicClient();
		const mpa = MPA_WALLET_CONTRACT_CONFIG.contractAddress as Address;
		const {symbol, decimals} = await fetchFeeTokenMeta(client);
		const sub = await client.readContract({
			address: mpa,
			abi: MPA_WALLET_READ_ABI,
			functionName: 'getVpnSubscriptionStatus',
			args: [vpnHost.data.nodeKey, vpnHost.data.hostBinding],
		});
		const [registered, paidThroughMonth, vpnCreditBalance, vpnMonthlyFee, fundedForCurrentMonth] =
			sub;

		const billingRegistered = Boolean(registered);
		const data = {
			registered: billingRegistered,
			vpnBillingRegistered: billingRegistered,
			nodeKey: vpnHost.data.nodeKey,
			hostBinding: vpnHost.data.hostBinding,
			fundedForCurrentMonth,
			vpnBillingMonthActive: fundedForCurrentMonth,
			paidThroughMonth: Number(paidThroughMonth),
			vpnCreditBalance: formatUnits(vpnCreditBalance, decimals),
			vpnCreditBalanceWei: vpnCreditBalance.toString(),
			vpnMonthlyFee: formatUnits(vpnMonthlyFee, decimals),
			vpnMonthlyFeeWei: vpnMonthlyFee.toString(),
			feeTokenSymbol: symbol,
			feeTokenDecimals: decimals,
		};
		return {
			ok: true,
			data: {
				...data,
				canPayMonthFromCredit: canPayVpnMonthFromCredit(data),
				payMonthDisabledReason: vpnPayMonthDisabledReason(data),
			},
		};
	} catch (e) {
		return {
			ok: true,
			data: {
				registered: false,
				nodeKey: vpnHost.data.nodeKey,
				hostBinding: vpnHost.data.hostBinding,
				error: e instanceof Error ? e.message : 'Failed to load VPN billing status',
			},
		};
	}
}
