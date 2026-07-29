export type DivergenceKind =
	| 'regular_bullish'
	| 'regular_bearish'
	| 'hidden_bullish'
	| 'hidden_bearish';

export type DivergenceOscillator = 'rsi' | 'stochasticrsi';

export type DivergenceOscillatorMode = DivergenceOscillator | 'both';

export type DivergencePivot = {
	index: number;
	timeSec: number;
	value: number;
};

export type DivergenceHit = {
	kind: DivergenceKind;
	oscillator: DivergenceOscillator;
	/** First price pivot (earlier). */
	p1: DivergencePivot;
	/** Second price pivot (later / confirm). */
	p2: DivergencePivot;
	/** Oscillator pivot paired with p1. */
	o1: DivergencePivot;
	/** Oscillator pivot paired with p2. */
	o2: DivergencePivot;
	barsSinceConfirm: number;
};

export type DivergencePrimary = DivergenceHit & {
	side: 'long' | 'short';
	confidence: number;
};

export type FindPeaksOptions = {
	distance?: number;
	prominence?: number;
};
