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
	MPA_WALLET_CONTRACT_CONFIG,
	MPA_WALLET_READ_ABI,
} from '../../config/mpa-wallet.js';
import type {SdkResult} from '../result.js';
import {MpaTopUpInputSchema} from './schemas.js';
import {fetchGlobalNonceByKeyGenId, fetchKeyGenResult} from '../keygen.js';
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
	input: {keyGenId: string},
): Promise<
	SdkResult<{
		registered: boolean;
		freeTransactionsLeft?: number;
		hasEverDeposited?: boolean;
		remainingDeposit?: string;
		feeTokenSymbol?: string;
		remainingNonces?: number;
		globalNonce?: number;
		error?: string;
	}>
> {
	const kg = await fetchKeyGenResult(config, input.keyGenId);
	if (!kg.ok) return kg;
	const eth = kg.data.ethereumaddress?.trim();
	if (!eth) {
		return {ok: false, reason: 'KeyGen has no ethereum address.'};
	}

	const globalNonceResult = await fetchGlobalNonceByKeyGenId(config, input.keyGenId);
	const globalNonce = globalNonceResult.ok ? globalNonceResult.data : undefined;

	const client = getMpaPublicClient();
	const keyGen = getAddress(eth.startsWith('0x') ? eth : `0x${eth}`) as Address;
	const contractAddress = MPA_WALLET_CONTRACT_CONFIG.contractAddress as Address;

	try {
		const registered = await client.readContract({
			address: contractAddress,
			abi: MPA_WALLET_READ_ABI,
			functionName: 'isRegistered',
			args: [keyGen],
		});
		if (!registered) {
			return {ok: true, data: {registered: false, globalNonce}};
		}

		const [feeToken, freeNonceAllocation] = await client.readContract({
			address: contractAddress,
			abi: MPA_WALLET_READ_ABI,
			functionName: 'getFeeConfigForKeyGen',
			args: [keyGen],
		});

		const currentNonce =
			globalNonce ??
			(await client.getTransactionCount({address: keyGen, blockTag: 'pending'}));
		const freeAllocation = Number(freeNonceAllocation);
		const freeLeft = Math.max(0, freeAllocation - currentNonce);

		if (freeLeft > 0) {
			const remainingNonces = await client.readContract({
				address: contractAddress,
				abi: MPA_WALLET_READ_ABI,
				functionName: 'getRemainingNonces',
				args: [keyGen, BigInt(currentNonce)],
			});
			return {
				ok: true,
				data: {
					registered: true,
					freeTransactionsLeft: freeLeft,
					remainingNonces: Number(remainingNonces),
					globalNonce: currentNonce,
				},
			};
		}

		const [remainingDepositRaw, remainingNonces] = await Promise.all([
			client.readContract({
				address: contractAddress,
				abi: MPA_WALLET_READ_ABI,
				functionName: 'getRemainingDeposit',
				args: [keyGen, BigInt(currentNonce)],
			}),
			client.readContract({
				address: contractAddress,
				abi: MPA_WALLET_READ_ABI,
				functionName: 'getRemainingNonces',
				args: [keyGen, BigInt(currentNonce)],
			}),
		]);
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
		return {
			ok: true,
			data: {
				registered: true,
				freeTransactionsLeft: 0,
				remainingDeposit: (Number(remainingDepositRaw) / 10 ** d).toFixed(
					d > 6 ? 4 : 2,
				),
				feeTokenSymbol: symbol ?? 'TOKEN',
				remainingNonces: Number(remainingNonces),
				globalNonce: currentNonce,
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

	const client = getMpaPublicClient();
	const keyGen = getAddress(eth.startsWith('0x') ? eth : `0x${eth}`) as Address;
	const mpa = MPA_WALLET_CONTRACT_CONFIG.contractAddress as Address;

	const [feeToken, , , minimumDeposit] = await client.readContract({
		address: mpa,
		abi: MPA_WALLET_READ_ABI,
		functionName: 'getFeeConfigForKeyGen',
		args: [keyGen],
	});
	const decimals = await client.readContract({
		address: feeToken,
		abi: ERC20_SYMBOL_DECIMALS_ABI,
		functionName: 'decimals',
	});
	const amountWei = BigInt(parsed.data.amountWei);
	if (amountWei < minimumDeposit) {
		return {
			ok: false,
			reason: `Amount below minimum deposit (${formatUnits(minimumDeposit, Number(decimals ?? 18))}).`,
		};
	}

	const allowance = await client.readContract({
		address: feeToken,
		abi: ERC20_ALLOWANCE_ABI,
		functionName: 'allowance',
		args: [keyGen, mpa],
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
		signature: 'deposit(address,uint256)',
		contractAddress: mpa,
		args: [
			{name: 'keyGen', type: 'address', value: keyGen},
			{name: 'amount', type: 'uint256', value: amountWei.toString()},
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
