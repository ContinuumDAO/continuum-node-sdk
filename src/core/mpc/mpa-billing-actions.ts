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
	MPA_WALLET_CONTRACT_CONFIG,
	MPA_WALLET_READ_ABI,
} from '../../config/mpa-wallet.js';
import {fetchKeyGenResult} from '../keygen-read.js';
import {fetchGlobalNonceByKeyGenId} from '../keygen-read.js';
import type {SdkResult} from '../result.js';
import {computeVpnHostBinding} from '../vpn/vpn-host-binding.js';
import {shouldSyncKeyGenMonthAfterDeposit} from './mpa-billing-helpers.js';
import {fetchKeyGenMonthActivationWaived, fetchMergedMpaWalletStatus} from './mpa-fee-status.js';
import {
	fetchMpaPaymentTokenMeta,
	fetchVpnMonthCoverage,
	vpnMonthShortfalls,
	type MpaPaymentTokenKind,
} from './mpa-payment-tokens.js';
import {nodeId} from '../general.js';
import {feeAddressKindForKeyGen} from './address-kind.js';

export type MpaProposalAction = {
	signature: string;
	contractAddress: string;
	args: {name: string; type: string; value: string}[];
};

export type MpaPreparedBillingActions = {
	actions: MpaProposalAction[];
	feeTokenAddress: Address;
	includedDeposit?: boolean;
	paymentToken?: MpaPaymentTokenKind;
};

function getMpaPublicClient(): PublicClient {
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

export async function appendErc20ApproveIfNeeded(
	client: PublicClient,
	actions: MpaProposalAction[],
	billingAddress: Address,
	token: Address,
	amountWei: bigint,
): Promise<Address> {
	const mpa = mpaContractAddress();
	const allowance = await client.readContract({
		address: token,
		abi: ERC20_ALLOWANCE_ABI,
		functionName: 'allowance',
		args: [billingAddress, mpa],
	});
	if (allowance < amountWei) {
		actions.push({
			signature: 'approve(address,uint256)',
			contractAddress: token,
			args: [
				{name: 'spender', type: 'address', value: mpa},
				{name: 'amount', type: 'uint256', value: amountWei.toString()},
			],
		});
	}
	return token;
}

export async function appendFeeTokenApproveIfNeeded(
	client: PublicClient,
	actions: MpaProposalAction[],
	billingAddress: Address,
	amountWei: bigint,
): Promise<Address> {
	const feeToken = await fetchFeeTokenAddress(client);
	return appendErc20ApproveIfNeeded(client, actions, billingAddress, feeToken, amountWei);
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
			signature: 'deposit(string,uint256)',
			contractAddress: mpa,
			args: [
				{name: 'nodeKey', type: 'string', value: input.nodeKey},
				{name: 'amount', type: 'uint256', value: input.amountWei.toString()},
			],
		},
	];
}

export function buildWithdrawVpnCreditActions(
	nodeKey: string,
	_hostBinding: Hex | string,
	amountWei: bigint,
): MpaProposalAction[] {
	const mpa = mpaContractAddress();
	return [
		{
			signature: 'withdrawCredit(string,uint256)',
			contractAddress: mpa,
			args: [
				{name: 'nodeKey', type: 'string', value: nodeKey},
				{name: 'amount', type: 'uint256', value: amountWei.toString()},
			],
		},
	];
}

export function buildWithdrawCtmCreditActions(nodeKey: string, amountWei: bigint): MpaProposalAction[] {
	const mpa = mpaContractAddress();
	return [
		{
			signature: 'withdrawCtmCredit(string,uint256)',
			contractAddress: mpa,
			args: [
				{name: 'nodeKey', type: 'string', value: nodeKey},
				{name: 'amount', type: 'uint256', value: amountWei.toString()},
			],
		},
	];
}

export function buildSyncBillingActions(
	keyGenId: string,
	globalNonce: number,
	addressKind: string,
	nodeKey: string,
): MpaProposalAction[] {
	const mpa = mpaContractAddress();
	return [
		{
			signature: 'syncBilling(string,string,string,uint256)',
			contractAddress: mpa,
			args: [
				{name: 'keyGenId', type: 'string', value: keyGenId},
				{name: 'addressKind', type: 'string', value: addressKind},
				{name: 'nodeKey', type: 'string', value: nodeKey},
				{name: 'globalNonceAtActivation', type: 'uint256', value: String(globalNonce)},
			],
		},
	];
}

