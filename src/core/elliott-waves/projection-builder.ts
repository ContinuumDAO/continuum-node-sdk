import type {PivotPoint, WaveNumber, WaveProjection, EffectiveWaveDegree, PatternType} from './types.js';
import type {FibonacciJustification} from './types.js';
import {FIB_W5, FIB_EXT_C, FIB_EXT_W3, FIB_EXT_W3_INTERMEDIATE, FIB_RETRACE_W2, FIB_RETRACE_W4} from './constants.js';
import {projectExtensions, projectRetracements} from './fibonacci-projector.js';

export type ProjectionTarget = {
	price: number;
	fibonacciLevel: number;
	probability: number;
};

const ESCALATION_LEVELS = [2.618, 4.236, 6.854, 11.09] as const;

function normalizeProbabilities(targets: ProjectionTarget[]): void {
	if (!targets.length) {
		return;
	}
	const sum = targets.reduce((acc, t) => acc + t.probability, 0);
	if (sum <= 0) {
		return;
	}
	for (const t of targets) {
		t.probability = Math.round((t.probability / sum) * 10000) / 10000;
	}
}

function retraceProbability(level: number): number {
	switch (level) {
		case 0.786:
			return 0.1;
		case 0.618:
			return 0.25;
		case 0.5:
			return 0.35;
		case 0.382:
			return 0.2;
		case 0.236:
			return 0.1;
		default:
			return 0.1;
	}
}

function w3ExtensionProbability(level: number, isIntermediate: boolean): number {
	if (isIntermediate) {
		switch (level) {
			case 1.618:
				return 0.35;
			case 1.0:
				return 0.4;
			case 0.618:
				return 0.25;
			default:
				return 0.1;
		}
	}
	switch (level) {
		case 4.236:
			return 0.05;
		case 2.618:
			return 0.15;
		case 1.618:
			return 0.4;
		case 1.0:
			return 0.3;
		default:
			return 0.1;
	}
}

function w5Probability(level: number): number {
	switch (level) {
		case 1.0:
			return 0.35;
		case 0.618:
			return 0.25;
		default:
			return 0.15;
	}
}

function cExtensionProbability(level: number): number {
	switch (level) {
		case 2.618:
			return 0.15;
		case 1.618:
			return 0.3;
		case 1.0:
			return 0.4;
		default:
			return 0.1;
	}
}

export function buildRetracementProjection(
	waveStart: number,
	waveEnd: number,
	levels: readonly number[],
	invalidation: number | null,
): WaveProjection {
	const targets = projectRetracements(waveStart, waveEnd, levels).map(t => ({
		price: t.price,
		fibonacciLevel: t.fibLevel,
		probability: retraceProbability(t.fibLevel),
	}));
	normalizeProbabilities(targets);
	return {targets, invalidationPoint: invalidation};
}

export function buildExtensionProjection(input: {
	waveStart: number;
	waveEnd: number;
	extensionBase: number;
	levels: readonly number[];
	invalidation: number | null;
	isW3?: boolean;
	isIntermediate?: boolean;
	currentPrice?: number;
}): WaveProjection {
	const isUptrend = input.waveEnd > input.waveStart;
	let projected = projectExtensions(
		input.waveStart,
		input.waveEnd,
		input.extensionBase,
		input.levels,
	);

	if (input.currentPrice != null && projected.length) {
		const allExceeded = projected.every(t =>
			isUptrend ? input.currentPrice! >= t.price : input.currentPrice! <= t.price,
		);
		if (allExceeded) {
			projected = [];
			for (const level of ESCALATION_LEVELS) {
				if (input.levels.includes(level)) {
					continue;
				}
				const escalated = projectExtensions(
					input.waveStart,
					input.waveEnd,
					input.extensionBase,
					[level],
				);
				projected.push(...escalated);
				const beyond = isUptrend
					? escalated[0]!.price > input.currentPrice!
					: escalated[0]!.price < input.currentPrice!;
				if (beyond) {
					break;
				}
			}
		}
		projected = projected.filter(t =>
			isUptrend ? t.price > input.currentPrice! : t.price < input.currentPrice!,
		);
	}

	const probFn = input.isW3
		? (l: number) => w3ExtensionProbability(l, input.isIntermediate ?? false)
		: (l: number) => cExtensionProbability(l);

	const targets = projected.map(t => ({
		price: t.price,
		fibonacciLevel: t.fibLevel,
		probability: probFn(t.fibLevel),
	}));
	normalizeProbabilities(targets);
	return {targets, invalidationPoint: input.invalidation};
}

export function buildW5Projection(
	w0: PivotPoint,
	w1: PivotPoint,
	w4: PivotPoint,
	invalidation: number | null,
	currentPrice?: number,
): WaveProjection {
	const isUptrend = w1.price > w0.price;
	let projected = projectExtensions(w0.price, w1.price, w4.price, FIB_W5);

	if (currentPrice != null && projected.length) {
		const allExceeded = projected.every(t =>
			isUptrend ? currentPrice >= t.price : currentPrice <= t.price,
		);
		if (allExceeded) {
			projected = [];
			for (const level of ESCALATION_LEVELS) {
				if ((FIB_W5 as readonly number[]).includes(level)) {
					continue;
				}
				const escalated = projectExtensions(w0.price, w1.price, w4.price, [level]);
				projected.push(...escalated);
				const beyond = isUptrend
					? escalated[0]!.price > currentPrice
					: escalated[0]!.price < currentPrice;
				if (beyond) {
					break;
				}
			}
		}
		projected = projected.filter(t =>
			isUptrend ? t.price > currentPrice : t.price < currentPrice,
		);
	}

	const targets = projected.map(t => ({
		price: t.price,
		fibonacciLevel: t.fibLevel,
		probability: w5Probability(t.fibLevel),
	}));
	normalizeProbabilities(targets);
	return {targets, invalidationPoint: invalidation};
}

export function w2RetraceLevels(): readonly number[] {
	return FIB_RETRACE_W2;
}

export function w4RetraceLevels(): readonly number[] {
	return FIB_RETRACE_W4;
}

export function w3ExtensionLevels(isIntermediate: boolean): readonly number[] {
	return isIntermediate ? FIB_EXT_W3_INTERMEDIATE : FIB_EXT_W3;
}

export function cExtensionLevels(): readonly number[] {
	return FIB_EXT_C;
}

export function makeJustification(input: {
	fibLevel: number;
	deviation: number;
	type: 'Retracement' | 'Extension';
	description: string;
}): FibonacciJustification {
	return {
		fibonacciLevel: input.fibLevel,
		deviation: input.deviation,
		type: input.type,
		description: input.description,
	};
}

export {FIB_RETRACE_W2, FIB_RETRACE_W4, FIB_EXT_W3, FIB_EXT_W3_INTERMEDIATE, FIB_W5, FIB_EXT_C};
