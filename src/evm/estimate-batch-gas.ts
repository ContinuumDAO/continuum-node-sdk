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
};

export type SequentialSimResult =
	| {kind: 'ok'; gasUsed: bigint[]}
	| {kind: 'unsupported'}
	| {kind: 'revert'; index: number; message: string};

export type EvmBatchGasRpc = {
	simulateSequential: (input: {
		account: Address;
		legs: Array<{to?: Address; data: Hex; value: bigint}>;
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
				msg.includes('unimplemented')
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
		const gasLimits = normalized.map((leg, i) => {
			if (isEmptyCalldata(leg.data)) return EVM_NATIVE_TRANSFER_GAS;
			return finalizeEvmLegGasLimit({
				simulatedGasUsed: sim.gasUsed[i],
				storedProposalGas: leg.storedProposalGas,
				floor: leg.floor,
				defaultFloor,
			});
		});
		return {gasLimits, source: 'simulate', simulateSupported: true};
	}

	const gasLimits: bigint[] = [];
	let anyLive = false;
	let anyFallback = false;
	for (const leg of normalized) {
		if (isEmptyCalldata(leg.data)) {
			gasLimits.push(EVM_NATIVE_TRANSFER_GAS);
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
