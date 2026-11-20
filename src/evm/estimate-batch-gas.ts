import type {Address, Hex, PublicClient} from 'viem';
import {toHex} from 'viem';
import {applyEstimateGasHeadroom} from './tx-params.js';

export const EVM_BATCH_GAS_DEFAULT_FLOOR = 150_000n;
export const EVM_NATIVE_TRANSFER_GAS = 21_000n;

export class EvmBatchGasSimulateRevertError extends Error {
	readonly index: number;
	constructor(index: number, detail: string) {
		super(`Transaction ${index + 1} reverted in sequential simulation: ${detail}`);
		this.name = 'EvmBatchGasSimulateRevertError';
		this.index = index;
	}
}

export type EvmBatchGasLeg = {
	to?: Address;
	data: Hex | string;
	value?: bigint;
	/** Raw protocol/selector minimum (no 20% headroom). */
	floor?: bigint | null;
	storedProposalGas?: bigint | null;
	/**
	 * Find the smallest call gas limit that still succeeds in the sequential
	 * simulation, then apply the normal 20% cushion to that limit.
	 * Used for CCIP Router.ccipSend, where gas used under a block-sized stipend
	 * is too low once the 63/64 rule reaches a deep token-pool burn.
	 */
	searchMinimumGasLimit?: boolean;
};

export type SequentialSimResult =
	| {kind: 'ok'; gasUsed: bigint[]}
	| {kind: 'unsupported'}
	| {kind: 'revert'; index: number; message: string};

export type EvmBatchGasRpc = {
	simulateSequential: (input: {
		account: Address;
		legs: Array<{to?: Address; data: Hex; value: bigint; gas?: bigint}>;
	}) => Promise<SequentialSimResult>;
	estimateGas: (input: {
		account: Address;
		to?: Address;
		data: Hex;
		value: bigint;
	}) => Promise<bigint>;
};

export type EstimateEvmBatchGasResult = {
	gasLimits: bigint[];
	source: 'simulate' | 'mixed' | 'fallback';
	simulateSupported: boolean;
};

const simulateSupportByRpc = new Map<string, boolean>();

export function clearEvmSimulateSupportCache(): void {
	simulateSupportByRpc.clear();
}

export {applyEstimateGasHeadroom};

export function isEmptyCalldata(data?: string | null): boolean {
	const d = (data ?? '0x').trim().toLowerCase();
	return d === '' || d === '0x' || d === '0x0' || d.length <= 2;
}

function asHex(data: string): Hex {
	const t = data.trim();
	return (t.startsWith('0x') ? t : `0x${t}`) as Hex;
}

function positive(n?: bigint | null): bigint | null {
	return n != null && n > 0n ? n : null;
}

/**
 * Empty calldata is not always 21000. Arbitrum's intrinsic gas is higher, and
 * `eth_estimateGas` includes it. A stored proposal limit is kept only when it is higher.
 */
async function nativeTransferLegGas(
	rpc: EvmBatchGasRpc,
	account: Address,
	leg: {to?: Address; data: Hex; value: bigint; storedProposalGas: bigint | null},
): Promise<{gas: bigint; fromEstimate: boolean}> {
	const stored = leg.storedProposalGas ?? 0n;
	try {
		const estimated = await rpc.estimateGas({
			account,
			to: leg.to,
			data: asHex(leg.data || '0x'),
			value: leg.value,
		});
		const live = estimated > 0n ? estimated : EVM_NATIVE_TRANSFER_GAS;
		return {gas: live > stored ? live : stored, fromEstimate: true};
	} catch {
		return {
			gas: stored > EVM_NATIVE_TRANSFER_GAS ? stored : EVM_NATIVE_TRANSFER_GAS,
			fromEstimate: false,
		};
	}
}

function fallbackGasLimit(
	stored: bigint | null,
	floor: bigint | null,
	defaultFloor: bigint,
): bigint {
	const base = [stored ?? 0n, floor ?? 0n, defaultFloor].reduce((a, b) => (a > b ? a : b));
	return applyEstimateGasHeadroom(base);
}

