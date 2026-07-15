import type {OhlcvBar, PivotPoint, PointType} from './types.js';
import {projectExtensions, projectRetracements} from './fibonacci-projector.js';
import {logPrice} from './wave-math.js';
import {THRESHOLDS} from './constants.js';

function createPivot(
	index: number,
	bars: OhlcvBar[],
	price: number,
	pointType: PointType,
): PivotPoint {
	return {
		index,
		timeSec: bars[index]!.timeSec,
		price,
		pointType,
	};
}

export function findAbsoluteExtreme(
	bars: OhlcvBar[],
	findHigh: boolean,
	fromIndex = 0,
	toIndex = -1,
): PivotPoint {
	const end = toIndex < 0 ? bars.length - 1 : toIndex;
	let bestIdx = fromIndex;
	let bestPrice = findHigh ? bars[fromIndex]!.high : bars[fromIndex]!.low;
	for (let i = fromIndex + 1; i <= end; i++) {
		const price = findHigh ? bars[i]!.high : bars[i]!.low;
		if (findHigh ? price > bestPrice : price < bestPrice) {
			bestPrice = price;
			bestIdx = i;
		}
	}
	return createPivot(bestIdx, bars, bestPrice, findHigh ? 'High' : 'Low');
}

export function hasRecovery(
	bars: OhlcvBar[],
	fromIndex: number,
	toIndex: number,
	logExtreme: number,
	move: number,
	extremeIsHigh: boolean,
	threshold: number,
): boolean {
	for (let i = fromIndex + 1; i <= toIndex; i++) {
		const recoveryPrice = extremeIsHigh ? bars[i]!.low : bars[i]!.high;
		const recovery = Math.abs(logPrice(recoveryPrice) - logExtreme);
		if (move > 0 && recovery / move >= threshold) {
			return true;
		}
	}
	return false;
}

export function findWave1(
	bars: OhlcvBar[],
	w0: PivotPoint,
	isUptrend: boolean,
	maxIndex = -1,
	retraceThreshold = THRESHOLDS.w1ConfirmationRetrace,
	minGap = 0,
	minLogMove = 0,
): {w1: PivotPoint; retracePoint: PivotPoint} | null {
	const end = maxIndex < 0 ? bars.length - 1 : maxIndex;
	let runningExtreme = w0.price;
	let runningExtremeIdx = w0.index;
	const logW0 = logPrice(w0.price);

	for (let i = w0.index + 1; i <= end; i++) {
		const trendPrice = isUptrend ? bars[i]!.high : bars[i]!.low;
		const retracePrice = isUptrend ? bars[i]!.low : bars[i]!.high;

		if (isUptrend ? trendPrice > runningExtreme : trendPrice < runningExtreme) {
			runningExtreme = trendPrice;
			runningExtremeIdx = i;
		}

		if (runningExtremeIdx > w0.index && i > runningExtremeIdx + minGap) {
			const logExtreme = logPrice(runningExtreme);
			const logRetrace = logPrice(retracePrice);
			const move = Math.abs(logExtreme - logW0);
			const retrace = Math.abs(logExtreme - logRetrace);

			if (move >= minLogMove && move > 0 && retrace / move > retraceThreshold) {
				const w1 = findAbsoluteExtreme(bars, isUptrend, w0.index, i);
				const retracePoint = createPivot(i, bars, retracePrice, isUptrend ? 'Low' : 'High');
				return {w1, retracePoint};
			}
		}
	}
	return null;
}

/** Find countertrend pivot nearest a Fibonacci retracement level (most extreme level first). */
export function findFibRetracementPivot(input: {
	bars: OhlcvBar[];
	waveStart: PivotPoint;
	waveEnd: PivotPoint;
	levels: readonly number[];
	isUptrend: boolean;
	fromIndex: number;
	toIndex?: number;
	toleranceLog?: number;
}): {pivot: PivotPoint; fibLevel: number; deviation: number} | null {
	const end = input.toIndex ?? input.bars.length - 1;
	const targets = projectRetracements(input.waveStart.price, input.waveEnd.price, input.levels);
	const tolerance = input.toleranceLog ?? THRESHOLDS.fibToleranceLog;

	for (const target of targets) {
		let best: PivotPoint | null = null;
		let bestDev = Infinity;
		for (let i = input.fromIndex; i <= end; i++) {
			const price = input.isUptrend ? input.bars[i]!.low : input.bars[i]!.high;
			const dev = Math.abs(logPrice(price) - logPrice(target.price));
			if (dev <= tolerance && dev < bestDev) {
				best = createPivot(i, input.bars, price, input.isUptrend ? 'Low' : 'High');
				bestDev = dev;
			}
		}
		if (best) {
			return {pivot: best, fibLevel: target.fibLevel, deviation: bestDev};
		}
	}
	return null;
}

/** Find trend-direction pivot nearest a Fibonacci extension level (most extreme first). */
export function findFibExtensionPivot(input: {
	bars: OhlcvBar[];
	waveStart: number;
	waveEnd: number;
	extensionBase: PivotPoint;
	levels: readonly number[];
	isUptrend: boolean;
	fromIndex: number;
	toIndex?: number;
	toleranceLog?: number;
}): {pivot: PivotPoint; fibLevel: number; deviation: number} | null {
	const end = input.toIndex ?? input.bars.length - 1;
	const targets = projectExtensions(
		input.waveStart,
		input.waveEnd,
		input.extensionBase.price,
		input.levels,
	);
	const tolerance = input.toleranceLog ?? THRESHOLDS.fibToleranceLog;

	for (const target of targets) {
		let best: PivotPoint | null = null;
		let bestDev = Infinity;
		for (let i = input.fromIndex; i <= end; i++) {
			const price = input.isUptrend ? input.bars[i]!.high : input.bars[i]!.low;
			const dev = Math.abs(logPrice(price) - logPrice(target.price));
			if (dev <= tolerance && dev < bestDev) {
				best = createPivot(i, input.bars, price, input.isUptrend ? 'High' : 'Low');
				bestDev = dev;
			}
		}
		if (best) {
			return {pivot: best, fibLevel: target.fibLevel, deviation: bestDev};
		}
	}
	return null;
}

export function findConfirmedExtreme(
	bars: OhlcvBar[],
	fromPoint: PivotPoint,
	findHigh: boolean,
	recoveryThreshold = THRESHOLDS.defaultRecoveryThreshold,
): PivotPoint | null {
	if (fromPoint.index >= bars.length - 2) {
		return null;
	}
	const extreme = findAbsoluteExtreme(bars, findHigh, fromPoint.index + 1);
	if (extreme.index >= bars.length - 1) {
		return null;
	}
	const logFrom = logPrice(fromPoint.price);
	const logExtreme = logPrice(extreme.price);
	const move = Math.abs(logExtreme - logFrom);
	if (
		!hasRecovery(
			bars,
			extreme.index,
			bars.length - 1,
			logExtreme,
			move,
			findHigh,
			recoveryThreshold,
		)
	) {
		return null;
	}
	return extreme;
}
