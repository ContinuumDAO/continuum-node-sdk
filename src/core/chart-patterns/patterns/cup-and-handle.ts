import {blendConfidence, withinPct} from '../confidence.js';
import type {ChartPatternHit} from '../types.js';
import {
	type DetectorContext,
	barSpanFromIndices,
	depthScore,
	finalizeHit,
	makePoint,
	pickBestHit,
} from './utils.js';

function uShapeScore(bars: import('../types.js').NormalizedBar[], from: number, to: number): number {
	let lows: number[] = [];
	for (let i = from; i <= to; i++) {
		const bar = bars[i];
		if (bar) {
			lows.push(bar.low);
		}
	}
	if (lows.length < 5) {
		return 0.5;
	}
	const min = Math.min(...lows);
	const center = Math.floor((from + to) / 2);
	const centerLow = bars[center]?.low ?? min;
	const edgeAvg = ((bars[from]?.low ?? min) + (bars[to]?.low ?? min)) / 2;
	const sharp = centerLow <= min * 1.005 && centerLow < edgeAvg * 0.985;
	return sharp ? 0.45 : 0.85;
}

export function detectCupAndHandle(ctx: DetectorContext): ChartPatternHit | null {
	const highs = ctx.highs;
	const lows = ctx.lows;
	const candidates: ChartPatternHit[] = [];

	for (let ai = 0; ai < highs.length; ai++) {
		for (let bi = 0; bi < lows.length; bi++) {
			for (let ci = ai + 1; ci < highs.length; ci++) {
				const a = highs[ai]!;
				const b = lows[bi]!;
				const c = highs[ci]!;
				if (!(a.barIndex < b.barIndex && b.barIndex < c.barIndex)) {
					continue;
				}
				if (c.barIndex - a.barIndex < 12) {
					continue;
				}
				if (!withinPct(a.price, c.price, 0.06)) {
					continue;
				}
				const cupDepth = (a.price - b.price) / Math.max(a.price, 1e-8);
				if (cupDepth < 0.08 || cupDepth > 0.4) {
					continue;
				}

				const handleLows = lows.filter(l => l.barIndex > c.barIndex && l.barIndex <= c.barIndex + 8);
				const handleLow = handleLows.sort((x, y) => x.price - y.price)[0];
				if (!handleLow) {
					continue;
				}
				const handleDepth = (c.price - handleLow.price) / Math.max(c.price - b.price, 1e-8);
				if (handleDepth > 0.5 || handleDepth < 0.05) {
					continue;
				}

				const uScore = uShapeScore(ctx.bars, a.barIndex, c.barIndex);
				const confidence = blendConfidence(
					withinPct(a.price, c.price, 0.03) ? 0.85 : 0.65,
					depthScore(cupDepth, 0.12, 0.33),
					uScore,
					handleDepth <= 0.2 ? 0.8 : 0.55,
				);

				const lastBar = ctx.bars.at(-1)!;
				const completed = ctx.lastClose > c.price;
				const toIndex = Math.max(c.barIndex, handleLow.barIndex, lastBar.index);

				candidates.push(
					finalizeHit(
						{
							id: 'cup_and_handle',
							name: 'Cup and Handle',
							category: 'continuation',
							direction: 'bullish',
							confidence,
							completionState: completed ? 'completed' : 'forming',
							barSpan: barSpanFromIndices(ctx.bars, a.barIndex, toIndex),
							points: [
								makePoint(ctx.bars[a.barIndex]!, a.price, 'A', 'left_rim'),
								makePoint(ctx.bars[b.barIndex]!, b.price, 'B', 'cup_bottom'),
								makePoint(ctx.bars[c.barIndex]!, c.price, 'C', 'right_rim'),
								makePoint(ctx.bars[handleLow.barIndex]!, handleLow.price, 'D', 'handle_low'),
								makePoint(lastBar, lastBar.close, 'E', 'current'),
							],
							lines: [
								{
									pointA: makePoint(ctx.bars[a.barIndex]!, a.price, 'A'),
									pointB: makePoint(ctx.bars[c.barIndex]!, c.price, 'C'),
									label: 'Cup rim',
									kind: 'boundary',
								},
							],
							levels: [{price: c.price, label: 'Right rim', kind: 'resistance'}],
							description: `Cup and handle: rims ${a.price.toFixed(2)}/${c.price.toFixed(2)}, bottom ${b.price.toFixed(2)}, handle ${handleLow.price.toFixed(2)}.`,
						},
						ctx.lastClose,
					),
				);
			}
		}
	}

	return pickBestHit(candidates.filter(c => c.barSpan.toIndex >= ctx.focusFromIndex));
}