function liveGasLimit(live: bigint, stored: bigint | null, floor: bigint | null): bigint {
	const headed = applyEstimateGasHeadroom(live);
	let out = headed;
	if (floor != null && floor > out) out = floor;
	if (stored != null && stored > out) out = stored;
	return out;
}

export function finalizeEvmLegGasLimit(args: {
	simulatedGasUsed?: bigint | null;
	isolatedEstimate?: bigint | null;
	storedProposalGas?: bigint | null;
	floor?: bigint | null;
	defaultFloor?: bigint;
}): bigint {
	const stored = positive(args.storedProposalGas);
	const floor = positive(args.floor);
	const defaultFloor = args.defaultFloor ?? EVM_BATCH_GAS_DEFAULT_FLOOR;
	const sim = positive(args.simulatedGasUsed);
	if (sim != null) return liveGasLimit(sim, stored, floor);
	const isolated = positive(args.isolatedEstimate);
	if (isolated != null) return liveGasLimit(isolated, stored, floor);
	return fallbackGasLimit(stored, floor, defaultFloor);
}

function isSimulateUnsupportedError(err: unknown): boolean {
	const walk: unknown[] = [err];
	const seen = new Set<unknown>();
	while (walk.length) {
		const cur = walk.shift();
		if (cur == null || seen.has(cur)) continue;
		seen.add(cur);
		if (typeof cur === 'object') {
			const o = cur as {code?: unknown; message?: unknown; details?: unknown; cause?: unknown};
			if (o.code === -32601) return true;
			const msg = `${o.message ?? ''} ${o.details ?? ''}`.toLowerCase();
			if (
				msg.includes('method not found') ||
				msg.includes('does not exist') ||
				msg.includes('not available') ||
				msg.includes('not supported') ||
				msg.includes('unknown method') ||
				msg.includes('unimplemented') ||
				msg.includes('method is not allowed') ||
				msg.includes('method not allowed')
			) {
				return true;
			}
			if (o.cause) walk.push(o.cause);
		} else if (typeof cur === 'string') {
			const msg = cur.toLowerCase();
			if (msg.includes('method not found') || msg.includes('does not exist')) return true;
		}
	}
	return false;
}

/** Stop the CCIP gas-limit search well under a typical block gas limit. */
const GAS_LIMIT_SEARCH_CEILING = 16_000_000n;

type SequentialSimLeg = {to?: Address; data: Hex; value: bigint; gas?: bigint};

/**
 * Smallest `gas` that lets this call succeed inside the same sequential batch.
 * `gasUsed` from an uncapped simulation is the lower bound: below it the call
 * cannot succeed, and at that value a deep 63/64 stack often still reverts.
 * Returns null when the search cannot be completed; the caller keeps gasUsed.
 */
async function minimumSuccessfulCallGas(args: {
	rpc: EvmBatchGasRpc;
	account: Address;
	legs: SequentialSimLeg[];
	index: number;
	gasUsed: bigint;
}): Promise<bigint | null> {
	const probe = async (gas: bigint): Promise<'ok' | 'low' | 'abort'> => {
		const result = await args.rpc.simulateSequential({
			account: args.account,
			legs: args.legs.map((leg, i) => (i === args.index ? {...leg, gas} : leg)),
		});
		if (result.kind === 'ok') return 'ok';
		if (result.kind === 'unsupported') return 'abort';
		if (result.index !== args.index) return 'abort';
		return 'low';
	};

	const atUsed = await probe(args.gasUsed);
	if (atUsed === 'abort') return null;
	if (atUsed === 'ok') return args.gasUsed;

	let hi = args.gasUsed * 2n;
	if (hi > GAS_LIMIT_SEARCH_CEILING) hi = GAS_LIMIT_SEARCH_CEILING;
	let hiResult = await probe(hi);
	while (hiResult === 'low' && hi < GAS_LIMIT_SEARCH_CEILING) {
		const next = hi * 2n;
		hi = next > GAS_LIMIT_SEARCH_CEILING ? GAS_LIMIT_SEARCH_CEILING : next;
		hiResult = await probe(hi);
	}
	if (hiResult !== 'ok') return null;

	let lo = args.gasUsed;
	while (lo + 1n < hi) {
		const mid = (lo + hi) / 2n;
		const midResult = await probe(mid);
		if (midResult === 'abort') return null;
		if (midResult === 'ok') hi = mid;
		else lo = mid;
	}
	return hi;
}

