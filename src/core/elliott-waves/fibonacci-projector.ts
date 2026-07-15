import {logPrice} from './wave-math.js';

export type FibProjection = {price: number; fibLevel: number};

export function projectRetracements(
	waveStart: number,
	waveEnd: number,
	levels: readonly number[],
): FibProjection[] {
	const logStart = logPrice(waveStart);
	const logEnd = logPrice(waveEnd);
	const logMove = logEnd - logStart;
	return levels.map(level => ({
		price: Math.exp(logEnd - level * logMove),
		fibLevel: level,
	}));
}

export function projectExtensions(
	waveStart: number,
	waveEnd: number,
	extensionBase: number,
	levels: readonly number[],
): FibProjection[] {
	const logWaveLength = Math.abs(logPrice(waveEnd) - logPrice(waveStart));
	const logBase = logPrice(extensionBase);
	const isUptrend = waveEnd > waveStart;
	return levels.map(level => ({
		price: Math.exp(isUptrend ? logBase + level * logWaveLength : logBase - level * logWaveLength),
		fibLevel: level,
	}));
}
