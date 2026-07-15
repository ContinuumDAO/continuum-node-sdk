/**
 * Elliott Wave analysis orchestration — SmarterSystems ElliottWavesEngine port (MIT).
 */
import {barTimeSecFromRow} from '../chart/live/bar-merge.js';
import {coerceFiniteNumber} from '../chart/point-normalize.js';
import type {
	DrawableElliottWaveSet,
	EffectiveWaveDegree,
	ElliottWave,
	ElliottWaveKeyLevel,
	ElliottWaveMenuEntry,
	OhlcvBar,
} from './types.js';
import {assessElliottWaveDataSufficiency, formatPrice, inferEffectiveDegree} from './data-requirements.js';
import {detectImpulseWaves} from './impulse-detector.js';
import {THRESHOLDS} from './constants.js';
import {waveLabelToRoman} from './wave-labeler.js';

export function barsFromOhlcvRows(rows: Record<string, unknown>[]): OhlcvBar[] {
	const out: OhlcvBar[] = [];
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i]!;
		const timeSec = barTimeSecFromRow(row);
		const open = coerceFiniteNumber(row.open);
		const high = coerceFiniteNumber(row.high);
		const low = coerceFiniteNumber(row.low);
		const close = coerceFiniteNumber(row.close);
		if (timeSec == null || open == null || high == null || low == null || close == null) {
			continue;
		}
		out.push({index: out.length, timeSec, open, high, low, close});
	}
	for (let i = 0; i < out.length; i++) {
		out[i]!.index = i;
	}
	return out;
}

function computeConfidence(waves: ElliottWave[], patternType: string, dataOk: boolean): number {
	if (!dataOk) {
		return 0.2;
	}
	let confidence = 0.25;
	const confirmed = waves.filter(w => !w.isInProgress).length;
	confidence += confirmed * 0.1;

	for (const w of waves) {
		if (w.justification) {
			const devPenalty = Math.min(0.08, w.justification.deviation * 2);
			confidence += 0.04 - devPenalty;
		}
	}

	if (patternType === 'corrective') {
		confidence -= 0.1;
	}
	if (patternType === 'diagonal') {
		confidence -= 0.05;
	}
	if (confirmed <= 1) {
		confidence -= 0.15;
	}

	const inProgress = waves.find(w => w.isInProgress);
	if (inProgress?.projection?.targets.length) {
		confidence += 0.05;
	}

	return Math.max(0.1, Math.min(0.9, confidence));
}

function buildKeyLevels(waves: ElliottWave[]): ElliottWaveKeyLevel[] {
	const levels: ElliottWaveKeyLevel[] = [];
	const inProgress = waves.find(w => w.isInProgress);
	if (inProgress?.projection) {
		for (const t of inProgress.projection.targets) {
			levels.push({
				price: t.price,
				label: `Target ${t.fibonacciLevel}× (${(t.probability * 100).toFixed(0)}%)`,
				role: 'target',
			});
		}
		if (inProgress.projection.invalidationPoint != null) {
			levels.push({
				price: inProgress.projection.invalidationPoint,
				label: 'Invalidation',
				role: 'invalidation',
			});
		}
	}
	for (const w of waves) {
		if (!w.isInProgress) {
			levels.push({
				price: w.endPoint.price,
				label: `Wave ${waveLabelToRoman(w.label, false)} end`,
				role: 'pivot',
			});
		}
	}
	return levels;
}