export function createViemEvmBatchGasRpc(publicClient: PublicClient, rpcUrl?: string): EvmBatchGasRpc {
	const cacheKey = (rpcUrl ?? '').trim() || 'default';

	return {
		async simulateSequential({account, legs}) {
			const cached = simulateSupportByRpc.get(cacheKey);
			if (cached === false) return {kind: 'unsupported'};

			const calls = legs.map(leg => {
				const call: Record<string, string> = {
					from: account,
					data: asHex(leg.data),
					value: toHex(leg.value ?? 0n),
				};
				if (leg.to) call.to = leg.to;
				if (leg.gas != null && leg.gas > 0n) call.gas = toHex(leg.gas);
				return call;
			});

			try {
				const raw = await publicClient.request({
					method: 'eth_simulateV1',
					params: [
						{
							blockStateCalls: [{calls}],
							traceTransfers: false,
							validation: false,
						},
						'latest',
					],
				} as never);

				const blocks = Array.isArray(raw) ? raw : [];
				const first = blocks[0] as {calls?: unknown} | undefined;
				const simCalls = Array.isArray(first?.calls) ? first.calls : [];
				if (simCalls.length !== legs.length) {
					simulateSupportByRpc.set(cacheKey, true);
					return {
						kind: 'revert',
						index: 0,
						message: `eth_simulateV1 returned ${simCalls.length} call result(s); expected ${legs.length}.`,
					};
				}

				const gasUsed: bigint[] = [];
				for (let i = 0; i < simCalls.length; i++) {
					const row = simCalls[i] as {
						status?: unknown;
						gasUsed?: unknown;
						error?: unknown;
						revertReason?: unknown;
					};
					const status = String(row.status ?? '').toLowerCase();
					const failed = status === '0x0' || status === '0' || row.error != null;
					if (failed) {
						simulateSupportByRpc.set(cacheKey, true);
						const detail =
							typeof row.error === 'string' && row.error.trim()
								? row.error.trim()
								: typeof row.revertReason === 'string' && row.revertReason.trim()
									? row.revertReason.trim()
									: typeof row.error === 'object' && row.error
										? JSON.stringify(row.error)
										: 'execution reverted';
						return {kind: 'revert', index: i, message: detail};
					}
					try {
						gasUsed.push(BigInt(String(row.gasUsed ?? '0')));
					} catch {
						return {kind: 'revert', index: i, message: 'eth_simulateV1 call missing gasUsed'};
					}
				}
				simulateSupportByRpc.set(cacheKey, true);
				return {kind: 'ok', gasUsed};
			} catch (err) {
				if (isSimulateUnsupportedError(err)) {
					simulateSupportByRpc.set(cacheKey, false);
					return {kind: 'unsupported'};
				}
				throw err;
			}
		},

		async estimateGas({account, to, data, value}) {
			return publicClient.estimateGas(
				to
					? {account, to, data: asHex(data), value}
					: {account, data: asHex(data), value},
			);
		},
	};
}

