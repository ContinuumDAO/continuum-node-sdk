import {
	createPublicClient,
	defineChain,
	getAddress,
	http,
	type Address,
	type Hex,
	type PublicClient,
} from 'viem';
import type {NodeSdkConfig} from '../../config/schema.js';
import {
	ERC20_ALLOWANCE_ABI,
	KEY_GEN_ADDRESS_KIND_ETHEREUM,
	MPA_DEPOSIT_ONLY_NONCE,
	MPA_WALLET_CONTRACT_CONFIG,
	MPA_WALLET_READ_ABI,
} from '../../config/mpa-wallet.js';
import {fetchKeyGenResult} from '../keygen-read.js';
import {fetchGlobalNonceByKeyGenId} from '../keygen-read.js';
import type {SdkResult} from '../result.js';
import {computeVpnHostBinding} from '../vpn/vpn-host-binding.js';
import {shouldSyncKeyGenMonthAfterDeposit} from './mpa-billing-helpers.js';
import {fetchMergedMpaWalletStatus} from './mpa-fee-status.js';
import {nodeId} from '../general.js';

export type MpaProposalAction = {
	signature: string;
	contractAddress: string;
	args: {name: string; type: string; value: string}[];
};

export type MpaPreparedBillingActions = {
	actions: MpaProposalAction[];
	feeTokenAddress: Address;
};

