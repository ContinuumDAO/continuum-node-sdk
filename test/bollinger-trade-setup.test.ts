import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildBollingerTradeSetup,
	bollingerTradeIdeaContextFromSetup,
	withinBandProximity,
} from '../dist/core/chart/analysis/trade-setups/bollinger-trade-setup.js';
import {formatTradePurposeMetaCtm1} from '../dist/core/chart/analysis/trade-setups/trade-purpose-format.js';
import {tradeIdeaFromAnalyzeOutput} from '../dist/core/chart/analysis/trade-setups/trade-idea.js';
import {tradeIdeaToListItem} from '../dist/core/chart/analysis/trade-setups/trade-idea-list.js';

const bands = {upper: 110, middle: 100, lower: 90, period: 20, stdDev: 2};

test('withinBandProximity uses band-width percentage', () => {
	assert.equal(withinBandProximity(109.2, 110, 20, 5), true);
	assert.equal(withinBandProximity(108, 110, 20, 5), false);
});

test('buildBollingerTradeSetup clear short near upper band targets lower', () => {
	const setup = buildBollingerTradeSetup({
		lastClose: 109.5,
		...bands,
		entryProximityPct: 5,
	});
	assert.ok(setup);
	assert.equal(setup!.side, 'short');
	assert.equal(setup!.status, 'clear');
	assert.equal(setup!.entryPrice, 110);
	assert.equal(setup!.targetPrice, 90);
	assert.equal(setup!.invalidationPrice, 110);
	assert.equal(setup!.invalidated, false);
});

test('buildBollingerTradeSetup clear long near lower band targets upper', () => {
	const setup = buildBollingerTradeSetup({
		lastClose: 90.5,
		...bands,
		entryProximityPct: 5,
	});
	assert.ok(setup);
	assert.equal(setup!.side, 'long');
	assert.equal(setup!.status, 'clear');
	assert.equal(setup!.entryPrice, 90);
	assert.equal(setup!.targetPrice, 110);
	assert.equal(setup!.invalidated, false);
});

test('buildBollingerTradeSetup invalidates short above upper band', () => {
	const setup = buildBollingerTradeSetup({
		lastClose: 111,
		...bands,
		entryProximityPct: 5,
	});
	assert.ok(setup);
	assert.equal(setup!.side, 'short');
	assert.equal(setup!.status, 'unclear');
	assert.equal(setup!.invalidated, true);
	assert.match(setup!.unclearReason ?? '', /above upper/i);
});

test('buildBollingerTradeSetup invalidates long below lower band', () => {
	const setup = buildBollingerTradeSetup({
		lastClose: 89,
		...bands,
		entryProximityPct: 5,
	});
	assert.ok(setup);
	assert.equal(setup!.side, 'long');
	assert.equal(setup!.status, 'unclear');
	assert.equal(setup!.invalidated, true);
});

test('buildBollingerTradeSetup stays unclear mid-band away from entry', () => {
	const setup = buildBollingerTradeSetup({
		lastClose: 105,
		...bands,
		entryProximityPct: 5,
	});
	assert.ok(setup);
	assert.equal(setup!.side, 'short');
	assert.equal(setup!.status, 'unclear');
	assert.equal(setup!.entryPrice, undefined);
});

test('tradeIdeaFromAnalyzeOutput bollinger clear setup is full completeness', () => {
	const setup = buildBollingerTradeSetup({
		lastClose: 109.5,
		...bands,
		entryProximityPct: 5,
	});
	const idea = tradeIdeaFromAnalyzeOutput('analyze_bollinger_bands', {
		bollingerTradeSetup: setup,
	});
	assert.ok(idea);
	assert.equal(idea!.source.analysisType, 'bollinger_bands');
	assert.equal(idea!.completeness, 'full');
	assert.equal(idea!.target?.price, 90);
	assert.ok(idea!.bollingerContext);
	assert.equal(idea!.bollingerContext!.percentB, setup!.percentB);
	assert.equal(idea!.bollingerContext!.invalidated, false);
	assert.equal(idea!.bollingerContext!.setupPurposeCode, 'bb-fade');
});

test('tradeIdeaToListItem surfaces bollinger context fields', () => {
	const setup = buildBollingerTradeSetup({
		lastClose: 105,
		...bands,
		entryProximityPct: 5,
	});
	assert.ok(setup);
	const idea = tradeIdeaFromAnalyzeOutput('analyze_bollinger_bands', {
		bollingerTradeSetup: setup,
	});
	assert.ok(idea);
	const item = tradeIdeaToListItem(idea!, 1);
	assert.equal(item.percentB, setup!.percentB);
	assert.equal(item.invalidated, false);
	assert.equal(item.setupPurposeCode, 'bb-fade');
	assert.equal(item.entryOffsetPct, setup!.entryOffsetPct);
	assert.ok(item.bandWidthPct != null && item.bandWidthPct > 0);
});

test('formatTradePurposeMetaCtm1 uses bb-fade setup code for bollinger fade', () => {
	const {meta} = formatTradePurposeMetaCtm1({
		protocol: 'hl',
		side: 'short',
		setup: 'bb-fade',
		entryEffective: 111.1,
		patternFailureEffective: 111.1,
		symbolShort: 'ETH',
		entryBase: 110,
		patternFailureBase: 110,
	});
	assert.ok(meta.startsWith('ctm1|hl|S|bb-fade|'));
	assert.ok(meta.includes('eE='));
	assert.ok(meta.includes('pfE='));
});

test('bollingerTradeIdeaContextFromSetup marks invalidated setups', () => {
	const setup = buildBollingerTradeSetup({
		lastClose: 111,
		...bands,
		entryProximityPct: 5,
	});
	assert.ok(setup);
	const ctx = bollingerTradeIdeaContextFromSetup(setup!);
	assert.equal(ctx.invalidated, true);
	assert.equal(ctx.percentB, setup!.percentB);
});
