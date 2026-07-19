/**
 * Single-window impulse detection — adapted from CycleDetector (SmarterSystems ElliottWavesEngine, MIT).
 */
import type {EffectiveWaveDegree, ElliottWave, ElliottWavesAnalysis, OhlcvBar, PivotPoint, WaveNumber} from './types.js';
import {FIB_EXT_C, THRESHOLDS} from './constants.js';
import {
	buildExtensionProjection,
	buildRetracementProjection,
	buildW5Projection,
	makeJustification,
	w2RetraceLevels,
	w3ExtensionLevels,
	w4RetraceLevels,
} from './projection-builder.js';
import {
	findAbsoluteExtreme,
	findConfirmedExtreme,
	findFibExtensionPivot,
	findFibRetracementPivot,
	findWave1,
	hasRecovery,
} from './pivot-scanner.js';
import {exceedsInDirection, logDistance, logPrice} from './wave-math.js';
import {
	createCorrectiveWaves,
	createImpulseWaves,
	createInProgressWave,
} from './wave-labeler.js';

function findW0(bars: OhlcvBar[]): {w0: PivotPoint; isUptrend: boolean} {
	const absLow = findAbsoluteExtreme(bars, false);
	const absHigh = findAbsoluteExtreme(bars, true);

	if (absLow.index <= absHigh.index) {
		return {w0: absLow, isUptrend: true};
	}
	if (absHigh.index > 0) {
		const w0 = findAbsoluteExtreme(bars, false, 0, absHigh.index);
		return {w0, isUptrend: true};
	}
	return {w0: absHigh, isUptrend: false};
}

function hasSignificantReversal(
	bars: OhlcvBar[],
	extreme: PivotPoint,
	priorPoint: PivotPoint,
	isUptrend: boolean,
	threshold = THRESHOLDS.defaultRecoveryThreshold,
): boolean {
	if (extreme.index >= bars.length - 1) {
		return false;
	}
	const logExtreme = logPrice(extreme.price);
	const logPrior = logPrice(priorPoint.price);
	const move = Math.abs(logExtreme - logPrior);
	return hasRecovery(
		bars,
		extreme.index,
		bars.length - 1,
		logExtreme,
		move,
		isUptrend,
		threshold,
	);
}

function buildW2InProgress(
	w0: PivotPoint,
	w1: PivotPoint,
	degree: EffectiveWaveDegree,
): ElliottWave[] {
	const w2Projection = buildRetracementProjection(w0.price, w1.price, w2RetraceLevels(), w0.price);
	return createImpulseWaves({
		pivots: [w0, w1],
		justifications: [null],
		degree,
		inProgressLabel: 'Two',
		inProgressProjection: w2Projection,
		inProgressStart: w1,
	});
}

function buildCorrectiveFromMorph(
	w0: PivotPoint,
	w1: PivotPoint,
	w2: PivotPoint,
	bars: OhlcvBar[],
	degree: EffectiveWaveDegree,
): ElliottWave[] {
	const pivots = [w0, w1, w2];
	const lastClose = bars[bars.length - 1]!.close;
	const cProjection = buildExtensionProjection({
		waveStart: w0.price,
		waveEnd: w1.price,
		extensionBase: w2.price,
		levels: FIB_EXT_C,
		invalidation: w0.price,
		currentPrice: lastClose,
	});
	return createCorrectiveWaves({
		pivots,
		justifications: [null, null],
		degree,
		patternType: 'ZigZag',
		inProgressLabel: 'C',
		inProgressProjection: cProjection,
		inProgressStart: w2,
	});
}

function findW1(bars: OhlcvBar[], w0: PivotPoint, isUptrend: boolean): PivotPoint | null {
	const result = findWave1(bars, w0, isUptrend);
	if (result) {
		return result.w1;
	}
	const ath = findAbsoluteExtreme(bars, isUptrend, w0.index + 1);
	return ath.index < bars.length - 1 ? ath : null;
}