export async function estimateEvmBatchGasLimits(args: {
	account: Address;
	legs: EvmBatchGasLeg[];
	rpc: EvmBatchGasRpc;
	defaultFloor?: bigint;
}): Promise<EstimateEvmBatchGasResult> {
	const defaultFloor = args.defaultFloor ?? EVM_BATCH_GAS_DEFAULT_FLOOR;
	const normalized = args.legs.map(leg => ({
		to: leg.to,
		data: asHex(String(leg.data ?? '0x')),
		value: leg.value ?? 0n,
		floor: positive(leg.floor),
		storedProposalGas: positive(leg.storedProposalGas),
		searchMinimumGasLimit: leg.searchMinimumGasLimit === true,
	}));

	if (normalized.length === 0) {
		return {gasLimits: [], source: 'fallback', simulateSupported: false};
	}

	const sim = await args.rpc.simulateSequential({
		account: args.account,
		legs: normalized.map(({to, data, value}) => ({to, data, value})),
	});

	if (sim.kind === 'revert') {
		throw new EvmBatchGasSimulateRevertError(sim.index, sim.message);
	}

	if (sim.kind === 'ok') {
		const simLegs: SequentialSimLeg[] = normalized.map(({to, data, value}) => ({to, data, value}));
		const searchedMinimum = new Map<number, bigint>();
		for (let i = 0; i < normalized.length; i++) {
			const leg = normalized[i]!;
			if (!leg.searchMinimumGasLimit || isEmptyCalldata(leg.data)) continue;
			const gasUsed = sim.gasUsed[i];
			if (gasUsed == null || gasUsed <= 0n) continue;
			const minimum = await minimumSuccessfulCallGas({
				rpc: args.rpc,
				account: args.account,
				legs: simLegs,
				index: i,
				gasUsed,
			});
			if (minimum != null) searchedMinimum.set(i, minimum);
		}
		const gasLimits = await Promise.all(
			normalized.map(async (leg, i) => {
				if (isEmptyCalldata(leg.data)) {
					return (await nativeTransferLegGas(args.rpc, args.account, leg)).gas;
				}
				return finalizeEvmLegGasLimit({
					simulatedGasUsed: searchedMinimum.get(i) ?? sim.gasUsed[i],
					storedProposalGas: leg.storedProposalGas,
					floor: leg.floor,
					defaultFloor,
				});
			}),
		);
		return {gasLimits, source: 'simulate', simulateSupported: true};
	}

	const gasLimits: bigint[] = [];
	let anyLive = false;
	let anyFallback = false;
	for (const leg of normalized) {
		if (isEmptyCalldata(leg.data)) {
			const native = await nativeTransferLegGas(args.rpc, args.account, leg);
			gasLimits.push(native.gas);
			if (native.fromEstimate) anyLive = true;
			else anyFallback = true;
			continue;
		}
		try {
			const isolated = await args.rpc.estimateGas({
				account: args.account,
				to: leg.to,
				data: leg.data,
				value: leg.value,
			});
			anyLive = true;
			gasLimits.push(
				finalizeEvmLegGasLimit({
					isolatedEstimate: isolated,
					storedProposalGas: leg.storedProposalGas,
					floor: leg.floor,
					defaultFloor,
				}),
			);
		} catch {
			anyFallback = true;
			gasLimits.push(
				finalizeEvmLegGasLimit({
					storedProposalGas: leg.storedProposalGas,
					floor: leg.floor,
					defaultFloor,
				}),
			);
		}
	}

	return {
		gasLimits,
		source: anyLive && anyFallback ? 'mixed' : 'fallback',
		simulateSupported: false,
	};
}

export async function estimateEvmBatchGasLimitsWithClient(args: {
	publicClient: PublicClient;
	account: Address;
	legs: EvmBatchGasLeg[];
	rpcUrl?: string;
	defaultFloor?: bigint;
}): Promise<EstimateEvmBatchGasResult> {
	return estimateEvmBatchGasLimits({
		account: args.account,
		legs: args.legs,
		rpc: createViemEvmBatchGasRpc(args.publicClient, args.rpcUrl),
		defaultFloor: args.defaultFloor,
	});
}
