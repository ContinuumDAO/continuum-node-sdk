import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildChartPatternAnalysis} from '../dist/core/chart-patterns/recommendation.js';
import {
	CHART_PATTERN_MENU_MIN_BARS,
	patternHitBarCount,
} from '../dist/core/chart-patterns/pattern-menu-summary.js';
import type {EnrichedChartPatternHit} from '../dist/core/chart-patterns/types.js';

function mockHit(options: {
	fromIndex: number;
	toIndex: number;
	confidence: number;
	id?: string;
	name?: string;
}): EnrichedChartPatternHit {
	const {fromIndex, toIndex, confidence} = options;
	return {
		id: (options.id ?? 'double_top') as EnrichedChartPatternHit['id'],
		name: options.name ?? 'Double Top',
		category: 'reversal',
		direction: 'bearish',
		confidence,
		classification: 'bearish',
		barSpan: {
			fromIndex,
			toIndex,
			fromTimeSec: 1_700_000_000 + fromIndex * 3600,
			toTimeSec: 1_700_000_000 + toIndex * 3600,
		},
		points: [],
		lines: [],
		description: 'test pattern',
		interpretation: 'test',
		drawable: true,
		drawingSpec: {
			version: 1,
			patternId: 'double_top',
			barSpan: {
				fromIndex,
				toIndex,
				fromTimeSec: 1_700_000_000 + fromIndex * 3600,
				toTimeSec: 1_700_000_000 + toIndex * 3600,
			},
			elements: [],
			legend: [],
		},
	};
}

test('buildChartPatternAnalysis excludes pattern menu rows shorter than 6 bars', () => {
	const shortHighConfidence = mockHit({fromIndex: 40, toIndex: 41, confidence: 0.99});
	const mediumIncluded = mockHit({fromIndex: 30, toIndex: 37, confidence: 0.8, id: 'flag', name: 'Flag'});
	const longRecent = mockHit({fromIndex: 20, toIndex: 35, confidence: 0.55, id: 'triangle_symmetrical', name: 'Symmetrical Triangle'});
	const longOlder = mockHit({fromIndex: 5, toIndex: 20, confidence: 0.7, id: 'double_bottom', name: 'Double Bottom'});

	assert.equal(patternHitBarCount(shortHighConfidence), 2);
	assert.equal(patternHitBarCount(mediumIncluded), 8);

	const analysis = buildChartPatternAnalysis(
		[shortHighConfidence, mediumIncluded, longRecent, longOlder],
		50,
		10,
		100,
	);

	assert.equal(analysis.patternMenu.length, 3);
	for (const row of analysis.patternMenu) {
		assert.ok(row.barSpan.barCount >= CHART_PATTERN_MENU_MIN_BARS);
	}
	assert.equal(analysis.highestConfidencePattern?.name, 'Flag');
	assert.equal(analysis.primaryPattern?.name, 'Flag');
	assert.equal(analysis.patterns.length, 3);
});

test('buildChartPatternAnalysis returns empty menu when all candidates are too short', () => {
	const analysis = buildChartPatternAnalysis(
		[
			mockHit({fromIndex: 10, toIndex: 11, confidence: 0.95}),
			mockHit({fromIndex: 12, toIndex: 16, confidence: 0.85, id: 'pennant', name: 'Pennant'}),
		],
		30,
		10,
		100,
	);

	assert.equal(analysis.patternMenu.length, 0);
	assert.equal(analysis.patterns.length, 0);
	assert.match(analysis.rationale ?? '', /6-bar menu minimum/);
});
