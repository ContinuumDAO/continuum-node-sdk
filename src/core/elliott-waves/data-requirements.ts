import type {EffectiveWaveDegree, ElliottDataStatus} from './types.js';
import {THRESHOLDS} from './constants.js';

export type DegreeRequirements = {
	degree: EffectiveWaveDegree;
	minBars: number;
	label: string;
};

const DEGREE_REQUIREMENTS: DegreeRequirements[] = [
	{degree: 'primary', minBars: 400, label: 'primary'},
	{degree: 'intermediate', minBars: 200, label: 'intermediate'},
	{degree: 'minor', minBars: 80, label: 'minor'},
];

function parseIntervalHours(interval?: string): number | null {
	if (!interval) {
		return null;
	}
	const normalized = interval.trim().toLowerCase();
	const m = normalized.match(/^(\d+(?:\.\d+)?)\s*(m|min|h|hr|hour|d|day|w|wk|week)?$/);
	if (!m) {
		return null;
	}
	const n = Number(m[1]);
	const unit = m[2] ?? 'h';
	if (unit.startsWith('m')) {
		return n / 60;
	}
	if (unit.startsWith('h')) {
		return n;
	}
	if (unit.startsWith('d')) {
		return n * 24;
	}
	if (unit.startsWith('w')) {
		return n * 24 * 7;
	}
	return n;
}

export function inferEffectiveDegree(input: {
	barCount: number;
	interval?: string;
}): DegreeRequirements {
	const hours = parseIntervalHours(input.interval);
	let candidate: DegreeRequirements = DEGREE_REQUIREMENTS[DEGREE_REQUIREMENTS.length - 1]!;

	if (input.barCount >= 400) {
		candidate = DEGREE_REQUIREMENTS[0]!;
	} else if (input.barCount >= 200) {
		candidate = DEGREE_REQUIREMENTS[1]!;
	} else if (input.barCount >= 80) {
		candidate = DEGREE_REQUIREMENTS[2]!;
	}

	if (hours != null) {
		if (hours <= 1 && input.barCount < 300) {
			candidate = DEGREE_REQUIREMENTS[2]!;
		} else if (hours <= 4 && input.barCount < 500) {
			candidate = candidate.degree === 'primary' ? DEGREE_REQUIREMENTS[1]! : candidate;
		}
	}

	return candidate;
}

function suggestAlternative(input: {
	barCount: number;
	interval?: string;
	minBars: number;
}): string {
	const hours = parseIntervalHours(input.interval);
	if (hours != null && hours <= 1) {
		const daysNeeded = Math.ceil((input.minBars * hours) / 24);
		return `Try 4H × ${Math.max(30, daysNeeded * 2)}d or 1H × ${Math.max(14, daysNeeded)}d.`;
	}
	if (hours != null && hours <= 4) {
		return `Try 1D × ${Math.max(90, Math.ceil(input.minBars / 6))}d or extend lookback.`;
	}
	return `Extend lookback to load at least ${input.minBars} bars.`;
}

export function assessElliottWaveDataSufficiency(input: {
	barCount: number;
	interval?: string;
}): {
	status: ElliottDataStatus;
	effectiveDegree: EffectiveWaveDegree;
	minBarsRequired: number;
	guidance: string;
	absoluteReject: boolean;
} {
	const req = inferEffectiveDegree(input);
	const intervalLabel = input.interval?.trim() || 'current interval';

	if (input.barCount < THRESHOLDS.absoluteMinBars) {
		return {
			status: 'insufficient_data',
			effectiveDegree: req.degree,
			minBarsRequired: THRESHOLDS.absoluteMinBars,
			guidance:
				`Elliott wave analysis needs at least ${THRESHOLDS.absoluteMinBars} OHLCV bars (got ${input.barCount}). ` +
				suggestAlternative({...input, minBars: THRESHOLDS.absoluteMinBars}),
			absoluteReject: true,
		};
	}

	if (input.barCount < req.minBars) {
		return {
			status: 'insufficient_data',
			effectiveDegree: req.degree,
			minBarsRequired: req.minBars,
			guidance:
				`Elliott wave analysis at ${intervalLabel} needs ≥${req.minBars} bars for ${req.label} degree (have ${input.barCount}). ` +
				suggestAlternative({...input, minBars: req.minBars}),
			absoluteReject: false,
		};
	}

	return {
		status: 'ok',
		effectiveDegree: req.degree,
		minBarsRequired: req.minBars,
		guidance: '',
		absoluteReject: false,
	};
}

export function formatPrice(price: number): string {
	if (price >= 1000) {
		return price.toLocaleString('en-US', {maximumFractionDigits: 2});
	}
	if (price >= 1) {
		return price.toFixed(2);
	}
	return price.toPrecision(4);
}
