import {getPatternCatalogEntry, PATTERN_CATALOG, resolvePatternId} from './catalog.js';
import {DETECTORS} from './patterns/detect.js';
import {barsToSeries} from './candle-settings.js';
import type {OhlcBar, PatternHit, PatternId} from './types.js';

export function scanCandlestickPatterns(
	bars: OhlcBar[],
	options?: {patternIds?: PatternId[]; barIndex?: number},
): PatternHit[] {
	if (!bars.length) {
		return [];
	}
	const series = barsToSeries(bars);
	const ids =
		options?.patternIds ??
		(PATTERN_CATALOG.map(e => e.id) as PatternId[]);
	const targetIndex =
		options?.barIndex ?? bars.length - 1;
	const hits: PatternHit[] = [];

	for (const id of ids) {
		const entry = getPatternCatalogEntry(id);
		const detect = DETECTORS[id];
		if (!entry || !detect) {
			continue;
		}
		const signals = detect(series);
		const signal = signals[targetIndex] ?? 0;
		if (signal === 0) {
			continue;
		}
		const direction = directionFromSignal(entry.tradeBias, signal);
		const confidence = Math.min(
			0.95,
			entry.baseWeight * (Math.abs(signal) / 100),
		);
		hits.push({
			id,
			name: entry.name,
			description: entry.description,
			taLibName: entry.taLibName,
			signal,
			direction,
			confidence,
			barIndex: targetIndex,
		});
	}

	return hits.sort((a, b) => b.confidence - a.confidence);
}

export function directionFromSignal(
	tradeBias: 'bullish' | 'bearish' | 'neutral' | 'signal',
	signal: number,
): 'bullish' | 'bearish' | 'neutral' {
	if (tradeBias === 'bullish') {
		return 'bullish';
	}
	if (tradeBias === 'bearish') {
		return 'bearish';
	}
	if (tradeBias === 'neutral') {
		return 'neutral';
	}
	if (signal > 0) {
		return 'bullish';
	}
	if (signal < 0) {
		return 'bearish';
	}
	return 'neutral';
}

export function filterPatternIds(names?: string[]): PatternId[] | undefined {
	if (!names?.length) {
		return undefined;
	}
	const resolved: PatternId[] = [];
	for (const name of names) {
		const id = resolvePatternId(name);
		if (id) {
			resolved.push(id);
		}
	}
	return resolved.length ? resolved : undefined;
}
