import {barRowsHaveVolume} from '../chart/fetch-result.js';
import type {ChartPatternHit, NormalizedBar, VolumeConfirmation} from './types.js';

type VolumeEventRole = 'breakout' | 'retest' | 'neckline_break' | 'trough' | 'peak' | 'flagpole';

function barVolume(bar: Record<string, unknown>): number | null {
	const raw =
		bar.volume ?? bar.volumeUSD ?? bar.volumeUsd ?? bar.v ?? (Array.isArray(bar) ? bar[5] : undefined);
	const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number.parseFloat(raw) : Number.NaN;
	return Number.isFinite(n) && n >= 0 ? n : null;
}

function volumeAtIndex(bars: NormalizedBar[], rawBars: Record<string, unknown>[], index: number): number {
	const raw = rawBars[index];
	if (!raw) {
		return 0;
	}
	return barVolume(raw) ?? 0;
}

function avgVolumeInSpan(
	bars: NormalizedBar[],
	rawBars: Record<string, unknown>[],
	fromIndex: number,
	toIndex: number,
): number {
	let sum = 0;
	let count = 0;
	for (let i = fromIndex; i <= toIndex && i < bars.length; i++) {
		sum += volumeAtIndex(bars, rawBars, i);
		count++;
	}
	return count > 0 ? sum / count : 0;
}

function verdictForBreakout(ratio: number): 'confirming' | 'neutral' | 'weak' {
	if (ratio >= 1.3) {
		return 'confirming';
	}
	if (ratio < 0.8) {
		return 'weak';
	}
	return 'neutral';
}

function verdictForRetest(ratio: number): 'confirming' | 'neutral' | 'weak' {
	if (ratio <= 0.9) {
		return 'confirming';
	}
	if (ratio > 1.2) {
		return 'weak';
	}
	return 'neutral';
}

function findBarIndexByLabel(hit: ChartPatternHit, bars: NormalizedBar[], label: string): number {
	const pt = hit.points.find(p => p.label === label);
	if (!pt) {
		return -1;
	}
	let best = -1;
	let bestDist = Infinity;
	for (const bar of bars) {
		const dist = Math.abs(bar.timeSec - pt.timeSec);
		if (dist < bestDist) {
			bestDist = dist;
			best = bar.index;
		}
	}
	return best;
}

export function computeVolumeConfirmation(
	hit: ChartPatternHit,
	bars: NormalizedBar[],
	rawBars: Record<string, unknown>[],
): VolumeConfirmation | undefined {
	if (!barRowsHaveVolume(rawBars)) {
		return {
			status: 'unavailable',
			summary: 'Volume not present in OHLCV fetch; confirmation skipped.',
			baseline: {barCount: 0, avgVolume: 0},
			events: [],
		};
	}

	const from = hit.barSpan.fromIndex;
	const to = hit.barSpan.toIndex;
	const baselineAvg = avgVolumeInSpan(bars, rawBars, from, to);
	if (baselineAvg <= 0) {
		return {
			status: 'unavailable',
			summary: 'No usable volume in pattern window.',
			baseline: {barCount: to - from + 1, avgVolume: 0},
			events: [],
		};
	}

	const events: VolumeConfirmation['events'] = [];
	const addEvent = (barIndex: number, role: VolumeEventRole, verdict: 'confirming' | 'neutral' | 'weak') => {
		if (barIndex < 0 || barIndex >= bars.length) {
			return;
		}
		const volume = volumeAtIndex(bars, rawBars, barIndex);
		const ratio = volume / baselineAvg;
		events.push({
			barIndex,
			timeSec: bars[barIndex]!.timeSec,
			role,
			volume,
			ratioToBaseline: ratio,
			verdict,
		});
	};

	const boIdx = findBarIndexByLabel(hit, bars, 'BO');
	if (boIdx >= 0) {
		const ratio = volumeAtIndex(bars, rawBars, boIdx) / baselineAvg;
		addEvent(boIdx, 'breakout', verdictForBreakout(ratio));
	}

	const rtIdx = findBarIndexByLabel(hit, bars, 'RT');
	if (rtIdx >= 0) {
		const ratio = volumeAtIndex(bars, rawBars, rtIdx) / baselineAvg;
		addEvent(rtIdx, 'retest', verdictForRetest(ratio));
	}

	for (const label of ['T1', 'T2', 'B1', 'B2']) {
		const idx = findBarIndexByLabel(hit, bars, label);
		if (idx >= 0) {
			const ratio = volumeAtIndex(bars, rawBars, idx) / baselineAvg;
			const role: VolumeEventRole = label.startsWith('T') ? 'peak' : 'trough';
			let verdict: 'confirming' | 'neutral' | 'weak' = 'neutral';
			if (label === 'T2' || label === 'B2') {
				verdict = ratio <= 1.0 ? 'confirming' : ratio > 1.2 ? 'weak' : 'neutral';
			}
			addEvent(idx, role, verdict);
		}
	}

	if (!events.length) {
		return {
			status: 'unavailable',
			summary: 'No volume events mapped for this pattern.',
			baseline: {barCount: to - from + 1, avgVolume: baselineAvg},
			events: [],
		};
	}

	const hasWeak = events.some(e => e.verdict === 'weak');
	const hasConfirming = events.some(e => e.verdict === 'confirming');
	let status: VolumeConfirmation['status'] = 'mixed';
	if (hasConfirming && !hasWeak) {
		status = 'confirming';
	} else if (hasWeak && !hasConfirming) {
		status = 'weak';
	}

	const parts = events.map(e => `${e.role} ${e.ratioToBaseline.toFixed(1)}×`);
	return {
		status,
		summary: parts.join('; '),
		baseline: {barCount: to - from + 1, avgVolume: baselineAvg},
		events,
	};
}

export type VolumeProfileBin = {priceLo: number; priceHi: number; volume: number};

export function computePatternVolumeProfile(
	hit: ChartPatternHit,
	bars: NormalizedBar[],
	rawBars: Record<string, unknown>[],
	binCount = 8,
): {bins: VolumeProfileBin[]; pocPrice: number; barSpan: ChartPatternHit['barSpan']} | undefined {
	if (!barRowsHaveVolume(rawBars)) {
		return undefined;
	}
	const slice = bars.slice(hit.barSpan.fromIndex, hit.barSpan.toIndex + 1);
	if (!slice.length) {
		return undefined;
	}
	let low = Infinity;
	let high = -Infinity;
	for (const b of slice) {
		low = Math.min(low, b.low);
		high = Math.max(high, b.high);
	}
	if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) {
		return undefined;
	}
	const bins: VolumeProfileBin[] = [];
	const step = (high - low) / binCount;
	for (let i = 0; i < binCount; i++) {
		bins.push({priceLo: low + i * step, priceHi: low + (i + 1) * step, volume: 0});
	}
	for (const b of slice) {
		const v = volumeAtIndex(bars, rawBars, b.index);
		const mid = (b.high + b.low) / 2;
		const idx = Math.min(binCount - 1, Math.max(0, Math.floor((mid - low) / step)));
		bins[idx]!.volume += v;
	}
	const poc = bins.reduce((best, cur) => (cur.volume > best.volume ? cur : best), bins[0]!);
	const pocPrice = (poc.priceLo + poc.priceHi) / 2;
	return {bins, pocPrice, barSpan: hit.barSpan};
}
