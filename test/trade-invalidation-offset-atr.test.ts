import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	DEFAULT_TRADE_DESK_INVALIDATION_OFFSET_PCT,
	DEFAULT_TRADE_DESK_INVALIDATION_OFFSET_PCT_ATR,
	resolveInvalidationOffsetPct,
	tradeDeskConfig,
} from '../dist/core/chart/analysis/trade-setups/trade-desk-defaults.js';
import {
	applyInvalidationOffset,
	pricesAfterDefaultDeskOffsets,
} from '../dist/core/chart/analysis/trade-setups/trade-price-offsets.js';

test('resolveInvalidationOffsetPct defaults 1 for price and 25 for atr when omitted', () => {
	assert.equal(resolveInvalidationOffsetPct('price'), DEFAULT_TRADE_DESK_INVALIDATION_OFFSET_PCT);
	assert.equal(resolveInvalidationOffsetPct('atr'), DEFAULT_TRADE_DESK_INVALIDATION_OFFSET_PCT_ATR);
	assert.equal(resolveInvalidationOffsetPct('atr', 40), 40);
	assert.equal(resolveInvalidationOffsetPct('atr', 1), 1);
	assert.equal(resolveInvalidationOffsetPct('price', 2), 2);
});

test('tradeDeskConfig atr mode resolves omitted invalidationOffsetPct to 25', () => {
	const desk = tradeDeskConfig({invalidationOffsetMode: 'atr'});
	assert.equal(desk.invalidationOffsetMode, 'atr');
	assert.equal(desk.invalidationOffsetPct, 25);
	const explicit = tradeDeskConfig({invalidationOffsetMode: 'atr', invalidationOffsetPct: 40});
	assert.equal(explicit.invalidationOffsetPct, 40);
});

test('pricesAfterDefaultDeskOffsets atr mode widens invalidation; missing ATR falls back to price pct', () => {
	const withAtr = pricesAfterDefaultDeskOffsets({
		side: 'long',
		entry: 2900,
		target: 3100,
		invalidation: 2850,
		entryOffsetMode: 'retest',
		entryOffsetPct: 0,
		invalidationOffsetMode: 'atr',
		atr: 40,
	});
	assert.equal(withAtr.invalidation, 2840);

	const missingAtr = pricesAfterDefaultDeskOffsets({
		side: 'long',
		entry: 2900,
		target: 3100,
		invalidation: 2850,
		entryOffsetMode: 'retest',
		entryOffsetPct: 0,
		invalidationOffsetMode: 'atr',
		// omitted atr → price fallback with price-scale pct (1, not 25)
	});
	assert.equal(missingAtr.invalidation, applyInvalidationOffset(2850, 'long', 1, 'price'));
});