function buildInterpretation(input: {
	degree: EffectiveWaveDegree;
	trendDirection: 'up' | 'down';
	patternType: string;
	waves: ElliottWave[];
	confidence: number;
	dataGuidance?: string;
	lastClose: number;
}): string {
	if (input.dataGuidance) {
		return input.dataGuidance;
	}

	const dir = input.trendDirection === 'up' ? 'uptrend' : 'downtrend';
	const labels = input.waves.map(w => waveLabelToRoman(w.label, w.isInProgress));
	const confirmed = labels.filter(l => !l.startsWith('(')).join('–');
	const inProgress = input.waves.find(w => w.isInProgress);
	const topTarget = inProgress?.projection?.targets.sort((a, b) => b.probability - a.probability)[0];
	const invalidation = inProgress?.projection?.invalidationPoint;

	const parts: string[] = [];
	parts.push(
		`${input.degree.charAt(0).toUpperCase() + input.degree.slice(1)} ${dir} ${input.patternType}: waves ${confirmed || 'I'} identified.`,
	);

	if (inProgress) {
		const progLabel = waveLabelToRoman(inProgress.label, true);
		parts.push(`Wave ${progLabel.replace(/[()]/g, '')} in progress.`);
		if (topTarget) {
			parts.push(`Primary target $${formatPrice(topTarget.price)} (${topTarget.fibonacciLevel}×, ${(topTarget.probability * 100).toFixed(0)}% weight).`);
		}
		if (invalidation != null) {
			parts.push(`Invalidation at $${formatPrice(invalidation)}.`);
		}
	}

	parts.push(`Confidence ${(input.confidence * 100).toFixed(0)}%.`);
	return parts.join(' ');
}

export function buildDrawableWaves(input: {
	waves: ElliottWave[];
	patternType: 'impulse' | 'diagonal' | 'corrective';
	degree: EffectiveWaveDegree;
}): DrawableElliottWaveSet {
	const drawableWaves = input.waves.map(w => ({
		label: waveLabelToRoman(w.label, w.isInProgress),
		pointA: {timeSec: w.startPoint.timeSec, price: w.startPoint.price},
		pointB: {
			timeSec: w.isInProgress ? w.startPoint.timeSec : w.endPoint.timeSec,
			price: w.isInProgress ? w.startPoint.price : w.endPoint.price,
		},
		kind: (w.label === 'Two' || w.label === 'Four' || w.label === 'B' ? 'corrective' : 'motive') as
			| 'motive'
			| 'corrective',
		isInProgress: w.isInProgress,
	}));

	const markers = input.waves.flatMap(w => {
		const pts = [w.startPoint];
		if (!w.isInProgress) {
			pts.push(w.endPoint);
		}
		return pts.map(p => ({
			timeSec: p.timeSec,
			price: p.price,
			label: waveLabelToRoman(w.label, w.isInProgress),
		}));
	});

	const levels: DrawableElliottWaveSet['levels'] = [];
	const inProgress = input.waves.find(w => w.isInProgress);
	if (inProgress?.projection) {
		const targets = [...inProgress.projection.targets].sort(
			(a, b) => b.probability - a.probability || b.fibonacciLevel - a.fibonacciLevel,
		);
		for (const t of targets.slice(0, 2)) {
			levels.push({
				price: t.price,
				label: `W${waveLabelToRoman(inProgress.label, false)} target ${t.fibonacciLevel}×`,
				kind: 'level',
				role: 'target',
			});
		}
		if (inProgress.projection.invalidationPoint != null) {
			levels.push({
				price: inProgress.projection.invalidationPoint,
				label: 'Invalidation',
				kind: input.patternType === 'impulse' && input.waves[0]?.startPoint.price
					? 'support'
					: 'level',
				role: 'invalidation',
			});
		}
	}

	const times = input.waves.flatMap(w => [w.startPoint.timeSec, w.endPoint.timeSec]);
	return {
		patternName: `Elliott ${input.patternType} (${input.degree})`,
		degree: input.degree,
		patternType: input.patternType,
		waves: drawableWaves,
		markers,
		levels,
		clipToBarSpan: {
			fromTimeSec: Math.min(...times),
			toTimeSec: Math.max(...times),
		},
	};
}

