import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	computeTradeRatio,
	estimateLiquidationPrice,
	tradeIdeaSupportsLiquidationEstimate,
	tradeRatioUnclearReason,
} from '../dist/core/chart/analysis/trade-setups/trade-ratio.js';
import {wrapAnalysisTradeSetup} from '../dist/core/chart/analysis/trade-setups/trade-idea.js';
import {tradePositionOverlayFromLevels} from '../dist/core/chart/analysis/trade-setups/trade-position-overlay.js';

test('estimateLiquidationPrice long/short from assumed leverage', () => {
	assert.equal(estimateLiquidationPrice({side: 'long', entry: 100, leverage: 10}), 90);
	assert.ok(
		Math.abs((estimateLiquidationPrice({side: 'short', entry: 100, leverage: 10}) ?? 0) - 110) <
			1e-9,
	);
});

test('computeTradeRatio long uses invalidation risk', () => {
	assert.equal(
		computeTradeRatio({side: 'long', entry: 100, target: 130, invalidation: 90}),
		3,
	);
});

test('tradeIdeaSupportsLiquidationEstimate false for Uniswap', () => {
	assert.equal(tradeIdeaSupportsLiquidationEstimate('uniswap'), false);
	assert.equal(tradeIdeaSupportsLiquidationEstimate('uniswap-v4'), false);
	assert.equal(tradeIdeaSupportsLiquidationEstimate('hyperliquid'), true);
});

test('tradeRatioUnclearReason demotes below minimum', () => {
	const reason = tradeRatioUnclearReason({
		side: 'long',
		entry: 100,
		target: 110,
		invalidation: 90,
		minTradeRatio: 3,
	});
	assert.match(String(reason), /Trade Ratio 1\.00 below minimum 3/);
});

test('wrapAnalysisTradeSetup demotes clear when Trade Ratio below min', () => {
	const idea = wrapAnalysisTradeSetup(
		{
			kind: 'chart_pattern',
			setup: {
				status: 'clear',
				source: 'primary_pattern',
				patternNumber: 1,
				patternId: 'symmetrical_triangle',
				patternName: 'Symmetrical Triangle',
				classification: 'bullish',
				confidence: 0.8,
				side: 'long',
				lastClose: 100,
				triggerPrice: 100,
				triggerLabel: 'R2 retest',
				targetPrice: 110,
				targetDirection: 'up',
				targetStatus: 'active',
				invalidationPrice: 95,
				invalidationLabel: 'S2',
				entryOffsetMode: 'retest',
			},
		},
		{toolName: 'analyze_chart_patterns', minTradeRatio: 3, assumedLeverage: 10},
	);
	assert.equal(idea.status, 'unclear');
	assert.match(idea.unclearReason ?? '', /Trade Ratio/);
	assert.ok(idea.liquidationPrice != null);
	assert.ok(idea.tradeRatio != null && idea.tradeRatio < 3);
});

test('wrapAnalysisTradeSetup keeps clear when Trade Ratio meets minimum', () => {
	const idea = wrapAnalysisTradeSetup(
		{
			kind: 'chart_pattern',
			setup: {
				status: 'clear',
				source: 'primary_pattern',
				patternNumber: 1,
				patternId: 'ascending_triangle',
				patternName: 'Ascending Triangle',
				classification: 'bullish',
				confidence: 0.8,
				side: 'long',
				lastClose: 100,
				triggerPrice: 100,
				triggerLabel: 'R2 retest',
				targetPrice: 140,
				targetDirection: 'up',
				targetStatus: 'active',
				invalidationPrice: 95,
				invalidationLabel: 'S2',
				entryOffsetMode: 'retest',
			},
		},
		{toolName: 'analyze_chart_patterns', minTradeRatio: 3, assumedLeverage: 10},
	);
	assert.equal(idea.status, 'clear');
	assert.ok(idea.tradeRatio != null && idea.tradeRatio >= 3);
});

test('wrapAnalysisTradeSetup omits liquidation for Uniswap', () => {
	const idea = wrapAnalysisTradeSetup(
		{
			kind: 'chart_pattern',
			setup: {
				status: 'clear',
				source: 'primary_pattern',
				patternNumber: 1,
				patternId: 'ascending_triangle',
				patternName: 'Ascending Triangle',
				classification: 'bullish',
				confidence: 0.8,
				side: 'long',
				lastClose: 100,
				triggerPrice: 100,
				triggerLabel: 'R2 retest',
				targetPrice: 140,
				targetDirection: 'up',
				targetStatus: 'active',
				invalidationPrice: 95,
				invalidationLabel: 'S2',
				entryOffsetMode: 'retest',
			},
		},
		{
			toolName: 'analyze_chart_patterns',
			minTradeRatio: 3,
			assumedLeverage: 10,
			protocolId: 'uniswap',
		},
	);
	assert.equal(idea.status, 'clear');
	assert.ok(idea.tradeRatio != null && idea.tradeRatio >= 3);
	assert.equal(idea.liquidationPrice, undefined);
	assert.equal(idea.assumedLeverage, undefined);
});

test('trade_position overlay omits liquidation for Uniswap', () => {
	const overlay = tradePositionOverlayFromLevels({
		side: 'long',
		entry: 100,
		target: 130,
		invalidation: 90,
		protocolId: 'uniswap',
	});
	assert.ok(overlay);
	assert.equal(overlay!.tradeRatio, 3);
	assert.equal(overlay!.liquidation, undefined);
});

test('trade_position long geometry: target above entry, invalidation below', () => {
	const overlay = tradePositionOverlayFromLevels({
		side: 'long',
		entry: 100,
		target: 130,
		invalidation: 90,
	});
	assert.ok(overlay);
	assert.equal(overlay!.side, 'long');
	assert.ok(overlay!.target > overlay!.entry);
	assert.ok(overlay!.entry > overlay!.invalidation);
});

test('trade_position short geometry: target below entry, invalidation above', () => {
	const overlay = tradePositionOverlayFromLevels({
		side: 'short',
		entry: 100,
		target: 70,
		invalidation: 110,
	});
	assert.ok(overlay);
	assert.equal(overlay!.side, 'short');
	assert.ok(overlay!.target < overlay!.entry);
	assert.ok(overlay!.entry < overlay!.invalidation);
});

test('trade_position rejects inverted long/short level order (would flip reward/risk colors)', () => {
	assert.equal(
		tradePositionOverlayFromLevels({
			side: 'long',
			entry: 100,
			target: 90,
			invalidation: 110,
		}),
		null,
	);
	assert.equal(
		tradePositionOverlayFromLevels({
			side: 'short',
			entry: 100,
			target: 130,
			invalidation: 90,
		}),
		null,
	);
});
