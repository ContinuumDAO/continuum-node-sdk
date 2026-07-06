import type {ChartPatternHit, MeasuredMove, NormalizedBar} from './types.js';

function pointByLabel(hit: ChartPatternHit, label: string) {
	return hit.points.find(p => p.label === label);
}

function levelPrice(hit: ChartPatternHit, kind?: string): number | null {
	const level = hit.levels?.find(l => (kind ? l.kind === kind || l.label?.toLowerCase().includes(kind) : true));
	return level?.price ?? null;
}

function minPointPrice(hit: ChartPatternHit, roles: string[]): number | null {
	let min: number | null = null;
	for (const p of hit.points) {
		if (roles.length && p.role && !roles.includes(p.role)) {
			continue;
		}
		if (min == null || p.price < min) {
			min = p.price;
		}
	}
	return min;
}

function maxPointPrice(hit: ChartPatternHit, roles: string[]): number | null {
	let max: number | null = null;
	for (const p of hit.points) {
		if (roles.length && p.role && !roles.includes(p.role)) {
			continue;
		}
		if (max == null || p.price > max) {
			max = p.price;
		}
	}
	return max;
}

export function computeMeasuredMove(hit: ChartPatternHit, bars: NormalizedBar[]): MeasuredMove | null {
	const lastClose = bars.at(-1)?.close ?? 0;
	const completed = hit.completionState === 'completed';

	switch (hit.id) {
		case 'double_bottom':
		case 'double_bottom_adam_eve': {
			const neckline = levelPrice(hit, 'neckline') ?? maxPointPrice(hit, ['top', 'peak']);
			const trough = minPointPrice(hit, ['bottom', 'trough']);
			if (neckline == null || trough == null) {
				return null;
			}
			const height = neckline - trough;
			const targetPrice = neckline + height;
			return {
				targetPrice,
				referencePrice: neckline,
				height,
				direction: 'up',
				formula: 'neckline + (neckline - trough)',
				status: completed && lastClose > neckline ? 'active' : 'projected',
			};
		}
		case 'double_top': {
			const neckline = levelPrice(hit, 'neckline') ?? minPointPrice(hit, ['valley', 'bottom']);
			const peak = maxPointPrice(hit, ['top']);
			if (neckline == null || peak == null) {
				return null;
			}
			const height = peak - neckline;
			const targetPrice = neckline - height;
			return {
				targetPrice,
				referencePrice: neckline,
				height,
				direction: 'down',
				formula: 'neckline - (peak - neckline)',
				status: completed && lastClose < neckline ? 'active' : 'projected',
			};
		}
		case 'head_and_shoulders':
		case 'inverse_head_and_shoulders': {
			const neckline = levelPrice(hit, 'neckline');
			const head = pointByLabel(hit, 'H') ?? pointByLabel(hit, 'Head');
			if (neckline == null || !head) {
				return null;
			}
			const height = Math.abs(head.price - neckline);
			const bullish = hit.id === 'inverse_head_and_shoulders';
			const targetPrice = bullish ? neckline + height : neckline - height;
			return {
				targetPrice,
				referencePrice: neckline,
				height,
				direction: bullish ? 'up' : 'down',
				formula: bullish ? 'neckline + (neckline - head)' : 'neckline - (head - neckline)',
				status: completed ? 'active' : 'projected',
			};
		}
		case 'trendline_breakout_bullish':
		case 'trendline_breakout_retest_bullish':
		case 'trendline_breakout_bearish':
		case 'trendline_breakout_retest_bearish': {
			const breakPt = pointByLabel(hit, 'BO');
			const excursion = pointByLabel(hit, 'Hi') ?? pointByLabel(hit, 'Lo');
			const breakLevel = levelPrice(hit, 'level') ?? breakPt?.price;
			if (breakLevel == null || !breakPt) {
				return null;
			}
			const move =
				excursion != null
					? Math.abs(excursion.price - breakPt.price)
					: Math.abs(bars.at(-1)!.close - breakPt.price);
			const bullish = hit.direction === 'bullish';
			const targetPrice = bullish ? breakLevel + move : breakLevel - move;
			return {
				targetPrice,
				referencePrice: breakLevel,
				height: move,
				direction: bullish ? 'up' : 'down',
				formula: bullish ? 'break_level + post_break_move' : 'break_level - post_break_move',
				status: completed ? 'active' : 'projected',
			};
		}
		case 'flag_bullish':
		case 'flag_bearish':
		case 'pennant_bullish':
		case 'pennant_bearish': {
			const poleStart = hit.points.find(p => p.role === 'pole_start' || p.label === 'P0');
			const poleEnd = hit.points.find(p => p.role === 'pole_end' || p.label === 'P1');
			const breakLevel = levelPrice(hit, 'level') ?? hit.lines[0]?.pointB.price;
			if (!poleStart || !poleEnd || breakLevel == null) {
				const poleLine = hit.lines.find(l => l.kind === 'flagpole');
				if (!poleLine) {
					return null;
				}
				const poleHeight = Math.abs(poleLine.pointB.price - poleLine.pointA.price);
				const bullish = hit.direction === 'bullish';
				return {
					targetPrice: bullish ? breakLevel + poleHeight : breakLevel - poleHeight,
					referencePrice: breakLevel,
					height: poleHeight,
					direction: bullish ? 'up' : 'down',
					formula: 'break_level ± pole_height',
					status: completed ? 'active' : 'projected',
				};
			}
			const poleHeight = Math.abs(poleEnd.price - poleStart.price);
			const bullish = hit.direction === 'bullish';
			return {
				targetPrice: bullish ? breakLevel + poleHeight : breakLevel - poleHeight,
				referencePrice: breakLevel,
				height: poleHeight,
				direction: bullish ? 'up' : 'down',
				formula: 'break_level ± pole_height',
				status: completed ? 'active' : 'projected',
			};
		}
		case 'ascending_triangle':
		case 'descending_triangle':
		case 'symmetrical_triangle':
		case 'rising_wedge':
		case 'falling_wedge':
		case 'channel_up':
		case 'channel_down': {
			const highs = hit.points.map(p => p.price);
			const lows = bars
				.slice(hit.barSpan.fromIndex, hit.barSpan.toIndex + 1)
				.map(b => b.low);
			const patternHigh = Math.max(...highs, ...bars.slice(hit.barSpan.fromIndex, hit.barSpan.toIndex + 1).map(b => b.high));
			const patternLow = Math.min(...lows, ...bars.slice(hit.barSpan.fromIndex, hit.barSpan.toIndex + 1).map(b => b.low));
			const height = patternHigh - patternLow;
			const ref = hit.direction === 'bullish' ? patternHigh : patternLow;
			const targetPrice = hit.direction === 'bullish' ? ref + height : ref - height;
			if (!Number.isFinite(height) || height <= 0) {
				return null;
			}
			return {
				targetPrice,
				referencePrice: ref,
				height,
				direction: hit.direction === 'bearish' ? 'down' : 'up',
				formula: 'pattern_height projected from break side',
				status: completed ? 'active' : 'projected',
			};
		}
		case 'cup_and_handle': {
			const rim = levelPrice(hit, 'neckline') ?? maxPointPrice(hit, ['rim', 'top']);
			const cupLow = minPointPrice(hit, ['cup', 'bottom']);
			if (rim == null || cupLow == null) {
				return null;
			}
			const depth = rim - cupLow;
			return {
				targetPrice: rim + depth,
				referencePrice: rim,
				height: depth,
				direction: 'up',
				formula: 'rim + cup_depth',
				status: completed && lastClose > rim ? 'active' : 'projected',
			};
		}
		default:
			return null;
	}
}