function getMpaPublicClient(): PublicClient {
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

export function mpaContractAddress(): Address {
	return MPA_WALLET_CONTRACT_CONFIG.contractAddress as Address;
}

function billingAddressFromEth(eth: string): Address {
	return getAddress(eth.startsWith('0x') ? eth : `0x${eth}`) as Address;
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
		keyGenResult: Awaited<ReturnType<typeof fetchKeyGenResult>> extends SdkResult<infer T> ? T : never;
		billingAddress: Address;
	}>
> {
	const kg = await fetchKeyGenResult(config, keyGenId);
	if (!kg.ok) return kg;
	const eth = kg.data.ethereumaddress?.trim();
	if (!eth) {
		return {ok: false, reason: 'KeyGen has no ethereum address.'};
	}
	return {ok: true, data: {keyGenResult: kg.data, billingAddress: billingAddressFromEth(eth)}};
}

async function resolveGlobalNonce(
	config: NodeSdkConfig,
	keyGenId: string,
	billingAddress: Address,
	explicit?: number,
): Promise<SdkResult<number>> {
	if (explicit != null) return {ok: true, data: explicit};
	const fromNode = await fetchGlobalNonceByKeyGenId(config, keyGenId);
	if (fromNode.ok) return fromNode;
	const client = getMpaPublicClient();
	const nonce = await client.getTransactionCount({address: billingAddress, blockTag: 'pending'});
	return {ok: true, data: nonce};
}

async function resolveNodeKey(config: NodeSdkConfig): Promise<SdkResult<string>> {
	const self = await nodeId(config);
	if (!self.ok) return self;
	return {ok: true, data: self.data.nodeId};
}

async function resolveVpnHost(
	config: NodeSdkConfig,
	hostIpAddress: string,
	nodeKeyOverride?: string,
): Promise<SdkResult<{nodeKey: string; hostBinding: Hex}>> {
	let nodeKey = nodeKeyOverride?.trim();
	if (!nodeKey) {
		const self = await resolveNodeKey(config);
		if (!self.ok) return self;
		nodeKey = self.data;
	}
	return {
		ok: true,
		data: {nodeKey, hostBinding: computeVpnHostBinding(nodeKey, hostIpAddress)},
	};
}

async function fetchFeeTokenAddress(client: PublicClient): Promise<Address> {
	return client.readContract({
		address: mpaContractAddress(),
		abi: MPA_WALLET_READ_ABI,
		functionName: 'FEE_TOKEN',
	});
}

export async function appendFeeTokenApproveIfNeeded(
	client: PublicClient,
	actions: MpaProposalAction[],
	billingAddress: Address,
	amountWei: bigint,
): Promise<Address> {
	const mpa = mpaContractAddress();
	const feeToken = await fetchFeeTokenAddress(client);
	const allowance = await client.readContract({
		address: feeToken,
		abi: ERC20_ALLOWANCE_ABI,
		functionName: 'allowance',
		args: [billingAddress, mpa],
	});
	if (allowance < amountWei) {
		actions.push({
			signature: 'approve(address,uint256)',
			contractAddress: feeToken,
			args: [
				{name: 'spender', type: 'address', value: mpa},
				{name: 'amount', type: 'uint256', value: amountWei.toString()},
			],
		});
	}
	return feeToken;
}

export function buildRegisterVpnActions(nodeKey: string, hostBinding: Hex | string): MpaProposalAction[] {
	const mpa = mpaContractAddress();
	return [
		{
			signature: 'registerVpn(string,bytes32)',
			contractAddress: mpa,
			args: [
				{name: 'nodeKey', type: 'string', value: nodeKey},
				{name: 'hostBinding', type: 'bytes32', value: String(hostBinding)},
			],
		},
	];
}

export function buildSyncVpnBillingActions(nodeKey: string, hostBinding: Hex | string): MpaProposalAction[] {
	const mpa = mpaContractAddress();
	return [
		{
			signature: 'syncVpnBilling(string,bytes32)',
			contractAddress: mpa,
			args: [
				{name: 'nodeKey', type: 'string', value: nodeKey},
				{name: 'hostBinding', type: 'bytes32', value: String(hostBinding)},
			],
		},
	];
}

export function buildVpnDepositActions(input: {
	nodeKey: string;
	hostBinding: Hex | string;
	amountWei: bigint;
	activateOnDeposit?: boolean;
}): MpaProposalAction[] {
	const mpa = mpaContractAddress();
	return [
		{
			signature: 'depositVpn(string,bytes32,uint256,bool)',
			contractAddress: mpa,
			args: [
				{name: 'nodeKey', type: 'string', value: input.nodeKey},
				{name: 'hostBinding', type: 'bytes32', value: String(input.hostBinding)},
				{name: 'amount', type: 'uint256', value: input.amountWei.toString()},
				{name: 'activate', type: 'bool', value: String(input.activateOnDeposit ?? false)},
			],
		},
	];
}

export function buildWithdrawVpnCreditActions(
	nodeKey: string,
	hostBinding: Hex | string,
	amountWei: bigint,
): MpaProposalAction[] {
	const mpa = mpaContractAddress();
	return [
		{
			signature: 'withdrawVpnCredit(string,bytes32,uint256)',
			contractAddress: mpa,
			args: [
				{name: 'nodeKey', type: 'string', value: nodeKey},
				{name: 'hostBinding', type: 'bytes32', value: String(hostBinding)},
				{name: 'amount', type: 'uint256', value: amountWei.toString()},
			],
		},
	];
}

export function buildSyncBillingActions(keyGenId: string, globalNonce: number): MpaProposalAction[] {
	const mpa = mpaContractAddress();
	return [
		{
			signature: 'syncBilling(string,string,uint256)',
			contractAddress: mpa,
			args: [
				{name: 'keyGenId', type: 'string', value: keyGenId},
				{name: 'addressKind', type: 'string', value: KEY_GEN_ADDRESS_KIND_ETHEREUM},
				{name: 'globalNonceAtActivation', type: 'uint256', value: String(globalNonce)},
			],
		},
	];
}

export function buildKeyGenDepositActions(keyGenId: string, amountWei: bigint): MpaProposalAction[] {
	const mpa = mpaContractAddress();
	return [
		{
			signature: 'deposit(string,string,uint256,uint256)',
			contractAddress: mpa,
			args: [
				{name: 'keyGenId', type: 'string', value: keyGenId},
				{name: 'addressKind', type: 'string', value: KEY_GEN_ADDRESS_KIND_ETHEREUM},
				{name: 'amount', type: 'uint256', value: amountWei.toString()},
				{name: 'globalNonceAtActivation', type: 'uint256', value: MPA_DEPOSIT_ONLY_NONCE},
			],
		},
	];
}

export async function prepareMpaRegisterVpnActions(
	config: NodeSdkConfig,
	input: {keyGenId: string; hostIpAddress: string; nodeKey?: string},
): Promise<SdkResult<MpaPreparedBillingActions>> {
	const exec = await resolveKeyGenExecutor(config, input.keyGenId);
	if (!exec.ok) return exec;
	const vpnHost = await resolveVpnHost(config, input.hostIpAddress, input.nodeKey);
	if (!vpnHost.ok) return vpnHost;
	const client = getMpaPublicClient();
	const feeToken = await fetchFeeTokenAddress(client);
	return {
		ok: true,
		data: {
			actions: buildRegisterVpnActions(vpnHost.data.nodeKey, vpnHost.data.hostBinding),
			feeTokenAddress: feeToken,
		},
	};
}

export async function prepareMpaVpnDepositActions(
	config: NodeSdkConfig,
	input: {
		keyGenId: string;
		hostIpAddress: string;
		amountWei: string;
		activateOnDeposit?: boolean;
		nodeKey?: string;
	},
): Promise<SdkResult<MpaPreparedBillingActions>> {
	const exec = await resolveKeyGenExecutor(config, input.keyGenId);
	if (!exec.ok) return exec;
	const vpnHost = await resolveVpnHost(config, input.hostIpAddress, input.nodeKey);
	if (!vpnHost.ok) return vpnHost;
	const amountWei = BigInt(input.amountWei);
	if (amountWei <= 0n) {
		return {ok: false, reason: 'amountWei must be positive.'};
	}
	const client = getMpaPublicClient();
	const actions: MpaProposalAction[] = [];
	const feeToken = await appendFeeTokenApproveIfNeeded(
		client,
		actions,
		exec.data.billingAddress,
		amountWei,
	);
	actions.push(
		...buildVpnDepositActions({
			nodeKey: vpnHost.data.nodeKey,
			hostBinding: vpnHost.data.hostBinding,
			amountWei,
			activateOnDeposit: input.activateOnDeposit,
		}),
	);
	return {ok: true, data: {actions, feeTokenAddress: feeToken}};
}

export async function prepareMpaSyncVpnBillingActions(
	config: NodeSdkConfig,
	input: {keyGenId: string; hostIpAddress: string; nodeKey?: string},
): Promise<SdkResult<MpaPreparedBillingActions>> {
	const exec = await resolveKeyGenExecutor(config, input.keyGenId);
	if (!exec.ok) return exec;
	const vpnHost = await resolveVpnHost(config, input.hostIpAddress, input.nodeKey);
	if (!vpnHost.ok) return vpnHost;

	const client = getMpaPublicClient();
	const mpa = mpaContractAddress();
	const vpnSub = await client.readContract({
		address: mpa,
		abi: MPA_WALLET_READ_ABI,
		functionName: 'getVpnSubscriptionStatus',
		args: [vpnHost.data.nodeKey, vpnHost.data.hostBinding],
	});
	const [registered, , vpnCreditBalance, vpnMonthlyFee, fundedForCurrentMonth] = vpnSub;

	if (!registered) {
		return {ok: false, reason: 'VPN billing account is not registered.'};
	}
	if (fundedForCurrentMonth) {
		return {ok: false, reason: 'VPN billing month is already active.'};
	}
	if (vpnMonthlyFee === 0n) {
		return {ok: false, reason: 'VPN monthly fee is zero; sync billing is not applicable.'};
	}
	if (vpnCreditBalance < vpnMonthlyFee) {
		return {
			ok: false,
			reason: 'VPN credit pool balance is below the monthly fee; deposit first.',
		};
	}

	const withdrawAuthority = await client.readContract({
		address: mpa,
		abi: MPA_WALLET_READ_ABI,
		functionName: 'getVpnWithdrawAuthority',
		args: [vpnHost.data.nodeKey, vpnHost.data.hostBinding],
	});
	if (!isWithdrawAuthority(exec.data.billingAddress, withdrawAuthority)) {
		return {
			ok: false,
			reason: 'KeyGen executor is not the VPN withdraw authority; sync requires authority.',
		};
	}

	const feeToken = await fetchFeeTokenAddress(client);
	return {
		ok: true,
		data: {
			actions: buildSyncVpnBillingActions(vpnHost.data.nodeKey, vpnHost.data.hostBinding),
			feeTokenAddress: feeToken,
		},
	};
}

export async function prepareMpaSyncBillingActions(
	config: NodeSdkConfig,
	input: {keyGenId: string; globalNonce?: number},
): Promise<SdkResult<MpaPreparedBillingActions>> {
	const exec = await resolveKeyGenExecutor(config, input.keyGenId);
	if (!exec.ok) return exec;

	const client = getMpaPublicClient();
	const mpa = mpaContractAddress();
	const keyGenId = input.keyGenId;

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
	const [, , , nodeCreditBalance, monthlyFee, , , fundedForCurrentMonth] = sub;

	if (fundedForCurrentMonth) {
		return {ok: false, reason: 'KeyGen billing month is already active.'};
	}
	if (monthlyFee === 0n) {
		return {ok: false, reason: 'Monthly fee is zero; sync billing is not applicable.'};
	}
	if (nodeCreditBalance < monthlyFee) {
		return {
			ok: false,
			reason: 'Credit pool balance is below the monthly fee; deposit first.',
		};
	}

	const globalNonce = await resolveGlobalNonce(
		config,
		keyGenId,
		exec.data.billingAddress,
		input.globalNonce,
	);
	if (!globalNonce.ok) return globalNonce;

	const feeToken = await fetchFeeTokenAddress(client);
	return {
		ok: true,
		data: {
			actions: buildSyncBillingActions(keyGenId, globalNonce.data),
			feeTokenAddress: feeToken,
		},
	};
}

export async function prepareMpaKeyGenDepositActions(
	config: NodeSdkConfig,
	input: {
		keyGenId: string;
		amountWei: string;
		activateBillingMonthAfterDeposit?: boolean;
	},
): Promise<SdkResult<MpaPreparedBillingActions>> {
	const exec = await resolveKeyGenExecutor(config, input.keyGenId);
	if (!exec.ok) return exec;

	const amountWei = BigInt(input.amountWei);
	if (amountWei <= 0n) {
		return {ok: false, reason: 'amountWei must be positive.'};
	}

	const client = getMpaPublicClient();
	const mpa = mpaContractAddress();
	const requiredTopUp = await client.readContract({
		address: mpa,
		abi: MPA_WALLET_READ_ABI,
		functionName: 'getRequiredMinimumTopUp',
		args: [input.keyGenId, KEY_GEN_ADDRESS_KIND_ETHEREUM],
	});
	const sub = await client.readContract({
		address: mpa,
		abi: MPA_WALLET_READ_ABI,
		functionName: 'getSubscriptionStatus',
		args: [input.keyGenId, KEY_GEN_ADDRESS_KIND_ETHEREUM],
	});
	const monthlyFee = sub[4];
	const minWei = requiredTopUp > 0n ? requiredTopUp : monthlyFee;
	if (amountWei < minWei) {
		return {
			ok: false,
			reason: `Amount below required minimum top-up (${minWei.toString()} wei).`,
		};
	}

	const eth = exec.data.keyGenResult.ethereumaddress?.trim() ?? '';
	const walletStatus = eth
		? await fetchMergedMpaWalletStatus(config, input.keyGenId, eth)
		: null;

	const actions: MpaProposalAction[] = [];
	const feeToken = await appendFeeTokenApproveIfNeeded(
		client,
		actions,
		exec.data.billingAddress,
		amountWei,
	);
	actions.push(...buildKeyGenDepositActions(input.keyGenId, amountWei));

	const syncAfterDeposit =
		input.activateBillingMonthAfterDeposit === true &&
		walletStatus != null &&
		shouldSyncKeyGenMonthAfterDeposit(walletStatus, amountWei);
	if (syncAfterDeposit) {
		const globalNonce = await resolveGlobalNonce(
			config,
			input.keyGenId,
			exec.data.billingAddress,
		);
		if (!globalNonce.ok) return globalNonce;
		actions.push(...buildSyncBillingActions(input.keyGenId, globalNonce.data));
	}

	return {ok: true, data: {actions, feeTokenAddress: feeToken}};
}

export async function prepareMpaWithdrawVpnCreditActions(
	config: NodeSdkConfig,
	input: {keyGenId: string; hostIpAddress: string; amountWei: string; nodeKey?: string},
): Promise<SdkResult<MpaPreparedBillingActions>> {
	const exec = await resolveKeyGenExecutor(config, input.keyGenId);
	if (!exec.ok) return exec;
	const vpnHost = await resolveVpnHost(config, input.hostIpAddress, input.nodeKey);
	if (!vpnHost.ok) return vpnHost;
	const amountWei = BigInt(input.amountWei);
	if (amountWei <= 0n) {
		return {ok: false, reason: 'amountWei must be positive.'};
	}
	const client = getMpaPublicClient();
	const mpa = mpaContractAddress();
	const withdrawAuthority = await client.readContract({
		address: mpa,
		abi: MPA_WALLET_READ_ABI,
		functionName: 'getVpnWithdrawAuthority',
		args: [vpnHost.data.nodeKey, vpnHost.data.hostBinding],
	});
	if (!isWithdrawAuthority(exec.data.billingAddress, withdrawAuthority)) {
		return {
			ok: false,
			reason: 'KeyGen executor is not the VPN withdraw authority.',
		};
	}
	const feeToken = await fetchFeeTokenAddress(client);
	return {
		ok: true,
		data: {
			actions: buildWithdrawVpnCreditActions(
				vpnHost.data.nodeKey,
				vpnHost.data.hostBinding,
				amountWei,
			),
			feeTokenAddress: feeToken,
		},
	};
}
