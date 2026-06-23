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
	MPA_WALLET_CONTRACT_CONFIG,
	MPA_WALLET_READ_ABI,
} from '../../config/mpa-wallet.js';
import type {SdkResult} from '../result.js';
import {MpaTopUpInputSchema, MpaWalletStatusInputSchema} from './schemas.js';
import {fetchGlobalNonceByKeyGenId, fetchKeyGenResult} from '../keygen.js';
import {nodeId} from '../general.js';
import {buildMultiSignProposal} from '../../evm/proposal-builder.js';
import {signAndSubmitMultiSignRequest} from './sign-request-body.js';
import {assertExecutorNativeSufficientForProposal} from './gas-preflight.js';

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
): Promise<
	SdkResult<{
		registered: boolean;
		freeTransactionsLeft?: number;
		hasEverDeposited?: boolean;
		remainingDeposit?: string;
		feeTokenSymbol?: string;
		remainingNonces?: number;
		globalNonce?: number;
		requiredMinimumTopUpWei?: string;
		monthlyFee?: string;
		error?: string;
	}>
> {
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

	const globalNonceResult = await fetchGlobalNonceByKeyGenId(config, parsed.data.keyGenId);
	const globalNonce = globalNonceResult.ok ? globalNonceResult.data : undefined;

	const client = getMpaPublicClient();
	const billingAddress = getAddress(eth.startsWith('0x') ? eth : `0x${eth}`) as Address;
	const contractAddress = MPA_WALLET_CONTRACT_CONFIG.contractAddress as Address;
	const keyGenId = parsed.data.keyGenId;

	try {
		const registered = await client.readContract({
			address: contractAddress,
			abi: MPA_WALLET_READ_ABI,
			functionName: 'isKeyGenRegistered',
			args: [keyGenId, KEY_GEN_ADDRESS_KIND_ETHEREUM, billingAddress],
		});
		if (!registered) {
			return {ok: true, data: {registered: false, globalNonce}};
		}

		const sub = await client.readContract({
			address: contractAddress,
			abi: MPA_WALLET_READ_ABI,
			functionName: 'getSubscriptionStatus',
			args: [keyGenId, KEY_GEN_ADDRESS_KIND_ETHEREUM, billingAddress],
		});
		const [, , , signatureCountAtMonthStart, nodeCreditBalance, monthlyFee, freeSignaturesPerMonth, , fundedForCurrentMonth] = sub;

		const currentNonce =
			globalNonce ??
			(await client.getTransactionCount({address: billingAddress, blockTag: 'pending'}));

		const [remainingNonces, requiredTopUp] = await Promise.all([
			client.readContract({
				address: contractAddress,
				abi: MPA_WALLET_READ_ABI,
				functionName: 'getRemainingNonces',
				args: [keyGenId, KEY_GEN_ADDRESS_KIND_ETHEREUM, billingAddress, BigInt(currentNonce)],
			}),
			client.readContract({
				address: contractAddress,
				abi: MPA_WALLET_READ_ABI,
				functionName: 'getRequiredMinimumTopUp',
				args: [keyGenId, KEY_GEN_ADDRESS_KIND_ETHEREUM, billingAddress],
			}),
		]);

		const feeToken = await client.readContract({
			address: contractAddress,
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
		const d = Number(decimals ?? 18);

		const usedThisMonth = Math.max(0, currentNonce - Number(signatureCountAtMonthStart));
		const freeLeft = fundedForCurrentMonth
			? Math.max(0, Number(freeSignaturesPerMonth) - usedThisMonth)
			: 0;

		return {
			ok: true,
			data: {
				registered: true,
				freeTransactionsLeft: freeLeft,
				remainingDeposit: formatUnits(nodeCreditBalance, d),
				feeTokenSymbol: symbol ?? 'TOKEN',
				remainingNonces: Number(remainingNonces),
				globalNonce: currentNonce,
				requiredMinimumTopUpWei: requiredTopUp.toString(),
				monthlyFee: formatUnits(monthlyFee, d),
				hasEverDeposited: nodeCreditBalance > 0n,
			},
		};
	} catch (e) {
		return {
			ok: true,
			data: {
				registered: false,
				error: e instanceof Error ? e.message : 'Failed to load MPA wallet status',
				globalNonce,
			},
		};
	}
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

	const nk = await nodeId(config);
	if (!nk.ok) return nk;

	const client = getMpaPublicClient();
	const billingAddress = getAddress(eth.startsWith('0x') ? eth : `0x${eth}`) as Address;
	const mpa = MPA_WALLET_CONTRACT_CONFIG.contractAddress as Address;
	const keyGenId = parsed.data.keyGenId;

	const sub = await client.readContract({
		address: mpa,
		abi: MPA_WALLET_READ_ABI,
		functionName: 'getSubscriptionStatus',
		args: [keyGenId, KEY_GEN_ADDRESS_KIND_ETHEREUM, billingAddress],
	});
	const monthlyFee = sub[5];

	const [requiredTopUp, globalNonceResult] = await Promise.all([
		client.readContract({
			address: mpa,
			abi: MPA_WALLET_READ_ABI,
			functionName: 'getRequiredMinimumTopUp',
			args: [keyGenId, KEY_GEN_ADDRESS_KIND_ETHEREUM, billingAddress],
		}),
		fetchGlobalNonceByKeyGenId(config, keyGenId),
	]);

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
	const amountWei = BigInt(parsed.data.amountWei);
	const minWei = requiredTopUp > 0n ? requiredTopUp : monthlyFee;
	if (amountWei < minWei) {
		return {
			ok: false,
			reason: `Amount below required minimum top-up (${formatUnits(minWei, Number(decimals ?? 18))}).`,
		};
	}

	const globalNonceAtActivation = globalNonceResult.ok ? globalNonceResult.data : 0;

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
		signature: 'deposit(string,string,string,uint256,uint256)',
		contractAddress: mpa,
		args: [
			{name: 'keyGenId', type: 'string', value: keyGenId},
			{name: 'addressKind', type: 'string', value: KEY_GEN_ADDRESS_KIND_ETHEREUM},
			{name: 'nodeKey', type: 'string', value: nk.data.nodeId},
			{name: 'amount', type: 'uint256', value: amountWei.toString()},
			{name: 'globalNonceAtActivation', type: 'uint256', value: String(globalNonceAtActivation)},
		],
	});

	const built = await buildMultiSignProposal(config, {
		keyGenResult: kg.data,
		chainId: MPA_WALLET_CONTRACT_CONFIG.chainId,
		purpose: parsed.data.purpose ?? 'Top up MPA signing credits',
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
