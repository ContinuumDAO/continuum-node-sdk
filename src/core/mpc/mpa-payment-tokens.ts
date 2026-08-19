import {createPublicClient, defineChain, http, type Address, type PublicClient} from 'viem';
import {MPA_WALLET_CONTRACT_CONFIG, MPA_WALLET_READ_ABI} from '../../config/mpa-wallet.js';

export type MpaPaymentTokenKind = 'fee' | 'ctm';

export type MpaPaymentTokenMeta = {
	feeTokenAddress: Address;
	feeTokenSymbol: string;
	feeTokenDecimals: number;
	ctmTokenAddress: Address;
	ctmTokenSymbol: string;
	ctmTokenDecimals: number;
	ctmPaymentsPaused: boolean;
};

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

let cachedMeta: MpaPaymentTokenMeta | null = null;
let cachedMetaAt = 0;
const META_TTL_MS = 5 * 60 * 1000;

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

async function readErc20Meta(
	client: PublicClient,
	token: Address,
	fallbackSymbol: string,
): Promise<{symbol: string; decimals: number}> {
	try {
		const [symbol, decimals] = await Promise.all([
			client.readContract({address: token, abi: ERC20_SYMBOL_DECIMALS_ABI, functionName: 'symbol'}),
			client.readContract({address: token, abi: ERC20_SYMBOL_DECIMALS_ABI, functionName: 'decimals'}),
		]);
		return {symbol: symbol?.trim() || fallbackSymbol, decimals: Number(decimals ?? 18)};
	} catch {
		return {symbol: fallbackSymbol, decimals: 18};
	}
}

/** Live FEE_TOKEN / CTM metadata. Cached briefly so UIs and MCP tools reuse the on-chain symbols. */
export async function fetchMpaPaymentTokenMeta(): Promise<MpaPaymentTokenMeta> {
	const now = Date.now();
	if (cachedMeta && now - cachedMetaAt < META_TTL_MS) return cachedMeta;
	const client = getMpaPublicClient();
	const mpa = MPA_WALLET_CONTRACT_CONFIG.contractAddress as Address;
	const [feeTokenAddress, ctmTokenAddress, ctmPaymentsPaused] = await Promise.all([
		client.readContract({address: mpa, abi: MPA_WALLET_READ_ABI, functionName: 'FEE_TOKEN'}),
		client.readContract({address: mpa, abi: MPA_WALLET_READ_ABI, functionName: 'ctm'}),
		client.readContract({address: mpa, abi: MPA_WALLET_READ_ABI, functionName: 'ctmPaymentsPaused'}),
	]);
	const [fee, ctm] = await Promise.all([
		readErc20Meta(client, feeTokenAddress, 'fee token'),
		readErc20Meta(client, ctmTokenAddress, 'CTM'),
	]);
	cachedMeta = {
		feeTokenAddress,
		feeTokenSymbol: fee.symbol,
		feeTokenDecimals: fee.decimals,
		ctmTokenAddress,
		ctmTokenSymbol: ctm.symbol,
		ctmTokenDecimals: ctm.decimals,
		ctmPaymentsPaused: Boolean(ctmPaymentsPaused),
	};
	cachedMetaAt = now;
	return cachedMeta;
}

/** Display the stored on-chain fee-token symbol; never assume USDC. */
export function storedFeeTokenSymbol(symbol?: string | null): string {
	const trimmed = symbol?.trim();
	return trimmed ? trimmed : 'fee token';
}

/** Matches MultiSignAgentWallet `CTM_FEE_RATE_SCALE`. */
export const CTM_FEE_RATE_SCALE = 1000n;

export function ctmAmountForFee(feeAmount: bigint, ctmPerFeeToken: bigint): bigint {
	if (feeAmount === 0n || ctmPerFeeToken === 0n) return 0n;
	return (feeAmount * ctmPerFeeToken) / CTM_FEE_RATE_SCALE;
}

export function feeAmountForCtm(ctmCredit: bigint, ctmPerFeeToken: bigint): bigint {
	if (ctmCredit === 0n || ctmPerFeeToken === 0n) return 0n;
	return (ctmCredit * CTM_FEE_RATE_SCALE) / ctmPerFeeToken;
}

export type VpnMonthShortfall = {
	requiredMinimumTopUpWei: bigint;
	requiredMinimumTopUpCtmWei: bigint;
};

/** Fee-token and CTM shortfalls after existing fee+CTM coverage (same debit order as `_debitNodeFee`). */
export function vpnMonthShortfalls(input: {
	feeCreditWei: bigint;
	ctmCreditWei: bigint;
	monthlyFeeWei: bigint;
	ctmPerFeeToken: bigint;
	ctmPaymentsPaused: boolean;
}): VpnMonthShortfall {
	if (input.monthlyFeeWei === 0n) {
		return {requiredMinimumTopUpWei: 0n, requiredMinimumTopUpCtmWei: 0n};
	}
	const ctmCovered =
		!input.ctmPaymentsPaused && input.ctmPerFeeToken !== 0n
			? feeAmountForCtm(input.ctmCreditWei, input.ctmPerFeeToken)
			: 0n;
	const covered = input.feeCreditWei + ctmCovered;
	if (covered >= input.monthlyFeeWei) {
		return {requiredMinimumTopUpWei: 0n, requiredMinimumTopUpCtmWei: 0n};
	}
	const feeShort = input.monthlyFeeWei - covered;
	const ctmShort =
		input.ctmPaymentsPaused || input.ctmPerFeeToken === 0n
			? 0n
			: ctmAmountForFee(feeShort, input.ctmPerFeeToken);
	return {requiredMinimumTopUpWei: feeShort, requiredMinimumTopUpCtmWei: ctmShort};
}

export type VpnMonthCoverage = VpnMonthShortfall & {
	meta: MpaPaymentTokenMeta;
	ctmCreditWei: bigint;
	ctmPerFeeToken: bigint;
};

export async function fetchVpnMonthCoverage(
	nodeKey: string,
	feeCreditWei: bigint,
	monthlyFeeWei: bigint,
): Promise<VpnMonthCoverage> {
	const meta = await fetchMpaPaymentTokenMeta();
	const client = getMpaPublicClient();
	const mpa = MPA_WALLET_CONTRACT_CONFIG.contractAddress as Address;
	const [ctmCreditWei, ctmPerFeeToken] = await Promise.all([
		client.readContract({
			address: mpa,
			abi: MPA_WALLET_READ_ABI,
			functionName: 'getNodeCtmCreditBalance',
			args: [nodeKey],
		}),
		client.readContract({
			address: mpa,
			abi: MPA_WALLET_READ_ABI,
			functionName: 'ctmPerFeeToken',
		}),
	]);
	const shorts = vpnMonthShortfalls({
		feeCreditWei,
		ctmCreditWei,
		monthlyFeeWei,
		ctmPerFeeToken,
		ctmPaymentsPaused: meta.ctmPaymentsPaused,
	});
	return {...shorts, meta, ctmCreditWei, ctmPerFeeToken};
}
