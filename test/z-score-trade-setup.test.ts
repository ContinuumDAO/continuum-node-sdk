import assert from 'node:assert/strict';
import test from 'node:test';
import {buildZScoreTradeSetup} from '../dist/core/chart/analysis/trade-setups/z-score-trade-setup.js';
import {tradeIdeaFromAnalyzeOutput} from '../dist/core/chart/analysis/trade-setups/trade-idea.js';

test('buildZScoreTradeSetup clear long when Z <= -entry', () => {
	const setup = buildZScoreTradeSetup({
		lastClose: 96,
		z: -2.1,
		sma: 100,
		sd: 2,
		period: 20,
		entryZ: 2,
		exitZ: 0.5,
		stopAtrMultiple: 2,
		atr: 1.5,
	});
	assert.ok(setup);
	assert.equal(setup!.side, 'long');
	assert.equal(setup!.status, 'clear');
	assert.equal(setup!.setupPurposeCode, 'zs-fade');
	assert.equal(setup!.entryPrice, 96);
	assert.equal(setup!.targetPrice, 101); // 100 + 0.5*2
	assert.equal(setup!.invalidationPrice, 93); // 96 - 2*1.5
});

test('buildZScoreTradeSetup clear short when Z >= entry', () => {
	const setup = buildZScoreTradeSetup({
		lastClose: 104,
		z: 2.2,
		sma: 100,
		sd: 2,
		period: 20,
		entryZ: 2,
		exitZ: 0.5,
		stopAtrMultiple: 2,
		atr: 1,
	});
	assert.ok(setup);
	assert.equal(setup!.side, 'short');
	assert.equal(setup!.status, 'clear');
	assert.equal(setup!.entryPrice, 104);
	assert.equal(setup!.targetPrice, 99); // 100 - 0.5*2
	assert.equal(setup!.invalidationPrice, 106); // 104 + 2*1
});

test('buildZScoreTradeSetup unclear inside threshold', () => {
	const setup = buildZScoreTradeSetup({
		lastClose: 100.5,
		z: 0.4,
		sma: 100,
		sd: 1.25,
		period: 20,
		atr: 1,
	});
	assert.ok(setup);
	assert.equal(setup!.side, 'neutral');
	assert.equal(setup!.status, 'unclear');
});

test('buildZScoreTradeSetup contracting ATR filter blocks expanding vol', () => {
	const setup = buildZScoreTradeSetup({
		lastClose: 96,
		z: -2.5,
		sma: 100,
		sd: 2,
		period: 20,
		atrFilter: 'contracting',
		atr: 2,
		atrPrev: 1.5,
	});
	assert.ok(setup);
	assert.equal(setup!.side, 'long');
	assert.equal(setup!.status, 'unclear');
	assert.match(setup!.unclearReason ?? '', /contracting/i);
});

test('buildZScoreTradeSetup contracting ATR filter allows contracting vol', () => {
	const setup = buildZScoreTradeSetup({
		lastClose: 96,
		z: -2.5,
		sma: 100,
		sd: 2,
		period: 20,
		atrFilter: 'contracting',
		atr: 1.2,
		atrPrev: 1.8,
	});
	assert.ok(setup);
	assert.equal(setup!.status, 'clear');
	assert.equal(setup!.atrContracting, true);
});

test('tradeIdeaFromAnalyzeOutput z_score clear setup is full completeness', () => {
	const setup = buildZScoreTradeSetup({
		lastClose: 96,
		z: -2.1,
		sma: 100,
		sd: 2,
		period: 20,
		atr: 1.5,
	});
	const idea = tradeIdeaFromAnalyzeOutput('analyze_z_score', {
		zScoreTradeSetup: setup,
	});
	assert.ok(idea);
	assert.equal(idea!.source.analysisType, 'z_score');
	assert.equal(idea!.completeness, 'full');
	assert.ok(idea!.zScoreContext);
	assert.equal(idea!.zScoreContext!.entryZ, 2);
});
