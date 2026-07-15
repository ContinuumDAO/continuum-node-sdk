import type {AnalyzeElliottWavesResult} from '../../../elliott-waves/analyze.js';
import type {TradeSetupSide, TradeSetupStatus} from './shared.js';
import {isFiniteTradePrice} from './shared.js';
import {THRESHOLDS} from '../../../elliott-waves/constants.js';

export type ElliottWaveTradeSetup = {
	status: TradeSetupStatus;
	source: 'elliott_waves';
	side: TradeSetupSide;
	confidence: number;
	lastClose: number;
	trendDirection: 'up' | 'down';
	patternType: 'impulse' | 'diagonal' | 'corrective';
	inProgressWave?: string;
	confirmedWaveCount: number;
	triggerPrice?: number;
	triggerLabel?: string;
	targetPrice?: number;
	targetLabel?: string;
	invalidationPrice?: number;
	invalidationLabel?: string;
	projectionTargets?: Array<{
		price: number;
		fibLevel: number;
		probability: number;
		label: string;
	}>;
	waveMenuNumber?: number;
	setupPurposeCode?: 'ew-imp' | 'ew-dia' | 'ew-corr';
	unclearReason?: string;
	dataGuidance?: string;
};

function sideFromTrend(trendDirection: 'up' | 'down', patternType: string): TradeSetupSide {
	if (patternType === 'corrective') {
		return 'neutral';
	}
	return trendDirection === 'up' ? 'long' : 'short';
}

function purposeCode(patternType: 'impulse' | 'diagonal' | 'corrective'): ElliottWaveTradeSetup['setupPurposeCode'] {
	switch (patternType) {
		case 'diagonal':
			return 'ew-dia';
		case 'corrective':
			return 'ew-corr';
		default:
			return 'ew-imp';
	}
}

export function buildElliottWaveTradeSetup(
	analysis: AnalyzeElliottWavesResult,
	waveMenuNumber = 1,
): ElliottWaveTradeSetup {
	const base: ElliottWaveTradeSetup = {
		status: 'unclear',
		source: 'elliott_waves',
		side: 'neutral',
		confidence: analysis.confidence,
		lastClose: analysis.lastClose,
		trendDirection: analysis.trendDirection,
		patternType: analysis.patternType,
		confirmedWaveCount: analysis.confirmedWaveCount,
		waveMenuNumber,
		setupPurposeCode: purposeCode(analysis.patternType),
	};

	if (analysis.dataStatus === 'insufficient_data') {
		return {
			...base,
			dataGuidance: analysis.dataGuidance,
			unclearReason: analysis.dataGuidance || 'Insufficient OHLCV bars for Elliott wave analysis.',
		};
	}

	if (analysis.patternType === 'corrective') {
		return {
			...base,
			inProgressWave: analysis.inProgressWave,
			unclearReason: 'Structure classified as corrective A–B–C; directional trade setup withheld.',
		};
	}

	const side = sideFromTrend(analysis.trendDirection, analysis.patternType);
	const inProgress = analysis.waves.find(w => w.isInProgress);
	const topTarget = inProgress?.projection?.targets
		.slice()
		.sort((a, b) => b.probability - a.probability)[0];
	const invalidation = inProgress?.projection?.invalidationPoint;

	let unclearReason: string | undefined;
	if (analysis.confidence < THRESHOLDS.minTradeConfidence) {
		unclearReason = `Confidence ${(analysis.confidence * 100).toFixed(0)}% below ${(THRESHOLDS.minTradeConfidence * 100).toFixed(0)}% threshold.`;
	}
	if (analysis.confirmedWaveCount < 2) {
		unclearReason = 'Fewer than two Elliott waves confirmed; wait for more structure.';
	}
	if (!topTarget || !isFiniteTradePrice(topTarget.price)) {
		unclearReason = unclearReason ?? 'No projection target available for in-progress wave.';
	}
	if (invalidation == null || !isFiniteTradePrice(invalidation)) {
		unclearReason = unclearReason ?? 'No invalidation level available.';
	}

	const setup: ElliottWaveTradeSetup = {
		...base,
		side,
		inProgressWave: analysis.inProgressWave,
		triggerPrice: analysis.lastClose,
		triggerLabel: 'last close',
		...(topTarget
			? {
					targetPrice: topTarget.price,
					targetLabel: `W${analysis.inProgressWave ?? '?'} target ${topTarget.fibonacciLevel}×`,
					projectionTargets: inProgress?.projection?.targets.map(t => ({
						price: t.price,
						fibLevel: t.fibonacciLevel,
						probability: t.probability,
						label: `${t.fibonacciLevel}× (${(t.probability * 100).toFixed(0)}%)`,
					})),
				}
			: {}),
		...(invalidation != null && isFiniteTradePrice(invalidation)
			? {invalidationPrice: invalidation, invalidationLabel: 'Wave invalidation'}
			: {}),
	};

	if (unclearReason) {
		return {...setup, status: 'unclear', unclearReason};
	}

	if (side === 'long' && invalidation != null && invalidation >= analysis.lastClose) {
		return {...setup, status: 'unclear', unclearReason: 'Invalidation is not below entry for long setup.'};
	}
	if (side === 'short' && invalidation != null && invalidation <= analysis.lastClose) {
		return {...setup, status: 'unclear', unclearReason: 'Invalidation is not above entry for short setup.'};
	}

	return {...setup, status: 'clear'};
}

export function normalizeElliottWaveTradeSetup(setup: ElliottWaveTradeSetup) {
	return {
		status: setup.status,
		side: setup.side,
		confidence: setup.confidence,
		lastClose: setup.lastClose,
		entry:
			setup.triggerPrice != null && isFiniteTradePrice(setup.triggerPrice)
				? {price: setup.triggerPrice, label: setup.triggerLabel}
				: undefined,
		target:
			setup.targetPrice != null && isFiniteTradePrice(setup.targetPrice)
				? {price: setup.targetPrice, label: setup.targetLabel}
				: undefined,
		invalidation:
			setup.invalidationPrice != null && isFiniteTradePrice(setup.invalidationPrice)
				? {price: setup.invalidationPrice, label: setup.invalidationLabel}
				: undefined,
		unclearReason: setup.unclearReason ?? setup.dataGuidance,
	};
}
