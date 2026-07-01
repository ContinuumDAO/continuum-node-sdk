import {
	createPublicClient,
	defineChain,
	formatUnits,
	getAddress,
	http,
	type Address,
} from 'viem';
import type {NodeSdkConfig} from '../../config/schema.js';
import {
	ERC20_ALLOWANCE_ABI,
	KEY_GEN_ADDRESS_KIND_ETHEREUM,
	MPA_DEPOSIT_ONLY_NONCE,
	MPA_WALLET_CONTRACT_CONFIG,
	MPA_WALLET_READ_ABI,
} from '../../config/mpa-wallet.js';
import type {SdkResult} from '../result.js';
import {MpaTopUpInputSchema, MpaWalletStatusInputSchema} from './schemas.js';
import {fetchGlobalNonceByKeyGenId, fetchKeyGenResult} from '../keygen.js';
import {buildMultiSignProposal} from '../../evm/proposal-builder.js';
import {signAndSubmitMultiSignRequest} from './sign-request-body.js';
import {assertExecutorNativeSufficientForProposal} from './gas-preflight.js';
import {fetchMergedMpaWalletStatus, type MpaWalletStatusData} from './mpa-fee-status.js';
import {shouldSyncKeyGenMonthAfterDeposit} from './mpa-billing-helpers.js';

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

export async function getMpaWalletStatus(
	config: NodeSdkConfig,
	input: unknown,
): Promise<SdkResult<MpaWalletStatusData>> {
	const parsed = MpaWalletStatusInputSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			reason: parsed.error.issues[0]?.message ?? 'Invalid MPA wallet status input.',
		};
	}

	const kg = await fetchKeyGenResult(config, parsed.data.keyGenId);
	if (!kg.ok) return kg;
	const eth = kg.data.ethereumaddress?.trim();
	if (!eth) {
		return {ok: false, reason: 'KeyGen has no ethereum address.'};
	}

	try {
		const data = await fetchMergedMpaWalletStatus(config, parsed.data.keyGenId, eth);
		return {ok: true, data};
	} catch (e) {
		return {
			ok: true,
			data: {
				registered: false,
				error: e instanceof Error ? e.message : 'Failed to load MPA wallet status',
			},
		};
	}
}

async function resolveGlobalNonceForSync(
	config: NodeSdkConfig,
	keyGenId: string,
	billingAddress: Address,
): Promise<SdkResult<number>> {
	const fromNode = await fetchGlobalNonceByKeyGenId(config, keyGenId);
	if (fromNode.ok) return fromNode;
	const client = getMpaPublicClient();
	const nonce = await client.getTransactionCount({address: billingAddress, blockTag: 'pending'});
	return {ok: true, data: nonce};
}

export async function createMpaTopUpMultiSignRequest(
	config: NodeSdkConfig,
	input: unknown,
): Promise<SdkResult<{requestId: string}>> {
	const parsed = MpaTopUpInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid MPA top-up input.'};
	}

	const kg = await fetchKeyGenResult(config, parsed.data.keyGenId);
	if (!kg.ok) return kg;
	const eth = kg.data.ethereumaddress?.trim();
	if (!eth) {
		return {ok: false, reason: 'KeyGen has no ethereum address.'};
	}

	const client = getMpaPublicClient();
	const billingAddress = getAddress(eth.startsWith('0x') ? eth : `0x${eth}`) as Address;
	const mpa = MPA_WALLET_CONTRACT_CONFIG.contractAddress as Address;
	const keyGenId = parsed.data.keyGenId;
	const amountWei = BigInt(parsed.data.amountWei);

	const walletStatus = await fetchMergedMpaWalletStatus(config, keyGenId, eth);

	const sub = await client.readContract({
		address: mpa,
		abi: MPA_WALLET_READ_ABI,
		functionName: 'getSubscriptionStatus',
		args: [keyGenId, KEY_GEN_ADDRESS_KIND_ETHEREUM],
	});
	const monthlyFee = sub[4];

	const requiredTopUp = await client.readContract({
		address: mpa,
		abi: MPA_WALLET_READ_ABI,
		functionName: 'getRequiredMinimumTopUp',
		args: [keyGenId, KEY_GEN_ADDRESS_KIND_ETHEREUM],
	});

	const feeToken = await client.readContract({
		address: mpa,
		abi: MPA_WALLET_READ_ABI,
		functionName: 'FEE_TOKEN',
	});
	const decimals = await client.readContract({
		address: feeToken,
		abi: ERC20_SYMBOL_DECIMALS_ABI,
		functionName: 'decimals',
	});
	const minWei = requiredTopUp > 0n ? requiredTopUp : monthlyFee;
	if (amountWei < minWei) {
		return {
			ok: false,
			reason: `Amount below required minimum top-up (${formatUnits(minWei, Number(decimals ?? 18))}).`,
		};
	}

	const globalNonceAtActivation = MPA_DEPOSIT_ONLY_NONCE;

	const allowance = await client.readContract({
		address: feeToken,
		abi: ERC20_ALLOWANCE_ABI,
		functionName: 'allowance',
		args: [billingAddress, mpa],
	});

	const actions: {
		signature: string;
		contractAddress: string;
		args: {name: string; type: string; value: string}[];
	}[] = [];

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

	actions.push({
		signature: 'deposit(string,string,uint256,uint256)',
		contractAddress: mpa,
		args: [
			{name: 'keyGenId', type: 'string', value: keyGenId},
			{name: 'addressKind', type: 'string', value: KEY_GEN_ADDRESS_KIND_ETHEREUM},
			{name: 'amount', type: 'uint256', value: amountWei.toString()},
			{name: 'globalNonceAtActivation', type: 'uint256', value: globalNonceAtActivation},
		],
	});

	const syncAfterDeposit =
		parsed.data.activateBillingMonthAfterDeposit === true &&
		shouldSyncKeyGenMonthAfterDeposit(walletStatus, amountWei);
	if (syncAfterDeposit) {
		const globalNonce = await resolveGlobalNonceForSync(config, keyGenId, billingAddress);
		if (!globalNonce.ok) return globalNonce;
		actions.push({
			signature: 'syncBilling(string,string,uint256)',
			contractAddress: mpa,
			args: [
				{name: 'keyGenId', type: 'string', value: keyGenId},
				{name: 'addressKind', type: 'string', value: KEY_GEN_ADDRESS_KIND_ETHEREUM},
				{name: 'globalNonceAtActivation', type: 'uint256', value: String(globalNonce.data)},
			],
		});
	}

	const purpose =
		parsed.data.purpose ??
		(syncAfterDeposit
			? 'Top up MPA signing credits and activate billing month'
			: 'Top up MPA signing credits');

	const built = await buildMultiSignProposal(config, {
		keyGenResult: kg.data,
		chainId: MPA_WALLET_CONTRACT_CONFIG.chainId,
		purpose,
		useCustomGas: parsed.data.useCustomGas,
		startingNonce: parsed.data.startingNonce,
		actions,
	});
	if (!built.ok) return built;

	const preflight = await assertExecutorNativeSufficientForProposal(config, {
		keyGenResult: kg.data,
		chainId: MPA_WALLET_CONTRACT_CONFIG.chainId,
		proposal: built.data,
	});
	if (!preflight.ok) return preflight;

	return signAndSubmitMultiSignRequest(config, built.data.unsignedBody);
}
