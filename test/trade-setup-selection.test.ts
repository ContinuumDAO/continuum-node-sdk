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