function isDiagonalOverlap(w4: PivotPoint, w1: PivotPoint, isUptrend: boolean): boolean {
	return isUptrend ? w4.price <= w1.price : w4.price >= w1.price;
}

export function detectImpulseWaves(
	bars: OhlcvBar[],
	degree: EffectiveWaveDegree,
): ElliottWavesAnalysis {
	if (bars.length < 2) {
		const w0 = findAbsoluteExtreme(bars, true);
		return {
			waves: [createInProgressWave({
				start: w0,
				label: 'One',
				degree,
				projection: {targets: [], invalidationPoint: null},
			})],
			trendDirection: 'up',
			patternType: 'impulse',
			confirmedWaveCount: 0,
			inProgressWave: 'One',
			w0,
		};
	}

	const {w0, isUptrend} = findW0(bars);
	const trendDirection = isUptrend ? 'up' : 'down';
	const isIntermediate = degree === 'minor' || degree === 'intermediate';
	const lastClose = bars[bars.length - 1]!.close;

	const w1 = findW1(bars, w0, isUptrend);
	if (!w1) {
		return {
			waves: [createInProgressWave({
				start: w0,
				label: 'One',
				degree,
				projection: {targets: [], invalidationPoint: null},
			})],
			trendDirection,
			patternType: 'impulse',
			confirmedWaveCount: 0,
			inProgressWave: 'One',
			w0,
		};
	}

	const w2Match = findFibRetracementPivot({
		bars,
		waveStart: w0,
		waveEnd: w1,
		levels: w2RetraceLevels(),
		isUptrend,
		fromIndex: w1.index + 1,
	});
	const w2 =
		w2Match?.pivot ??
		findConfirmedExtreme(bars, w1, !isUptrend);

	if (!w2) {
		const waves = buildW2InProgress(w0, w1, degree);
		return {
			waves,
			trendDirection,
			patternType: 'impulse',
			confirmedWaveCount: 1,
			inProgressWave: 'Two',
			w0,
		};
	}

	if (isUptrend ? w2.price <= w0.price : w2.price >= w0.price) {
		const waves = buildCorrectiveFromMorph(w0, w1, w2, bars, degree);
		return {
			waves,
			trendDirection,
			patternType: 'corrective',
			confirmedWaveCount: 2,
			inProgressWave: 'C',
			w0,
		};
	}

	const w2Just = w2Match
		? makeJustification({
				fibLevel: w2Match.fibLevel,
				deviation: w2Match.deviation,
				type: 'Retracement',
				description: `${(w2Match.fibLevel * 100).toFixed(1)}% retrace of W0→W1`,
			})
		: null;

	const w3Match = findFibExtensionPivot({
		bars,
		waveStart: w0.price,
		waveEnd: w1.price,
		extensionBase: w2,
		levels: w3ExtensionLevels(isIntermediate),
		isUptrend,
		fromIndex: w2.index + 1,
	});

	let w3 = w3Match?.pivot ?? findAbsoluteExtreme(bars, isUptrend, w2.index + 1);
	const w3ExceedsW1 = exceedsInDirection(w3.price, w1.price, isUptrend);
	const w1LogLen = logDistance(w0.price, w1.price);
	const w3LogLen = logDistance(w2.price, w3.price);
	const w3LengthOk = w3LogLen >= w1LogLen * THRESHOLDS.w3LengthTolerance;
	const w3Confirmed = w3ExceedsW1 && w3LengthOk && hasSignificantReversal(bars, w3, w2, isUptrend);

	if (!w3ExceedsW1 || !w3LengthOk || !w3Confirmed) {
		const w2Completed = w3ExceedsW1;
		if (w2Completed) {
			const w3Projection = buildExtensionProjection({
				waveStart: w0.price,
				waveEnd: w1.price,
				extensionBase: w2.price,
				levels: w3ExtensionLevels(isIntermediate),
				invalidation: w0.price,
				isW3: true,
				isIntermediate,
				currentPrice: lastClose,
			});
			const waves = createImpulseWaves({
				pivots: [w0, w1, w2],
				justifications: [null, w2Just],
				degree,
				inProgressLabel: 'Three',
				inProgressProjection: w3Projection,
				inProgressStart: w2,
			});
			return {
				waves,
				trendDirection,
				patternType: 'impulse',
				confirmedWaveCount: 2,
				inProgressWave: 'Three',
				w0,
			};
		}
		const waves = buildW2InProgress(w0, w1, degree);
		return {
			waves,
			trendDirection,
			patternType: 'impulse',
			confirmedWaveCount: 1,
			inProgressWave: 'Two',
			w0,
		};
	}

	const w3Just = w3Match
		? makeJustification({
				fibLevel: w3Match.fibLevel,
				deviation: w3Match.deviation,
				type: 'Extension',
				description: `${w3Match.fibLevel}× extension of W1 from W2`,
			})
		: null;

	const w4Match = findFibRetracementPivot({
		bars,
		waveStart: w2,
		waveEnd: w3,
		levels: w4RetraceLevels(),
		isUptrend,
		fromIndex: w3.index + 1,
	});
	const w4 = w4Match?.pivot ?? findConfirmedExtreme(bars, w3, !isUptrend);

	if (!w4) {
		const w4Projection = buildRetracementProjection(w2.price, w3.price, w4RetraceLevels(), w0.price);
		const waves = createImpulseWaves({
			pivots: [w0, w1, w2, w3],
			justifications: [null, w2Just, w3Just],
			degree,
			inProgressLabel: 'Four',
			inProgressProjection: w4Projection,
			inProgressStart: w3,
		});
		return {
			waves,
			trendDirection,
			patternType: 'impulse',
			confirmedWaveCount: 3,
			inProgressWave: 'Four',
			w0,
		};
	}

	if (isUptrend ? w4.price <= w0.price : w4.price >= w0.price) {
		const waves = buildCorrectiveFromMorph(w0, w1, w2, bars, degree);
		return {
			waves,
			trendDirection,
			patternType: 'corrective',
			confirmedWaveCount: 2,
			inProgressWave: 'C',
			w0,
		};
	}

	const isDiagonal = isDiagonalOverlap(w4, w1, isUptrend);
	const w4Just = w4Match
		? makeJustification({
				fibLevel: w4Match.fibLevel,
				deviation: w4Match.deviation,
				type: 'Retracement',
				description: `${(w4Match.fibLevel * 100).toFixed(1)}% retrace of W2→W3`,
			})
		: null;

	const w5Projection = buildW5Projection(w0, w1, w4, w3.price, lastClose);
	const waves = createImpulseWaves({
		pivots: [w0, w1, w2, w3, w4],
		justifications: [null, w2Just, w3Just, w4Just],
		degree,
		isDiagonal,
		inProgressLabel: 'Five',
		inProgressProjection: w5Projection,
		inProgressStart: w4,
	});

	return {
		waves,
		trendDirection,
		patternType: isDiagonal ? 'diagonal' : 'impulse',
		confirmedWaveCount: 4,
		inProgressWave: 'Five',
		w0,
	};
}

export function analysisFromWaves(waves: ElliottWave[]): {
	patternType: 'impulse' | 'diagonal' | 'corrective';
	confirmedWaveCount: number;
	inProgressWave?: WaveNumber;
} {
	const inProgress = waves.find(w => w.isInProgress);
	const confirmed = waves.filter(w => !w.isInProgress).length;
	const firstPattern = waves[0]?.patternType;
	let patternType: 'impulse' | 'diagonal' | 'corrective' = 'impulse';
	if (firstPattern === 'ZigZag' || firstPattern === 'Flat' || firstPattern === 'Triangle') {
		patternType = 'corrective';
	} else if (firstPattern === 'Diagonal' || waves.some(w => w.patternType === 'Diagonal')) {
		patternType = 'diagonal';
	}
	return {
		patternType,
		confirmedWaveCount: confirmed,
		inProgressWave: inProgress?.label,
	};
}
