import {z} from 'zod';
import type {AnalysisTradeSetup} from './trade-idea.js';
import type {AnalysisTradeSetupKind} from './shared.js';

/** Analysis-dependent identity for the menu row / geometry used to build a trade idea. */
export type TrendStructureTradeSetupSelection = {
	kind: 'trend_structure';
	trendLineNumber: number;
};

export type KeyLevelsTradeSetupSelection = {
	kind: 'key_levels';
	levelNumber: number;
	framing: 'bounce' | 'break';
	brokenLevelNumber?: number;
};

export type KeyLevelFibonacciTradeSetupSelection = {
	kind: 'key_level_fibonacci';
	fibPairNumber: number;
	side: 'long' | 'short';
	lowLevelNumber: number;
	highLevelNumber: number;
	framing?: 'retrace' | 'break';
	brokenLevelNumber?: number;
};

export type ChartPatternTradeSetupSelection = {
	kind: 'chart_pattern';
	patternNumber: number;
	patternId: string;
};

export type CandlestickTradeSetupSelection = {
	kind: 'candlestick';
	patternId: string;
	barIndex: number;
};

export type BollingerBandsTradeSetupSelection = {
	kind: 'bollinger_bands';
	period: number;
	stdDev: number;
	setupPurposeCode: string;
};

export type MovingAveragesTradeSetupSelection = {
	kind: 'moving_averages';
	strategy: 'crossover' | 'proximity_retest';
	fastPeriod: number;
	slowPeriod: number;
	maType: 'sma' | 'ema';
	setupPurposeCode: string;
};

export type MomentumTradeSetupSelection = {
	kind: 'momentum';
	rsiPeriod: number;
};

export type RangeVolatilityTradeSetupSelection = {
	kind: 'range_volatility';
};

export type TradeSetupSelection =
	| TrendStructureTradeSetupSelection
	| KeyLevelsTradeSetupSelection
	| KeyLevelFibonacciTradeSetupSelection
	| ChartPatternTradeSetupSelection
	| CandlestickTradeSetupSelection
	| BollingerBandsTradeSetupSelection
	| MovingAveragesTradeSetupSelection
	| MomentumTradeSetupSelection
	| RangeVolatilityTradeSetupSelection;

const trendStructureSelectionSchema = z
	.object({
		kind: z.literal('trend_structure'),
		trendLineNumber: z.number().int().min(1),
	})
	.strict();

const keyLevelsSelectionSchema = z
	.object({
		kind: z.literal('key_levels'),
		levelNumber: z.number().int().min(1),
		framing: z.enum(['bounce', 'break']),
		brokenLevelNumber: z.number().int().min(1).optional(),
	})
	.strict();

const keyLevelFibonacciSelectionSchema = z
	.object({
		kind: z.literal('key_level_fibonacci'),
		fibPairNumber: z.number().int().min(1),
		side: z.enum(['long', 'short']),
		lowLevelNumber: z.number().int().min(1),
		highLevelNumber: z.number().int().min(1),
		framing: z.enum(['retrace', 'break']).optional(),
		brokenLevelNumber: z.number().int().min(1).optional(),
	})
	.strict();

const chartPatternSelectionSchema = z
	.object({
		kind: z.literal('chart_pattern'),
		patternNumber: z.number().int().min(1),
		patternId: z.string().min(1),
	})
	.strict();

const candlestickSelectionSchema = z
	.object({
		kind: z.literal('candlestick'),
		patternId: z.string().min(1),
		barIndex: z.number().int().min(0),
	})
	.strict();

const bollingerSelectionSchema = z
	.object({
		kind: z.literal('bollinger_bands'),
		period: z.number().int().min(1),
		stdDev: z.number().positive(),
		setupPurposeCode: z.string().min(1),
	})
	.strict();

const movingAveragesSelectionSchema = z
	.object({
		kind: z.literal('moving_averages'),
		strategy: z.enum(['crossover', 'proximity_retest']),
		fastPeriod: z.number().int().min(1),
		slowPeriod: z.number().int().min(1),
		maType: z.enum(['sma', 'ema']),
		setupPurposeCode: z.string().min(1),
	})
	.strict();

const momentumSelectionSchema = z
	.object({
		kind: 'momentum',
		rsiPeriod: z.number().int().min(1),
	})
	.strict();

const rangeVolatilitySelectionSchema = z
	.object({
		kind: z.literal('range_volatility'),
	})
	.strict();

export const TradeSetupSelectionSchema = z.discriminatedUnion('kind', [
	trendStructureSelectionSchema,
	keyLevelsSelectionSchema,
	keyLevelFibonacciSelectionSchema,
	chartPatternSelectionSchema,
	candlestickSelectionSchema,
	bollingerSelectionSchema,
	movingAveragesSelectionSchema,
	momentumSelectionSchema,
	rangeVolatilitySelectionSchema,
]);

