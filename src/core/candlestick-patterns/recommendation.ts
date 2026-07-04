import {CALIBRATION_WEIGHTS} from './calibration-weights.js';
import {getPatternCatalogEntry} from './catalog.js';
import type {PatternHit, PatternId, PatternRecommendation} from './types.js';

function weightFor(id: PatternId, baseWeight: number): number {
	return CALIBRATION_WEIGHTS[id] ?? baseWeight;
}

export function buildPatternRecommendation(hits: PatternHit[]): PatternRecommendation {
	if (!hits.length) {
		return {
			recommendation: 'hold',
			recommendationConfidence: 0.1,
			rationale:
				'No candlestick patterns detected on the focus bar. Standalone patterns are weak signals (~50–55% hit rate); combine with trend context.',
			primaryPattern: null,
		};
	}

	const weighted = hits.map(hit => {
		const entry = getPatternCatalogEntry(hit.id);
		const base = entry ? weightFor(hit.id, entry.baseWeight) : hit.confidence;
		return {...hit, score: base * (Math.abs(hit.signal) / 100)};
	});

	const primary = weighted.reduce((best, cur) => (cur.score > best.score ? cur : best));

	let bullish = 0;
	let bearish = 0;
	let neutral = 0;
	for (const hit of weighted) {
		if (hit.direction === 'bullish') {
			bullish += hit.score;
		} else if (hit.direction === 'bearish') {
			bearish += hit.score;
		} else {
			neutral += hit.score;
		}
	}

	let recommendation: 'buy' | 'sell' | 'hold' = 'hold';
	let recommendationConfidence = 0.2;

	const directionalOnly = weighted.filter(h => h.direction !== 'neutral');
	if (directionalOnly.length === 0) {
		recommendation = 'hold';
		recommendationConfidence = Math.min(0.35, neutral > 0 ? 0.3 : 0.15);
	} else if (bullish > bearish * 1.2) {
		recommendation = 'buy';
		recommendationConfidence = scoreToConfidence(bullish, bearish, directionalOnly.length);
	} else if (bearish > bullish * 1.2) {
		recommendation = 'sell';
		recommendationConfidence = scoreToConfidence(bearish, bullish, directionalOnly.length);
	} else {
		recommendation = 'hold';
		recommendationConfidence = Math.min(0.4, Math.max(bullish, bearish));
	}

	const primaryPattern = {
		id: primary.id,
		name: primary.name,
		description: primary.description,
	};

	const directionWord =
		recommendation === 'buy' ? 'bullish' : recommendation === 'sell' ? 'bearish' : 'neutral/indecision';
	const confLabel =
		recommendationConfidence >= 0.75
			? 'high'
			: recommendationConfidence >= 0.5
				? 'moderate'
				: 'low';

	let rationale = `${primary.name} detected — ${primary.description} Overall ${directionWord} bias; ${confLabel} confidence.`;
	if (weighted.length > 1) {
		rationale += ` ${weighted.length} patterns matched on the focus bar.`;
	}
	if (recommendation === 'hold' && directionalOnly.length === 0) {
		rationale =
			`${primary.name} detected — ${primary.description} Indecision pattern; hold recommended with low confidence.`;
	}
	rationale +=
		' Standalone candlestick patterns are historically ~50–55% accurate; use as a filter with trend context.';

	return {
		recommendation,
		recommendationConfidence: Math.round(recommendationConfidence * 1000) / 1000,
		rationale,
		primaryPattern,
	};
}

function scoreToConfidence(leading: number, opposing: number, directionalCount: number): number {
	let confidence = Math.min(0.95, leading / (leading + opposing + 0.25));
	if (leading >= 0.7) {
		confidence = Math.max(confidence, 0.75);
	}
	if (directionalCount >= 2 && leading >= 0.5) {
		confidence = Math.min(0.95, confidence + 0.1);
	}
	return confidence;
}
