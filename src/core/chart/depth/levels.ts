import type {AveragedDepthProfile, DepthProfileBin} from './schemas.js';

export type LiquidityDepthLevelMenuEntry = {
	index: number;
	levelNumber: number;
	side: 'bid' | 'ask';
	price: number;
	avgSize: number;
	relativeStrength: number;
	distancePct: number;
};

function binMid(bin: DepthProfileBin): number {
	return (bin.priceLo + bin.priceHi) / 2;
}

/**
 * Rank averaged depth bins into a level menu (bids below mid, asks above).
 */
export function buildLiquidityDepthLevelMenu(
	profile: AveragedDepthProfile,
	options: {levelCount?: number} = {},
): LiquidityDepthLevelMenuEntry[] {
	const levelCount = Math.max(1, Math.min(32, options.levelCount ?? 8));
	const mid = profile.mid;
	if (mid == null || !(mid > 0) || !profile.bins.length) {
		return [];
	}

	const bidCandidates = profile.bins
		.filter(b => binMid(b) < mid && b.bidSize > 0)
		.map(b => ({side: 'bid' as const, price: binMid(b), avgSize: b.bidSize}));
	const askCandidates = profile.bins
		.filter(b => binMid(b) > mid && b.askSize > 0)
		.map(b => ({side: 'ask' as const, price: binMid(b), avgSize: b.askSize}));

	bidCandidates.sort((a, b) => b.avgSize - a.avgSize);
	askCandidates.sort((a, b) => b.avgSize - a.avgSize);

	const perSide = Math.max(1, Math.ceil(levelCount / 2));
	const picked = [
		...bidCandidates.slice(0, perSide),
		...askCandidates.slice(0, perSide),
	].slice(0, levelCount);

	const maxSize = Math.max(...picked.map(p => p.avgSize), Number.EPSILON);

	const withMeta = picked.map(p => ({
		...p,
		relativeStrength: Math.min(1, p.avgSize / maxSize),
		distancePct: (Math.abs(p.price - mid) / mid) * 100,
	}));

	// Present nearest to mid first within each side, bids then asks
	withMeta.sort((a, b) => {
		if (a.side !== b.side) {
			return a.side === 'bid' ? -1 : 1;
		}
		return a.distancePct - b.distancePct;
	});

	return withMeta.map((entry, index) => ({
		index,
		levelNumber: index + 1,
		side: entry.side,
		price: entry.price,
		avgSize: entry.avgSize,
		relativeStrength: entry.relativeStrength,
		distancePct: entry.distancePct,
	}));
}

export function summarizeLiquidityDepthLevels(
	menu: LiquidityDepthLevelMenuEntry[],
	meta: {symbol: string; warmingUp: boolean; sampleCount: number; windowSec: number},
): string {
	if (meta.warmingUp) {
		return (
			`Spot liquidity depth for ${meta.symbol}: warming up ` +
			`(${meta.sampleCount} samples; need more for a full ${meta.windowSec}s average).`
		);
	}
	if (!menu.length) {
		return `Spot liquidity depth for ${meta.symbol}: no significant walls in the averaged book.`;
	}
	const topBid = menu.find(m => m.side === 'bid');
	const topAsk = menu.find(m => m.side === 'ask');
	const parts: string[] = [`Spot book ${meta.symbol}`];
	if (topBid) {
		parts.push(
			`bid wall ~${topBid.price.toPrecision(6)} (rel ${topBid.relativeStrength.toFixed(2)})`,
		);
	}
	if (topAsk) {
		parts.push(
			`ask wall ~${topAsk.price.toPrecision(6)} (rel ${topAsk.relativeStrength.toFixed(2)})`,
		);
	}
	return parts.join(': ') + '.';
}
