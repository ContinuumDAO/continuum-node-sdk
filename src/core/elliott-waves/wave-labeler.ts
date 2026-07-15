import type {
	ElliottWave,
	EffectiveWaveDegree,
	FibonacciJustification,
	PivotPoint,
	PatternType,
	WaveNumber,
	WaveProjection,
} from './types.js';

const MOTIVE_LABELS: WaveNumber[] = ['One', 'Two', 'Three', 'Four', 'Five'];
const CORRECTIVE_LABELS: WaveNumber[] = ['A', 'B', 'C'];

export function waveLabelToRoman(label: WaveNumber, inProgress: boolean): string {
	const map: Record<string, string> = {
		One: 'I',
		Two: 'II',
		Three: 'III',
		Four: 'IV',
		Five: 'V',
		A: 'A',
		B: 'B',
		C: 'C',
	};
	const base = map[label] ?? label;
	return inProgress ? `(${base})` : base;
}

export function waveLabelToDisplay(label: WaveNumber): string {
	const roman = waveLabelToRoman(label, false);
	if (['A', 'B', 'C'].includes(roman)) {
		return roman;
	}
	return roman;
}

export function createImpulseWaves(input: {
	pivots: PivotPoint[];
	justifications: Array<FibonacciJustification | null>;
	degree: EffectiveWaveDegree;
	patternType?: PatternType;
	patternSubType?: ElliottWave['patternSubType'];
	inProgressLabel?: WaveNumber;
	inProgressProjection?: WaveProjection;
	inProgressStart?: PivotPoint;
	isDiagonal?: boolean;
}): ElliottWave[] {
	const waves: ElliottWave[] = [];
	const patternType: PatternType = input.isDiagonal ? 'Diagonal' : 'Impulse';

	for (let i = 0; i < input.pivots.length - 1; i++) {
		waves.push({
			degree: input.degree,
			label: MOTIVE_LABELS[i]!,
			startPoint: input.pivots[i]!,
			endPoint: input.pivots[i + 1]!,
			isInProgress: false,
			patternType: input.patternType ?? patternType,
			patternSubType: input.patternSubType,
			justification: input.justifications[i] ?? null,
		});
	}

	if (input.inProgressLabel && input.inProgressStart && input.inProgressProjection) {
		waves.push(createInProgressWave({
			start: input.inProgressStart,
			label: input.inProgressLabel,
			degree: input.degree,
			projection: input.inProgressProjection,
			patternType: input.patternType ?? patternType,
		}));
	}

	return waves;
}

export function createCorrectiveWaves(input: {
	pivots: PivotPoint[];
	justifications: Array<FibonacciJustification | null>;
	degree: EffectiveWaveDegree;
	patternType?: PatternType;
	inProgressLabel?: WaveNumber;
	inProgressProjection?: WaveProjection;
	inProgressStart?: PivotPoint;
}): ElliottWave[] {
	const waves: ElliottWave[] = [];
	const patternType = input.patternType ?? 'ZigZag';

	for (let i = 0; i < input.pivots.length - 1 && i < CORRECTIVE_LABELS.length; i++) {
		waves.push({
			degree: input.degree,
			label: CORRECTIVE_LABELS[i]!,
			startPoint: input.pivots[i]!,
			endPoint: input.pivots[i + 1]!,
			isInProgress: false,
			patternType,
			justification: input.justifications[i] ?? null,
		});
	}

	if (input.inProgressLabel && input.inProgressStart && input.inProgressProjection) {
		waves.push(createInProgressWave({
			start: input.inProgressStart,
			label: input.inProgressLabel,
			degree: input.degree,
			projection: input.inProgressProjection,
			patternType,
		}));
	}

	return waves;
}

export function createInProgressWave(input: {
	start: PivotPoint;
	label: WaveNumber;
	degree: EffectiveWaveDegree;
	projection: WaveProjection;
	patternType?: PatternType;
}): ElliottWave {
	return {
		degree: input.degree,
		label: input.label,
		startPoint: input.start,
		endPoint: input.start,
		isInProgress: true,
		patternType: input.patternType ?? 'Impulse',
		projection: input.projection,
	};
}

export function isMotiveLabel(label: WaveNumber): boolean {
	return label === 'One' || label === 'Three' || label === 'Five' || label === 'A' || label === 'C';
}

export function confirmedWaveCount(waves: ElliottWave[]): number {
	return waves.filter(w => !w.isInProgress).length;
}

export function inProgressWaveLabel(waves: ElliottWave[]): WaveNumber | undefined {
	return waves.find(w => w.isInProgress)?.label;
}