export function extractTradeSetupSelection(setup: AnalysisTradeSetup): TradeSetupSelection | undefined {
	switch (setup.kind) {
		case 'trend_structure': {
			const n = setup.setup.trendLineNumber;
			return n != null && n >= 1 ? {kind: 'trend_structure', trendLineNumber: n} : undefined;
		}
		case 'key_levels': {
			const s = setup.setup;
			if (s.levelNumber == null || s.levelNumber < 1) {
				return undefined;
			}
			const alt = s.breakRetestAlternative;
			if (s.framing === 'break' && alt?.brokenLevelNumber != null) {
				return {
					kind: 'key_levels',
					levelNumber: s.levelNumber,
					framing: 'break',
					brokenLevelNumber: alt.brokenLevelNumber,
				};
			}
			return {
				kind: 'key_levels',
				levelNumber: s.levelNumber,
				framing: s.framing,
			};
		}
		case 'key_level_fibonacci': {
			const s = setup.setup;
			const alt = s.breakRetestAlternative;
			if (alt?.brokenLevelNumber != null) {
				return {
					kind: 'key_level_fibonacci',
					fibPairNumber: s.fibPairNumber,
					side: s.side === 'long' || s.side === 'short' ? s.side : 'long',
					lowLevelNumber: s.lowLevelNumber,
					highLevelNumber: s.highLevelNumber,
					framing: 'break',
					brokenLevelNumber: alt.brokenLevelNumber,
				};
			}
			return {
				kind: 'key_level_fibonacci',
				fibPairNumber: s.fibPairNumber,
				side: s.side === 'long' || s.side === 'short' ? s.side : 'long',
				lowLevelNumber: s.lowLevelNumber,
				highLevelNumber: s.highLevelNumber,
				framing: 'retrace',
			};
		}
		case 'chart_pattern':
			return {
				kind: 'chart_pattern',
				patternNumber: setup.setup.patternNumber,
				patternId: setup.setup.patternId,
			};
		case 'candlestick':
			return {
				kind: 'candlestick',
				patternId: setup.setup.patternId,
				barIndex: setup.setup.barIndex,
			};
		case 'bollinger_bands': {
			const s = setup.setup;
			if (!s.setupPurposeCode) {
				return undefined;
			}
			return {
				kind: 'bollinger_bands',
				period: s.period,
				stdDev: s.stdDev,
				setupPurposeCode: s.setupPurposeCode,
			};
		}
		case 'moving_averages': {
			const s = setup.setup;
			return {
				kind: 'moving_averages',
				strategy: s.strategy,
				fastPeriod: s.fastPeriod,
				slowPeriod: s.slowPeriod,
				maType: s.maType,
				setupPurposeCode: s.setupPurposeCode,
			};
		}
		case 'momentum':
			return {
				kind: 'momentum',
				rsiPeriod: setup.setup.rsiPeriod,
			};
		case 'range_volatility':
			return {kind: 'range_volatility'};
		default:
			return undefined;
	}
}

/** Partial analyze_* tool args to re-bind the same menu/geometry on refresh. */
export function analyzeArgsFromTradeSetupSelection(
	selection: TradeSetupSelection | null | undefined,
): Record<string, unknown> {
	if (!selection) {
		return {};
	}
	switch (selection.kind) {
		case 'trend_structure':
			return {tradeTrendLineNumber: selection.trendLineNumber};
		case 'key_levels':
			return {
				tradeLevelNumber: selection.levelNumber,
				...(selection.framing === 'break' && selection.brokenLevelNumber != null
					? {tradeBrokenLevelNumber: selection.brokenLevelNumber}
					: {}),
			};
		case 'key_level_fibonacci':
			return {
				fibPairNumber: selection.fibPairNumber,
				tradeFibSide: selection.side,
			};
		case 'chart_pattern':
			return {tradePatternNumber: selection.patternNumber};
		case 'candlestick':
			return {
				tradePatternId: selection.patternId,
				tradeBarIndex: selection.barIndex,
			};
		case 'bollinger_bands':
			return {
				period: selection.period,
				stdDev: selection.stdDev,
			};
		case 'moving_averages':
			return {
				fastPeriod: selection.fastPeriod,
				slowPeriod: selection.slowPeriod,
				maType: selection.maType,
			};
		case 'momentum':
			return {rsiPeriod: selection.rsiPeriod};
		case 'range_volatility':
			return {};
		default:
			return {};
	}
}

export function tradeSetupSelectionForAnalysisType(
	ideas: {source: {analysisType: AnalysisTradeSetupKind}; tradeSetupSelection?: TradeSetupSelection}[],
	analysisType: AnalysisTradeSetupKind,
): TradeSetupSelection | undefined {
	for (let i = ideas.length - 1; i >= 0; i -= 1) {
		const idea = ideas[i]!;
		if (idea.source.analysisType === analysisType && idea.tradeSetupSelection) {
			return idea.tradeSetupSelection;
		}
	}
	return undefined;
}
