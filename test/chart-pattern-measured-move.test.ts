import assert from 'node:assert/strict';
import {test} from 'node:test';
import {computeMeasuredMove} from '../dist/core/chart-patterns/measured-move.js';
import {buildChartPatternTradeSetupFromSummary} from '../dist/core/chart/analysis/trade-setups/chart-pattern-trade-setup.js';
import type {ChartPatternHit, NormalizedBar} from '../dist/core/chart-patterns/types.js';

function makeBars(fromIndex: number, toIndex: number, low: number, high: number): NormalizedBar[] {
	const bars: NormalizedBar[] = [];
	for (let i = fromIndex; i <= toIndex; i++) {
		const mid = (low + high) / 2;
		bars.push({
			index: i,
			time: i * 1000,
			timeSec: i * 1000,
			open: mid,
			high,
			low,
			close: mid,
		});
	}
	return bars;
}

/** Mirrors the BTC 4h session hit shape: neutral triangle, upside break of R2. */
function symmetricalTriangleHit(overrides?: Partial<ChartPatternHit>): ChartPatternHit {
	return {
		id: 'symmetrical_triangle',
		name: 'Symmetrical Triangle',
		category: 'continuation',
		direction: 'neutral',
		confidence: 0.69,
		classification: 'neutral',
		completionState: 'completed',
		barSpan: {fromIndex: 0, toIndex: 29, fromTimeSec: 0, toTimeSec: 29_000},
		points: [
			{timeSec: 0, price: 61551, label: 'S1', role: 'support'},
			{timeSec: 29_000, price: 63516, label: 'S2', role: 'support'},
			{timeSec: 0, price: 66420, label: 'R1', role: 'resistance'},
			{timeSec: 29_000, price: 64147, label: 'R2', role: 'resistance'},
		],
		lines: [],
		description: 'test',
		interpretation: 'test',
		...overrides,
	};
}

test('neutral symmetrical triangle upside break projects target above pattern high', () => {
	const hit = symmetricalTriangleHit();
	const bars = makeBars(0, 29, 62703, 66420);
	// Break above R2 (64147) — same side the trade desk resolved as long.
	bars[bars.length - 1] = {...bars[bars.length - 1]!, close: 64200};
	const mm = computeMeasuredMove(hit, bars);
	assert.ok(mm);
	assert.equal(mm!.direction, 'up');
	assert.equal(mm!.referencePrice, 66420);
	assert.ok(mm!.targetPrice > mm!.referencePrice);
	assert.ok(mm!.targetPrice > 64200);
	// Must not reuse the old bug: patternLow - height labeled as "up".
	assert.ok(mm!.targetPrice !== 62703 - (66420 - 62703));
});

test('neutral symmetrical triangle downside break projects target below pattern low', () => {
	const hit = symmetricalTriangleHit();
	const bars = makeBars(0, 29, 62703, 66420);
	bars[bars.length - 1] = {...bars[bars.length - 1]!, close: 63400};
	const mm = computeMeasuredMove(hit, bars);
	assert.ok(mm);
	assert.equal(mm!.direction, 'down');
	assert.equal(mm!.referencePrice, 62703);
	assert.ok(mm!.targetPrice < mm!.referencePrice);
	assert.ok(mm!.targetPrice < 63400);
});

test('neutral symmetrical triangle still inside has no measured move', () => {
	const hit = symmetricalTriangleHit({completionState: 'forming'});
	const bars = makeBars(0, 29, 62703, 66420);
	bars[bars.length - 1] = {...bars[bars.length - 1]!, close: 63800};
	const mm = computeMeasuredMove(hit, bars);
	assert.equal(mm, null);
});

test('chart pattern trade setup drops measured target on wrong side of long entry', () => {
	const setup = buildChartPatternTradeSetupFromSummary(
		{
			id: 'symmetrical_triangle',
			name: 'Symmetrical Triangle',
			classification: 'neutral',
			confidence: 0.69,
			interpretation: 'test',
			barSpan: {fromIndex: 0, toIndex: 29, barCount: 30},
			keyLevels: [
				{price: 63516, label: 'S2'},
				{price: 64147, label: 'R2'},
			],
			measuredMove: {
				referencePrice: 62703,
				targetPrice: 58985,
				direction: 'up',
				status: 'active',
			},
		},
		// Clear of 0.1% break tolerance above R2 (session-style upside break).
		65000,
		1,
		'completed',
	);
	assert.equal(setup.side, 'long');
	assert.equal(setup.triggerPrice, 64147);
	assert.equal(setup.invalidationPrice, 63516);
	assert.equal(setup.targetPrice, undefined);
});