export function buildWaveMenu(input: {
	waves: ElliottWave[];
	patternType: 'impulse' | 'diagonal' | 'corrective';
	degree: EffectiveWaveDegree;
	confidence: number;
}): ElliottWaveMenuEntry[] {
	const keyLevels = buildKeyLevels(input.waves);
	const inProgress = input.waves.find(w => w.isInProgress);
	const labels = input.waves.map(w => waveLabelToRoman(w.label, w.isInProgress));
	const times = input.waves.flatMap(w => [w.startPoint.timeSec, w.endPoint.timeSec]);

	return [
		{
			index: 0,
			waveMenuNumber: 1,
			degree: input.degree,
			patternType: input.patternType,
			labels,
			barSpan: {fromTimeSec: Math.min(...times), toTimeSec: Math.max(...times)},
			confidence: input.confidence,
			isPrimary: true,
			keyLevels,
			...(inProgress?.projection?.invalidationPoint != null
				? {
						invalidation: {
							price: inProgress.projection.invalidationPoint,
							label: 'Invalidation',
						},
					}
				: {}),
		},
	];
}

export type AnalyzeElliottWavesResult = {
	dataStatus: 'ok' | 'insufficient_data';
	dataGuidance: string;
	effectiveDegree: EffectiveWaveDegree;
	minBarsRequired: number;
	trendDirection: 'up' | 'down';
	patternType: 'impulse' | 'diagonal' | 'corrective';
	confirmedWaveCount: number;
	inProgressWave?: string;
	interpretation: string;
	confidence: number;
	waveMenu: ElliottWaveMenuEntry[];
	keyLevels: ElliottWaveKeyLevel[];
	drawableWaves: DrawableElliottWaveSet;
	waves: ElliottWave[];
	lastClose: number;
};

export function analyzeElliottWaves(input: {
	bars: Record<string, unknown>[];
	interval?: string;
}): AnalyzeElliottWavesResult {
	const ohlcv = barsFromOhlcvRows(input.bars);
	const lastClose = ohlcv.length ? ohlcv[ohlcv.length - 1]!.close : 0;
	const dataCheck = assessElliottWaveDataSufficiency({
		barCount: ohlcv.length,
		interval: input.interval,
	});
	const degree = dataCheck.effectiveDegree;

	if (dataCheck.absoluteReject || ohlcv.length < 2) {
		return {
			dataStatus: 'insufficient_data',
			dataGuidance: dataCheck.guidance,
			effectiveDegree: degree,
			minBarsRequired: dataCheck.minBarsRequired,
			trendDirection: 'up',
			patternType: 'impulse',
			confirmedWaveCount: 0,
			interpretation: dataCheck.guidance,
			confidence: 0.15,
			waveMenu: [],
			keyLevels: [],
			drawableWaves: {
				patternName: 'Elliott wave (insufficient data)',
				degree,
				patternType: 'impulse',
				waves: [],
				markers: [],
				levels: [],
				clipToBarSpan: {fromTimeSec: 0, toTimeSec: 0},
			},
			waves: [],
			lastClose,
		};
	}

	const analysis = detectImpulseWaves(ohlcv, degree);
	const dataOk = dataCheck.status === 'ok';
	const confidence = computeConfidence(analysis.waves, analysis.patternType, dataOk);
	const drawableWaves = buildDrawableWaves({
		waves: analysis.waves,
		patternType: analysis.patternType,
		degree,
	});
	const waveMenu = buildWaveMenu({
		waves: analysis.waves,
		patternType: analysis.patternType,
		degree,
		confidence,
	});
	const keyLevels = buildKeyLevels(analysis.waves);
	const dataGuidance = dataOk ? '' : dataCheck.guidance;
	const interpretation = buildInterpretation({
		degree,
		trendDirection: analysis.trendDirection,
		patternType: analysis.patternType,
		waves: analysis.waves,
		confidence,
		dataGuidance: dataOk ? undefined : dataGuidance,
		lastClose,
	});

	return {
		dataStatus: dataCheck.status,
		dataGuidance,
		effectiveDegree: degree,
		minBarsRequired: dataCheck.minBarsRequired,
		trendDirection: analysis.trendDirection,
		patternType: analysis.patternType,
		confirmedWaveCount: analysis.confirmedWaveCount,
		inProgressWave: analysis.inProgressWave,
		interpretation,
		confidence,
		waveMenu,
		keyLevels,
		drawableWaves,
		waves: analysis.waves,
		lastClose,
	};
}

export {THRESHOLDS, inferEffectiveDegree, assessElliottWaveDataSufficiency};
