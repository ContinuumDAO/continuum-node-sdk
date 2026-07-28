import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildDonchianTradeSetup,
	buildImmediateDonchianSetup,
	buildRetestDonchianSetup,
	type DonchianChannelPoint,
} from '../dist/core/chart/analysis/trade-setups/donchian-trade-setup.js';
import {tradeIdeaFromAnalyzeOutput} from '../dist/core/chart/analysis/trade-setups/trade-idea.js';

function makeChannels(
	closes: number[],
	period: number,
	upper: number,
	lower: number,
): Array<DonchianChannelPoint | null> {
	const middle = (upper + lower) / 2;
	return closes.map((_, i) =>
		i < period - 1 ? null : {upper, middle, lower},
	);
}

test('buildImmediateDonchianSetup clear long on fresh break above prior high', () => {
	const setup = buildImmediateDonchianSetup({
		lastClose: 111,
		prevClose: 109,
		upper: 112,
		middle: 100,
		lower: 88,
		priorUpper: 110,
		priorLower: 90,
		period: 20,
		entryProximityPct: 5,
		atr: 2,
		targetAtrMultiple: 3,
	});
	assert.ok(setup);
	assert.equal(setup!.side, 'long');
	assert.equal(setup!.status, 'clear');
	assert.equal(setup!.setupPurposeCode, 'dc-brk');
	assert.equal(setup!.entryPrice, 110);
	assert.equal(setup!.targetPrice, 116); // 110 + 3×2
	assert.equal(setup!.invalidationPrice, 100);
	assert.equal(setup!.brokeOnLastBar, true);
});

test('buildImmediateDonchianSetup clear short on fresh break below prior low', () => {
	const setup = buildImmediateDonchianSetup({
		lastClose: 89,
		prevClose: 91,
		upper: 112,
		middle: 100,
		lower: 88,
		priorUpper: 110,
		priorLower: 90,
		period: 20,
		entryProximityPct: 5,
		atr: 2,
		targetAtrMultiple: 3,
	});
	assert.ok(setup);
	assert.equal(setup!.side, 'short');
	assert.equal(setup!.status, 'clear');
	assert.equal(setup!.entryPrice, 90);
	assert.equal(setup!.targetPrice, 84); // 90 − 3×2
	assert.equal(setup!.invalidationPrice, 100);
});

test('buildRetestDonchianSetup clear after break then return near band', () => {
	const period = 5;
	const closes = [100, 101, 102, 103, 104, 111, 110.2];
	const channels = makeChannels(closes, period, 110, 90);
	// Prior to break bar: upper 110; break at index 5 (111); retest near 110 at last
	const setup = buildRetestDonchianSetup({
		closes,
		channels,
		lastClose: 110.2,
		upper: 110,
		middle: 100,
		lower: 90,
		priorUpper: 110,
		priorLower: 90,
		period,
		entryProximityPct: 1,
		lookback: 10,
		atr: 1.5,
		targetAtrMultiple: 3,
	});
	assert.ok(setup);
	assert.equal(setup!.side, 'long');
	assert.equal(setup!.status, 'clear');
	assert.equal(setup!.setupPurposeCode, 'dc-ret');
	assert.equal(setup!.entryPrice, 110);
	assert.equal(setup!.targetPrice, 114.5); // 110 + 3×1.5
	assert.equal(setup!.invalidationPrice, 100);
	assert.match(setup!.invalidationLabel ?? '', /mid/i);
});

test('buildDonchianTradeSetup defaults to retest primary with immediate alternate', () => {
	const period = 5;
	const closes = [100, 101, 102, 103, 104, 111, 110.2];
	const channels = makeChannels(closes, period, 110, 90);
	const setup = buildDonchianTradeSetup({
		closes,
		channels,
		period,
		entryProximityPct: 1,
		atr: 2,
	});
	assert.ok(setup);
	assert.equal(setup!.entryMode, 'retest');
	assert.equal(setup!.setupPurposeCode, 'dc-ret');
	assert.equal(setup!.targetAtrMultiple, 3);
	assert.ok(setup!.immediateAlternative);
	assert.equal(setup!.immediateAlternative!.setupPurposeCode, 'dc-brk');
});

test('buildDonchianTradeSetup immediate mode nests retest alternate', () => {
	const period = 5;
	const closes = [100, 101, 102, 103, 104, 109, 111];
	const channels = makeChannels(closes, period, 112, 90);
	// Set prior channel via last-1: channels[5] is prior for last bar
	channels[5] = {upper: 110, middle: 100, lower: 90};
	channels[6] = {upper: 111, middle: 100.5, lower: 90};
	const setup = buildDonchianTradeSetup({
		closes,
		channels,
		period,
		entryMode: 'immediate',
		entryProximityPct: 5,
		atr: 2,
		targetAtrMultiple: 4,
	});
	assert.ok(setup);
	assert.equal(setup!.entryMode, 'immediate');
	assert.equal(setup!.setupPurposeCode, 'dc-brk');
	assert.equal(setup!.targetPrice, 118); // 110 + 4×2
	assert.equal(setup!.invalidationPrice, 100.5);
	assert.ok(setup!.breakRetestAlternative);
});

test('tradeIdeaFromAnalyzeOutput donchian clear setup is full completeness', () => {
	const period = 5;
	const closes = [100, 101, 102, 103, 104, 111, 110.2];
	const channels = makeChannels(closes, period, 110, 90);
	const setup = buildDonchianTradeSetup({
		closes,
		channels,
		period,
		entryProximityPct: 1,
		atr: 2,
	});
	const idea = tradeIdeaFromAnalyzeOutput('analyze_donchian_breakout', {
		donchianTradeSetup: setup,
	});
	assert.ok(idea);
	assert.equal(idea!.source.analysisType, 'donchian_breakout');
	assert.equal(idea!.completeness, 'full');
	assert.ok(idea!.donchianContext);
	assert.equal(idea!.donchianContext!.entryMode, 'retest');
	assert.equal(idea!.donchianContext!.targetAtrMultiple, 3);
});
