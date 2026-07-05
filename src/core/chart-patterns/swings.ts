import {detectSwingsFromBars} from '../chart/levels/key-levels.js';
import {normalizeCandleRow} from '../chart/point-normalize.js';
import type {NormalizedBar, OrderedSwing} from './types.js';

function chartTimeSec(time: NormalizedBar['time']): number {
	if (typeof time === 'number') {
		return time;
	}
	return Math.floor(Date.UTC(time.year, time.month - 1, time.day) / 1000);
}

export function normalizeBarsFromRows(
	rawBars: Record<string, unknown>[],
): NormalizedBar[] {
	const out: NormalizedBar[] = [];
	for (let index = 0; index < rawBars.length; index++) {
		const bar = normalizeCandleRow(rawBars[index]!);
		if (!bar) {
			continue;
		}
		const timeSec =
			typeof bar.time === 'number'
				? bar.time
				: chartTimeSec(bar.time!);
		out.push({
			index,
			time: bar.time ?? timeSec,
			timeSec,
			open: bar.open,
			high: bar.high,
			low: bar.low,
			close: bar.close,
		});
	}
	return out;
}

export function detectOrderedSwings(
	rawBars: Record<string, unknown>[],
	lookback: number,
): OrderedSwing[] {
	const swings = detectSwingsFromBars(rawBars, lookback);
	const out: OrderedSwing[] = [];
	for (const swing of swings) {
		let barIndex = -1;
		for (let i = 0; i < rawBars.length; i++) {
			const bar = normalizeCandleRow(rawBars[i]!);
			if (!bar) {
				continue;
			}
			const t =
				typeof bar.time === 'number'
					? bar.time
					: chartTimeSec(bar.time!);
			const price = swing.kind === 'resistance' ? bar.high : bar.low;
			if (t === swing.timeSec && Math.abs(price - swing.price) < 1e-6) {
				barIndex = i;
				break;
			}
		}
		if (barIndex >= 0) {
			out.push({
				barIndex,
				timeSec: swing.timeSec,
				price: swing.price,
				kind: swing.kind,
			});
		}
	}
	return out.sort((a, b) => a.barIndex - b.barIndex);
}

export function swingHighs(swings: OrderedSwing[]): OrderedSwing[] {
	return swings.filter(s => s.kind === 'resistance');
}

export function swingLows(swings: OrderedSwing[]): OrderedSwing[] {
	return swings.filter(s => s.kind === 'support');
}

/** Lowest low strictly between two bar indices (excludes the endpoint bars). */
export function minLowStrictBetween(
	bars: NormalizedBar[],
	fromIndex: number,
	toIndex: number,
): NormalizedBar | null {
	const start = Math.min(fromIndex, toIndex) + 1;
	const end = Math.max(fromIndex, toIndex) - 1;
	if (start > end) {
		return null;
	}
	let best: NormalizedBar | null = null;
	for (let i = start; i <= end; i++) {
		const bar = bars[i];
		if (!bar) {
			continue;
		}
		if (!best || bar.low < best.low) {
			best = bar;
		}
	}
	return best;
}

/** Highest high strictly between two bar indices (excludes the endpoint bars). */
export function maxHighStrictBetween(
	bars: NormalizedBar[],
	fromIndex: number,
	toIndex: number,
): NormalizedBar | null {
	const start = Math.min(fromIndex, toIndex) + 1;
	const end = Math.max(fromIndex, toIndex) - 1;
	if (start > end) {
		return null;
	}
	let best: NormalizedBar | null = null;
	for (let i = start; i <= end; i++) {
		const bar = bars[i];
		if (!bar) {
			continue;
		}
		if (!best || bar.high > best.high) {
			best = bar;
		}
	}
	return best;
}

export function minLowBetween(bars: NormalizedBar[], fromIndex: number, toIndex: number): NormalizedBar | null {
	const start = Math.min(fromIndex, toIndex);
	const end = Math.max(fromIndex, toIndex);
	let best: NormalizedBar | null = null;
	for (let i = start; i <= end; i++) {
		const bar = bars[i];
		if (!bar) {
			continue;
		}
		if (!best || bar.low < best.low) {
			best = bar;
		}
	}
	return best;
}

export function maxHighBetween(bars: NormalizedBar[], fromIndex: number, toIndex: number): NormalizedBar | null {
	const start = Math.min(fromIndex, toIndex);
	const end = Math.max(fromIndex, toIndex);
	let best: NormalizedBar | null = null;
	for (let i = start; i <= end; i++) {
		const bar = bars[i];
		if (!bar) {
			continue;
		}
		if (!best || bar.high > best.high) {
			best = bar;
		}
	}
	return best;
}