export function buildKeyGenDepositActions(nodeKey: string, amountWei: bigint): MpaProposalAction[] {
	const mpa = mpaContractAddress();
	return [
		{
			signature: 'deposit(string,uint256)',
			contractAddress: mpa,
			args: [
				{name: 'nodeKey', type: 'string', value: nodeKey},
				{name: 'amount', type: 'uint256', value: amountWei.toString()},
			],
		},
	];
}

export function buildKeyGenDepositCtmActions(nodeKey: string, amountWei: bigint): MpaProposalAction[] {
	const mpa = mpaContractAddress();
	return [
		{
			signature: 'depositCtm(string,uint256)',
			contractAddress: mpa,
			args: [
				{name: 'nodeKey', type: 'string', value: nodeKey},
				{name: 'amount', type: 'uint256', value: amountWei.toString()},
			],
		},
	];
}

export function buildRegisterKeyGenActions(
	keyGenId: string,
	addressKind: string,
	nodeKey: string,
	globalNonce: number,
	groupId = '',
): MpaProposalAction[] {
	const mpa = mpaContractAddress();
	return [
		{
			signature: 'register(string,string,string,uint256,string)',
			contractAddress: mpa,
			args: [
				{name: 'keyGenId', type: 'string', value: keyGenId},
				{name: 'addressKind', type: 'string', value: addressKind},
				{name: 'nodeKey', type: 'string', value: nodeKey},
				{name: 'globalNonceAtActivation', type: 'uint256', value: String(globalNonce)},
				{name: 'groupId', type: 'string', value: groupId},
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
		paymentToken?: MpaPaymentTokenKind;
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
	const paymentToken: MpaPaymentTokenKind = input.paymentToken === 'ctm' ? 'ctm' : 'fee';
	const client = getMpaPublicClient();
	const meta = await fetchMpaPaymentTokenMeta();
	if (paymentToken === 'ctm' && meta.ctmPaymentsPaused) {
		return {ok: false, reason: 'CTM payments are paused on the fee contract.'};
	}
	const actions: MpaProposalAction[] = [];
	const payToken = paymentToken === 'ctm' ? meta.ctmTokenAddress : meta.feeTokenAddress;
	await appendErc20ApproveIfNeeded(
		client,
		actions,
		exec.data.billingAddress,
		payToken,
		amountWei,
	);
	if (paymentToken === 'ctm') {
		actions.push(...buildKeyGenDepositCtmActions(vpnHost.data.nodeKey, amountWei));
	} else {
		actions.push(
			...buildVpnDepositActions({
				nodeKey: vpnHost.data.nodeKey,
				hostBinding: vpnHost.data.hostBinding,
				amountWei,
			}),
		);
	}
	if (input.activateOnDeposit) {
		const vpnSub = await client.readContract({
			address: mpaContractAddress(),
			abi: MPA_WALLET_READ_ABI,
			functionName: 'getVpnSubscriptionStatus',
			args: [vpnHost.data.nodeKey, vpnHost.data.hostBinding],
		});
		const [registered, , vpnCreditBalance, vpnMonthlyFee, fundedForCurrentMonth] = vpnSub;
		if (registered && !fundedForCurrentMonth) {
			const coverage = await fetchVpnMonthCoverage(
				vpnHost.data.nodeKey,
				vpnCreditBalance,
				vpnMonthlyFee,
			);
			const after = vpnMonthShortfalls({
				feeCreditWei:
					paymentToken === 'fee' ? vpnCreditBalance + amountWei : vpnCreditBalance,
				ctmCreditWei:
					paymentToken === 'ctm' ? coverage.ctmCreditWei + amountWei : coverage.ctmCreditWei,
				monthlyFeeWei: vpnMonthlyFee,
				ctmPerFeeToken: coverage.ctmPerFeeToken,
				ctmPaymentsPaused: coverage.meta.ctmPaymentsPaused,
			});
			if (after.requiredMinimumTopUpWei === 0n) {
				actions.push(
					...buildSyncVpnBillingActions(vpnHost.data.nodeKey, vpnHost.data.hostBinding),
				);
			}
		}
	}
	return {
		ok: true,
		data: {actions, feeTokenAddress: meta.feeTokenAddress, paymentToken},
	};
}

export async function prepareMpaSyncVpnBillingActions(
	config: NodeSdkConfig,
	input: {
		keyGenId: string;
		hostIpAddress: string;
		nodeKey?: string;
		paymentToken?: MpaPaymentTokenKind;
	},
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

	const withdrawAuthority = await client.readContract({
		address: mpa,
		abi: MPA_WALLET_READ_ABI,
		functionName: 'getNodeWithdrawAuthority',
		args: [vpnHost.data.nodeKey],
	});
	if (!isWithdrawAuthority(exec.data.billingAddress, withdrawAuthority)) {
		return {
			ok: false,
			reason: 'KeyGen executor is not the node withdraw authority; claim authority first.',
		};
	}

	const paymentToken: MpaPaymentTokenKind = input.paymentToken === 'ctm' ? 'ctm' : 'fee';
	const coverage = await fetchVpnMonthCoverage(
		vpnHost.data.nodeKey,
		vpnCreditBalance,
		vpnMonthlyFee,
	);
	if (paymentToken === 'ctm' && coverage.meta.ctmPaymentsPaused) {
		return {ok: false, reason: 'CTM payments are paused on the fee contract.'};
	}

	const actions: MpaProposalAction[] = [];
	let includedDeposit = false;
	if (coverage.requiredMinimumTopUpWei > 0n) {
		if (paymentToken === 'ctm') {
			if (coverage.requiredMinimumTopUpCtmWei === 0n) {
				return {
					ok: false,
					reason: 'VPN month cannot be paid in CTM at the current rate; deposit the fee token.',
				};
			}
			await appendErc20ApproveIfNeeded(
				client,
				actions,
				exec.data.billingAddress,
				coverage.meta.ctmTokenAddress,
				coverage.requiredMinimumTopUpCtmWei,
			);
			actions.push(
				...buildKeyGenDepositCtmActions(
					vpnHost.data.nodeKey,
					coverage.requiredMinimumTopUpCtmWei,
				),
			);
		} else {
			await appendErc20ApproveIfNeeded(
				client,
				actions,
				exec.data.billingAddress,
				coverage.meta.feeTokenAddress,
				coverage.requiredMinimumTopUpWei,
			);
			actions.push(
				...buildVpnDepositActions({
					nodeKey: vpnHost.data.nodeKey,
					hostBinding: vpnHost.data.hostBinding,
					amountWei: coverage.requiredMinimumTopUpWei,
				}),
			);
		}
		includedDeposit = true;
	}

	actions.push(...buildSyncVpnBillingActions(vpnHost.data.nodeKey, vpnHost.data.hostBinding));
	return {
		ok: true,
		data: {
			actions,
			feeTokenAddress: coverage.meta.feeTokenAddress,
			includedDeposit,
			paymentToken,
		},
	};
}

export async function prepareMpaSyncBillingActions(
	config: NodeSdkConfig,
	input: {
		keyGenId: string;
		globalNonce?: number;
		executorKeyGenId?: string;
		paymentToken?: MpaPaymentTokenKind;
	},
): Promise<SdkResult<MpaPreparedBillingActions>> {
	const targetKg = await fetchKeyGenResult(config, input.keyGenId);
	if (!targetKg.ok) return targetKg;

	const executorId = input.executorKeyGenId?.trim() || input.keyGenId;
	const exec = await resolveKeyGenExecutor(config, executorId);
	if (!exec.ok) return exec;

	const client = getMpaPublicClient();
	const mpa = mpaContractAddress();
	const keyGenId = input.keyGenId;

	const nodeKeyRes = await resolveNodeKey(config);
	if (!nodeKeyRes.ok) return nodeKeyRes;
	const nodeKey = nodeKeyRes.data;
	const addressKind = feeAddressKindForKeyGen(targetKg.data as Record<string, unknown>);

	const withdrawAuthority = await client.readContract({
		address: mpa,
		abi: MPA_WALLET_READ_ABI,
		functionName: 'getNodeWithdrawAuthority',
		args: [nodeKey],
	});
	if (!isWithdrawAuthority(exec.data.billingAddress, withdrawAuthority)) {
		return {
			ok: false,
			reason:
				`KeyGen executor must be the node withdraw authority (${String(withdrawAuthority)}). ` +
				'Pass executorKeyGenId of the claimed authority secp256k1 KeyGen.',
		};
	}

	const registered = await client.readContract({
		address: mpa,
		abi: MPA_WALLET_READ_ABI,
		functionName: 'isKeyGenRegistered',
		args: [keyGenId, addressKind, nodeKey],
	});
	if (!registered) {
		return {ok: false, reason: 'KeyGen is not registered with MPA wallet.'};
	}

	const paymentToken: MpaPaymentTokenKind = input.paymentToken === 'ctm' ? 'ctm' : 'fee';
	const [sub, rates, requiredTopUp, requiredTopUpCtm] = await Promise.all([
		client.readContract({
			address: mpa,
			abi: MPA_WALLET_READ_ABI,
			functionName: 'getSubscriptionStatus',
			args: [keyGenId, addressKind, nodeKey],
		}),
		client.readContract({
			address: mpa,
			abi: MPA_WALLET_READ_ABI,
			functionName: 'getActiveRates',
		}),
		client.readContract({
			address: mpa,
			abi: MPA_WALLET_READ_ABI,
			functionName: 'getRequiredMinimumTopUp',
			args: [keyGenId, addressKind, nodeKey],
		}),
		client.readContract({
			address: mpa,
			abi: MPA_WALLET_READ_ABI,
			functionName: 'getRequiredMinimumTopUpCtm',
			args: [keyGenId, addressKind, nodeKey],
		}),
	]);
	const [, , , , nodeCreditBalance, fundedForCurrentMonth] = sub;
	const monthlyFee = rates[0];
	const waiver = await fetchKeyGenMonthActivationWaived(keyGenId, addressKind, nodeKey);
	const meta = await fetchMpaPaymentTokenMeta();

	if (fundedForCurrentMonth) {
		return {ok: false, reason: 'KeyGen billing month is already active.'};
	}

	const actions: MpaProposalAction[] = [];
	let includedDeposit = false;
	if (!waiver.monthActivationWaived) {
		if (monthlyFee === 0n) {
			return {ok: false, reason: 'Monthly fee is zero; sync billing is not applicable.'};
		}
		if (paymentToken === 'ctm') {
			if (meta.ctmPaymentsPaused) {
				return {ok: false, reason: 'CTM payments are paused on the fee contract.'};
			}
			if (requiredTopUpCtm > 0n) {
				await appendErc20ApproveIfNeeded(
					client,
					actions,
					exec.data.billingAddress,
					meta.ctmTokenAddress,
					requiredTopUpCtm,
				);
				actions.push(...buildKeyGenDepositCtmActions(nodeKey, requiredTopUpCtm));
				includedDeposit = true;
			}
		} else {
			const shortfall =
				requiredTopUp > 0n
					? requiredTopUp
					: nodeCreditBalance < monthlyFee
						? monthlyFee - nodeCreditBalance
						: 0n;
			if (shortfall > 0n) {
				await appendErc20ApproveIfNeeded(
					client,
					actions,
					exec.data.billingAddress,
					meta.feeTokenAddress,
					shortfall,
				);
				actions.push(...buildKeyGenDepositActions(nodeKey, shortfall));
				includedDeposit = true;
			}
		}
	}

	const targetEth = targetKg.data.ethereumaddress?.trim();
	const nonceAddress = targetEth
		? billingAddressFromEth(targetEth)
		: exec.data.billingAddress;
	const globalNonce = await resolveGlobalNonce(config, keyGenId, nonceAddress, input.globalNonce);
	if (!globalNonce.ok) return globalNonce;

	actions.push(...buildSyncBillingActions(keyGenId, globalNonce.data, addressKind, nodeKey));
	return {
		ok: true,
		data: {
			actions,
			feeTokenAddress: meta.feeTokenAddress,
			includedDeposit,
			paymentToken,
		},
	};
}

export async function prepareMpaKeyGenDepositActions(
	config: NodeSdkConfig,
	input: {
		keyGenId: string;
		amountWei: string;
		activateBillingMonthAfterDeposit?: boolean;
		paymentToken?: MpaPaymentTokenKind;
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
	const nodeKeyRes = await resolveNodeKey(config);
	if (!nodeKeyRes.ok) return nodeKeyRes;
	const nodeKey = nodeKeyRes.data;
	const addressKind = feeAddressKindForKeyGen(exec.data.keyGenResult as Record<string, unknown>);
	const paymentToken: MpaPaymentTokenKind = input.paymentToken === 'ctm' ? 'ctm' : 'fee';
	const meta = await fetchMpaPaymentTokenMeta();
	if (paymentToken === 'ctm' && meta.ctmPaymentsPaused) {
		return {ok: false, reason: 'CTM payments are paused on the fee contract.'};
	}
	const requiredTopUp = await client.readContract({
		address: mpa,
		abi: MPA_WALLET_READ_ABI,
		functionName: paymentToken === 'ctm' ? 'getRequiredMinimumTopUpCtm' : 'getRequiredMinimumTopUp',
		args: [input.keyGenId, addressKind, nodeKey],
	});
	const [sub, rates] = await Promise.all([
		client.readContract({
			address: mpa,
			abi: MPA_WALLET_READ_ABI,
			functionName: 'getSubscriptionStatus',
			args: [input.keyGenId, addressKind, nodeKey],
		}),
		client.readContract({
			address: mpa,
			abi: MPA_WALLET_READ_ABI,
			functionName: 'getActiveRates',
		}),
	]);
	void sub;
	const monthlyFee = rates[0];
	const minWei = requiredTopUp > 0n ? requiredTopUp : paymentToken === 'ctm' ? 0n : monthlyFee;
	if (minWei > 0n && amountWei < minWei) {
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
	const payToken = paymentToken === 'ctm' ? meta.ctmTokenAddress : meta.feeTokenAddress;
	await appendErc20ApproveIfNeeded(
		client,
		actions,
		exec.data.billingAddress,
		payToken,
		amountWei,
	);
	actions.push(
		...(paymentToken === 'ctm'
			? buildKeyGenDepositCtmActions(nodeKey, amountWei)
			: buildKeyGenDepositActions(nodeKey, amountWei)),
	);

	const syncAfterDeposit =
		input.activateBillingMonthAfterDeposit === true &&
		walletStatus != null &&
		shouldSyncKeyGenMonthAfterDeposit(walletStatus, amountWei, paymentToken);
	if (syncAfterDeposit) {
		const globalNonce = await resolveGlobalNonce(
			config,
			input.keyGenId,
			exec.data.billingAddress,
		);
		if (!globalNonce.ok) return globalNonce;
		actions.push(...buildSyncBillingActions(input.keyGenId, globalNonce.data, addressKind, nodeKey));
	}

	return {
		ok: true,
		data: {actions, feeTokenAddress: meta.feeTokenAddress, paymentToken},
	};
}

export async function prepareMpaWithdrawVpnCreditActions(
	config: NodeSdkConfig,
	input: {
		keyGenId: string;
		hostIpAddress: string;
		amountWei: string;
		nodeKey?: string;
		paymentToken?: MpaPaymentTokenKind;
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
	const mpa = mpaContractAddress();
	const withdrawAuthority = await client.readContract({
		address: mpa,
		abi: MPA_WALLET_READ_ABI,
		functionName: 'getNodeWithdrawAuthority',
		args: [vpnHost.data.nodeKey],
	});
	if (!isWithdrawAuthority(exec.data.billingAddress, withdrawAuthority)) {
		return {
			ok: false,
			reason: 'KeyGen executor is not the node withdraw authority.',
		};
	}
	const paymentToken: MpaPaymentTokenKind = input.paymentToken === 'ctm' ? 'ctm' : 'fee';
	const meta = await fetchMpaPaymentTokenMeta();
	return {
		ok: true,
		data: {
			actions:
				paymentToken === 'ctm'
					? buildWithdrawCtmCreditActions(vpnHost.data.nodeKey, amountWei)
					: buildWithdrawVpnCreditActions(
							vpnHost.data.nodeKey,
							vpnHost.data.hostBinding,
							amountWei,
						),
			feeTokenAddress: meta.feeTokenAddress,
			paymentToken,
		},
	};
}
