import type {
	ChartPatternClassification,
	ChartPatternDirection,
} from './types.js';

export const CLASSIFICATION_HIGH = 0.7;
export const CLASSIFICATION_MODERATE = 0.45;
export const DEFAULT_MIN_CONFIDENCE = 0.45;

export function clampConfidence(value: number): number {
	if (!Number.isFinite(value)) {
		return 0;
	}
	return Math.max(0, Math.min(1, Math.round(value * 1000) / 1000));
}

export function classifyPattern(
	direction: ChartPatternDirection,
	confidence: number,
): ChartPatternClassification {
	if (direction === 'neutral') {
		return 'neutral';
	}
	if (direction === 'bullish') {
		return confidence >= CLASSIFICATION_HIGH ? 'bullish' : 'moderately_bullish';
	}
	return confidence >= CLASSIFICATION_HIGH ? 'bearish' : 'moderately_bearish';
}

export function classificationLabel(classification: ChartPatternClassification): string {
	switch (classification) {
		case 'bullish':
			return 'bullish';
		case 'moderately_bullish':
			return 'moderately bullish';
		case 'neutral':
			return 'neutral';
		case 'moderately_bearish':
			return 'moderately bearish';
		case 'bearish':
			return 'bearish';
	}
}

export function confidenceLabel(confidence: number): string {
	if (confidence >= CLASSIFICATION_HIGH) {
		return 'high';
	}
	if (confidence >= CLASSIFICATION_MODERATE) {
		return 'moderate';
	}
	return 'low';
}

export function withinPct(a: number, b: number, pct: number): boolean {
	const denom = Math.max(Math.abs(a), Math.abs(b), 1e-8);
	return Math.abs(a - b) / denom <= pct;
}

export function pctDiff(a: number, b: number): number {
	const denom = Math.max(Math.abs(a), Math.abs(b), 1e-8);
	return Math.abs(a - b) / denom;
}

export function blendConfidence(...parts: Array<number | undefined>): number {
	const values = parts.filter((v): v is number => v != null && Number.isFinite(v));
	if (!values.length) {
		return 0;
	}
	const product = values.reduce((acc, v) => acc * Math.max(0.05, Math.min(1, v)), 1);
	return clampConfidence(Math.pow(product, 1 / values.length));
}
