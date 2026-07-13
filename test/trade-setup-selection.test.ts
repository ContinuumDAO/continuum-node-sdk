import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	analyzeArgsFromTradeSetupSelection,
	extractTradeSetupSelection,
	tradeSetupSelectionForAnalysisType,
} from '../dist/core/chart/analysis/trade-setups/trade-setup-selection.js';
import {wrapAnalysisTradeSetup} from '../dist/core/chart/analysis/trade-setups/trade-idea.js';
import type {TrendStructureTradeSetup} from '../dist/core/chart/analysis/trade-setups/trend-structure-trade-setup.js';

test('extracts trend line number from trend structure setup', () => {
	const setup: TrendStructureTradeSetup = {
		status: 'clear',
		source: 'trend_structure',
		bias: 'bearish',
		structure: 'lower_lows',
		lastClose: 1750,
		side: 'short',
		confidence: 0.7,
		trendLineNumber: 1,
		triggerPrice: 1807,
		triggerLabel: 'broken support retest',
	};
	const idea = wrapAnalysisTradeSetup({kind: 'trend_structure', setup});
	assert.deepEqual(idea.tradeSetupSelection, {kind: 'trend_structure', trendLineNumber: 1});
	assert.deepEqual(analyzeArgsFromTradeSetupSelection(idea.tradeSetupSelection), {
		tradeTrendLineNumber: 1,
	});
});

test('extracts key level menu identity', () => {
	const selection = extractTradeSetupSelection({
		kind: 'key_levels',
		setup: {
			status: 'clear',
			source: 'nearest_levels',
			framing: 'bounce',
			entryOffsetMode: 'bounce',
			entryProximityPct: 5,
			entryOffsetPct: 0,
			invalidationOffsetPct: 0,
			setupPurposeCode: 'key_levels:bounce',
			levelNumber: 3,
			supportRank: 1,
			resistanceRank: null,
			supportPrice: 100,
			supportLabel: 'support',
			resistancePrice: null,
			resistanceLabel: '',
			lastClose: 101,
			side: 'long',
			entryPrice: 100,
			entryLabel: 'support bounce',
			confidence: 0.6,
		},
	});
	assert.deepEqual(selection, {kind: 'key_levels', levelNumber: 3, framing: 'bounce'});
	assert.deepEqual(analyzeArgsFromTradeSetupSelection(selection), {tradeLevelNumber: 3});
});

test('finds newest persisted selection by analysis type', () => {
	const ideas = [
		{
			source: {analysisType: 'trend_structure' as const},
			tradeSetupSelection: {kind: 'trend_structure' as const, trendLineNumber: 2},
		},
		{
			source: {analysisType: 'trend_structure' as const},
			tradeSetupSelection: {kind: 'trend_structure' as const, trendLineNumber: 1},
		},
	];
	assert.deepEqual(tradeSetupSelectionForAnalysisType(ideas, 'trend_structure'), {
		kind: 'trend_structure',
		trendLineNumber: 1,
	});
});

test('re-binds indicator parameters for bollinger and momentum selections', () => {
	const bollinger = extractTradeSetupSelection({
		kind: 'bollinger_bands',
		setup: {
			status: 'clear',
			source: 'bollinger_bands',
			side: 'short',
			lastClose: 1800,
			period: 20,
			stdDev: 2.5,
			setupPurposeCode: 'bb-fade',
			entryProximityPct: 5,
			entryOffsetPct: 0,
			invalidationOffsetPct: 0,
			upper: 1850,
			middle: 1800,
			lower: 1750,
			entryPrice: 1850,
			entryLabel: 'upper band fade',
			targetPrice: 1800,
			targetLabel: 'middle band',
			confidence: 0.6,
		},
	});
	assert.deepEqual(analyzeArgsFromTradeSetupSelection(bollinger), {period: 20, stdDev: 2.5});

	const momentum = extractTradeSetupSelection({
		kind: 'momentum',
		setup: {
			status: 'clear',
			source: 'momentum',
			side: 'long',
			lastClose: 1800,
			rsiPeriod: 21,
			rsiValue: 35,
			rsiZone: 'neutral',
			macdCrossover: 'bullish',
			setupPurposeCode: 'mom-rsi',
			entryPrice: 1800,
			entryLabel: 'RSI recovery',
			confidence: 0.55,
		},
	});
	assert.deepEqual(analyzeArgsFromTradeSetupSelection(momentum), {rsiPeriod: 21});
});
