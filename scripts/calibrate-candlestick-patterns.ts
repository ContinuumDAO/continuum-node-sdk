#!/usr/bin/env node
/**
 * Offline calibration: measure forward returns per pattern hit on fixture OHLCV.
 * Writes suggested weights to stdout (paste into calibration-weights.ts).
 *
 * Usage: node scripts/calibrate-candlestick-patterns.ts [fixture.json ...]
 */
import {readFileSync, readdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DETECTORS, PATTERN_CATALOG} from '../dist/core/candlestick-patterns/index.js';
import {barsToSeries} from '../dist/core/candlestick-patterns/candle-settings.js';
import type {PatternId} from '../dist/core/candlestick-patterns/types.js';

type Bar = {open: number; high: number; low: number; close: number; time?: number};

function forwardReturnPct(bars: Bar[], idx: number, horizon: number): number | null {
	const end = idx + horizon;
	if (end >= bars.length) {
		return null;
	}
	const startClose = bars[idx]!.close;
	const endClose = bars[end]!.close;
	return ((endClose - startClose) / startClose) * 100;
}

function calibrateOnBars(bars: Bar[], horizon = 3) {
	const series = barsToSeries(bars);
	const stats: Record<
		string,
		{hits: number; wins: number; avgReturn: number; sumReturn: number}
	> = {};

	for (const entry of PATTERN_CATALOG) {
		const detect = DETECTORS[entry.id];
		if (!detect) {
			continue;
		}
		const signals = detect(series);
		stats[entry.id] = {hits: 0, wins: 0, avgReturn: 0, sumReturn: 0};

		for (let i = entry.lookback; i < bars.length - horizon; i++) {
			const signal = signals[i] ?? 0;
			if (signal === 0) {
				continue;
			}
			const ret = forwardReturnPct(bars, i, horizon);
			if (ret == null) {
				continue;
			}
			const s = stats[entry.id]!;
			s.hits += 1;
			s.sumReturn += ret;
			const bullish = entry.tradeBias === 'bullish' || (entry.tradeBias === 'signal' && signal > 0);
			const bearish = entry.tradeBias === 'bearish' || (entry.tradeBias === 'signal' && signal < 0);
			if (bullish && ret > 0) {
				s.wins += 1;
			} else if (bearish && ret < 0) {
				s.wins += 1;
			} else if (entry.tradeBias === 'neutral') {
				s.wins += Math.abs(ret) < 1 ? 1 : 0;
			}
		}
		if (stats[entry.id]!.hits > 0) {
			stats[entry.id]!.avgReturn = stats[entry.id]!.sumReturn / stats[entry.id]!.hits;
		}
	}
	return stats;
}

function loadFixtures(paths: string[]): Bar[] {
	const all: Bar[] = [];
	for (const p of paths) {
		const raw = JSON.parse(readFileSync(p, 'utf8')) as {bars?: Bar[]} | Bar[];
		const bars = Array.isArray(raw) ? raw : (raw.bars ?? []);
		all.push(...bars);
	}
	return all;
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultDir = join(scriptDir, '../test/fixtures/candlestick-patterns');
const args = process.argv.slice(2);
const paths =
	args.length > 0
		? args
		: readdirSync(defaultDir)
				.filter(f => f.endsWith('.json'))
				.map(f => join(defaultDir, f));

if (!paths.length) {
	console.error('No fixture files found.');
	process.exit(1);
}

const bars = loadFixtures(paths);
const stats = calibrateOnBars(bars);

console.log('// Suggested CALIBRATION_WEIGHTS from fixtures:');
console.log('export const CALIBRATION_WEIGHTS: Record<string, number> = {');
for (const entry of PATTERN_CATALOG) {
	const s = stats[entry.id];
	if (!s || s.hits === 0) {
		continue;
	}
	const winRate = s.wins / s.hits;
	const weight = Math.min(0.95, Math.max(0.15, entry.baseWeight * (0.5 + winRate)));
	console.log(`  '${entry.id}': ${weight.toFixed(3)}, // hits=${s.hits} winRate=${(winRate * 100).toFixed(1)}% avgRet=${s.avgReturn.toFixed(2)}%`);
}
console.log('};');
