import type {
	AveragedDepthProfile,
	DepthProfileBin,
	NormalizedDepthLevel,
	NormalizedDepthSnapshot,
} from './schemas.js';

export type DepthAverageOptions = {
	/** Price bin width as fraction of mid (default 0.0005 = 5 bps). */
	binPct?: number;
	/** Absolute bin step when mid is missing (default 1). */
	absoluteBinStep?: number;
};

type BinAccum = {bidSum: number; askSum: number; count: number};

function binKey(price: number, step: number): number {
	return Math.floor(price / step) * step;
}

function resolveStep(mid: number | undefined, options: DepthAverageOptions): number {
	const binPct = options.binPct ?? 0.0005;
	const abs = options.absoluteBinStep ?? 1;
	if (mid != null && mid > 0 && binPct > 0) {
		return Math.max(mid * binPct, Number.EPSILON);
	}
	return Math.max(abs, Number.EPSILON);
}

function addSide(
	map: Map<number, BinAccum>,
	levels: NormalizedDepthLevel[],
	side: 'bid' | 'ask',
	step: number,
): void {
	for (const level of levels) {
		const key = binKey(level.price, step);
		const cur = map.get(key) ?? {bidSum: 0, askSum: 0, count: 0};
		if (side === 'bid') {
			cur.bidSum += level.size;
		} else {
			cur.askSum += level.size;
		}
		cur.count += 1;
		map.set(key, cur);
	}
}

/** Collapse one snapshot into price bins (size per bin, not yet time-averaged). */
export function snapshotToBins(
	snapshot: NormalizedDepthSnapshot,
	options: DepthAverageOptions = {},
): DepthProfileBin[] {
	const step = resolveStep(snapshot.mid, options);
	const map = new Map<number, BinAccum>();
	addSide(map, snapshot.bids, 'bid', step);
	addSide(map, snapshot.asks, 'ask', step);
	const keys = [...map.keys()].sort((a, b) => a - b);
	return keys.map(priceLo => {
		const cell = map.get(priceLo)!;
		const bidSize = cell.bidSum;
		const askSize = cell.askSum;
		return {
			priceLo,
			priceHi: priceLo + step,
			bidSize,
			askSize,
			totalSize: bidSize + askSize,
		};
	});
}

export type DepthSampleRecord = {
	asOfMs: number;
	bins: DepthProfileBin[];
	mid?: number;
};

/**
 * Average bin sizes across samples in a time window (simple mean of overlapping bins).
 */
export function averageDepthSamples(
	samples: DepthSampleRecord[],
	meta: {
		exchangeId: NormalizedDepthSnapshot['exchangeId'];
		symbol: string;
		windowSec: number;
		asOfMs?: number;
	},
): AveragedDepthProfile | null {
	if (!samples.length) {
		return null;
	}
	const asOfMs = meta.asOfMs ?? samples[samples.length - 1]!.asOfMs;
	const windowStart = asOfMs - meta.windowSec * 1000;
	const inWindow = samples.filter(s => s.asOfMs >= windowStart && s.asOfMs <= asOfMs);
	if (!inWindow.length) {
		return null;
	}

	const bidSums = new Map<number, {sum: number; n: number; hi: number}>();
	const askSums = new Map<number, {sum: number; n: number; hi: number}>();

	for (const sample of inWindow) {
		for (const bin of sample.bins) {
			const bid = bidSums.get(bin.priceLo) ?? {sum: 0, n: 0, hi: bin.priceHi};
			bid.sum += bin.bidSize;
			bid.n += 1;
			bid.hi = bin.priceHi;
			bidSums.set(bin.priceLo, bid);

			const ask = askSums.get(bin.priceLo) ?? {sum: 0, n: 0, hi: bin.priceHi};
			ask.sum += bin.askSize;
			ask.n += 1;
			ask.hi = bin.priceHi;
			askSums.set(bin.priceLo, ask);
		}
	}

	const keys = new Set([...bidSums.keys(), ...askSums.keys()]);
	const sorted = [...keys].sort((a, b) => a - b);
	const bins: DepthProfileBin[] = sorted.map(priceLo => {
		const bid = bidSums.get(priceLo);
		const ask = askSums.get(priceLo);
		const bidSize = bid && bid.n > 0 ? bid.sum / bid.n : 0;
		const askSize = ask && ask.n > 0 ? ask.sum / ask.n : 0;
		const priceHi = bid?.hi ?? ask?.hi ?? priceLo;
		return {
			priceLo,
			priceHi,
			bidSize,
			askSize,
			totalSize: bidSize + askSize,
		};
	});

	const mids = inWindow.map(s => s.mid).filter((m): m is number => m != null && Number.isFinite(m));
	const mid =
		mids.length > 0 ? mids.reduce((a, b) => a + b, 0) / mids.length : undefined;

	return {
		exchangeId: meta.exchangeId,
		market: 'spot',
		symbol: meta.symbol,
		...(mid != null ? {mid} : {}),
		asOfMs,
		windowSec: meta.windowSec,
		sampleCount: inWindow.length,
		bins,
	};
}
