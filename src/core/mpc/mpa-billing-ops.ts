import {
	createPublicClient,
	defineChain,
	getAddress,
	http,
	type Address,
	type PublicClient,
} from 'viem';
import type {NodeSdkConfig} from '../../config/schema.js';
import {
	MPA_WALLET_CONTRACT_CONFIG,
	MPA_WALLET_READ_ABI,
} from '../../config/mpa-wallet.js';
import {feeAddressKindForKeyGen} from './address-kind.js';
import type {SdkResult} from '../result.js';
import {
	MpaOveragePurchaseInputSchema,
	MpaSyncBillingInputSchema,
} from './schemas.js';
import {fetchKeyGenResult} from '../keygen.js';
import {
	appendFeeTokenApproveIfNeeded,
	prepareMpaSyncBillingActions,
	type MpaProposalAction,
} from './mpa-billing-actions.js';
import {buildMultiSignProposal} from '../../evm/proposal-builder.js';
import {signAndSubmitMultiSignRequest} from './sign-request-body.js';
import {assertExecutorNativeSufficientForProposal} from './gas-preflight.js';
import {nodeId} from '../general.js';

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
		executorKeyGenId: parsed.data.executorKeyGenId,
		paymentToken: parsed.data.paymentToken,
	});
	if (!prepared.ok) return prepared;

	const executorId = parsed.data.executorKeyGenId?.trim() || parsed.data.keyGenId;
	const exec = await resolveKeyGenExecutor(config, executorId);
	if (!exec.ok) return exec;

	return submitMpaProposal(config, {
		keyGenResult: exec.data.keyGenResult,
		purpose:
			parsed.data.purpose ??
			(prepared.data.includedDeposit
				? 'Top up KeyGen credit and activate billing month'
				: 'Activate KeyGen MPA billing month'),
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

	const self = await nodeId(config);
	if (!self.ok) return self;
	const nodeKey = self.data.nodeId;
	const addressKind = feeAddressKindForKeyGen(exec.data.keyGenResult as Record<string, unknown>);

	const registered = await client.readContract({
		address: mpa,
		abi: MPA_WALLET_READ_ABI,
		functionName: 'isKeyGenRegistered',
		args: [keyGenId, addressKind, nodeKey],
	});
	if (!registered) {
		return {ok: false, reason: 'KeyGen is not registered with MPA wallet.'};
	}

	const [sub, rates] = await Promise.all([
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
	]);
	const [, , , , nodeCreditBalance, fundedForCurrentMonth] = sub;
	const overageFeePerSignature = rates[2];

	if (!fundedForCurrentMonth) {
		return {ok: false, reason: 'Billing month must be active before purchasing overage.'};
	}

	const requiredTopUp = await client.readContract({
		address: mpa,
		abi: MPA_WALLET_READ_ABI,
		functionName: 'getRequiredMinimumTopUp',
		args: [keyGenId, addressKind, nodeKey],
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
		functionName: 'getNodeWithdrawAuthority',
		args: [nodeKey],
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
		signature: 'purchaseOverageSignatures(string,string,string,uint256)',
		contractAddress: mpa,
		args: [
			{name: 'keyGenId', type: 'string', value: keyGenId},
			{name: 'addressKind', type: 'string', value: addressKind},
			{name: 'nodeKey', type: 'string', value: nodeKey},
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
