import assert from 'node:assert/strict';
import test from 'node:test';
import {
	assessTradeSetupEntryActionability,
	passesRetestEntryOffsetBand,
} from '../dist/core/chart/analysis/trade-setups/trade-entry-gates.js';

test('passesRetestEntryOffsetBand uses entryOffsetPct retest band', () => {
	assert.equal(
		passesRetestEntryOffsetBand({lastClose: 101, entryPrice: 100, side: 'long', entryOffsetPct: 1}),
		true,
	);
	assert.equal(
		passesRetestEntryOffsetBand({lastClose: 103, entryPrice: 100, side: 'long', entryOffsetPct: 1}),
		false,
	);
	assert.equal(
		passesRetestEntryOffsetBand({lastClose: 99, entryPrice: 100, side: 'short', entryOffsetPct: 1}),
		true,
	);
});

test('assessTradeSetupEntryActionability applies bounce proximity pct', () => {
	const far = assessTradeSetupEntryActionability({
		lastClose: 110,
		entryPrice: 100,
		side: 'long',
		entryOffsetMode: 'bounce',
		entryProximityPct: 1,
	});
	assert.equal(far.ok, false);
	const near = assessTradeSetupEntryActionability({
		lastClose: 100.5,
		entryPrice: 100,
		side: 'long',
		entryOffsetMode: 'bounce',
		entryProximityPct: 1,
	});
	assert.equal(near.ok, true);
	if (near.ok) {
		assert.equal(near.deskPcts.entryOffsetPct, 1);
	}
});
