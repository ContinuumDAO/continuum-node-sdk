import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	invalidationBasisFromIdea,
	targetBasisFromIdea,
	tradeIdeaToListItem,
} from '../dist/core/chart/analysis/trade-setups/trade-idea-list.js';
import type {TradeIdea} from '../dist/core/chart/analysis/trade-setups/trade-idea.js';

function stubIdea(partial: {
	analysisType: TradeIdea['source']['analysisType'];
	setup: TradeIdea['analysisSetup'];
	target?: TradeIdea['target'];
	invalidation?: TradeIdea['invalidation'];
	side?: TradeIdea['side'];
}): TradeIdea {
	return {
		id: 'basis-test',
		source: {
			analysisType: partial.analysisType,
			toolName: `analyze_${partial.analysisType}`,
		},
		analysisSetup: partial.setup,
		status: 'clear',
		completeness: 'full',
		side: partial.side ?? 'long',
		confidence: 0.7,
		lastClose: 100,
		entry: {price: 100, label: 'entry'},
		...(partial.target ? {target: partial.target} : {}),
		...(partial.invalidation ? {invalidation: partial.invalidation} : {}),
		createdAtSec: 1,
	};
}

test('ATR-style donchian target/invalidation basis uses setup labels', () => {
	const idea = stubIdea({
		analysisType: 'donchian_breakout',
		side: 'long',
		setup: {
			kind: 'donchian_breakout',
			setup: {
				status: 'clear',
				source: 'donchian_breakout',
				side: 'long',
				lastClose: 100,
				confidence: 0.7,
				targetPrice: 106,
				targetLabel: 'entry + 3× ATR',
				invalidationPrice: 98,
				invalidationLabel: 'Donchian mid-channel',
			} as never,
		},
		target: {price: 106, label: 'entry + 3× ATR'},
		invalidation: {price: 98, label: 'Donchian mid-channel'},
	});
	assert.equal(targetBasisFromIdea(idea), 'Target: entry + 3× ATR');
	assert.equal(invalidationBasisFromIdea(idea), 'Invalidation: Donchian mid-channel');
	const item = tradeIdeaToListItem(idea, 1);
	assert.equal(item.targetBasis, 'Target: entry + 3× ATR');
	assert.equal(item.invalidationBasis, 'Invalidation: Donchian mid-channel');
});

test('supertrend and ichimoku ATR targets surface directional formulas', () => {
	const supertrend = stubIdea({
		analysisType: 'supertrend',
		side: 'short',
		setup: {
			kind: 'supertrend',
			setup: {
				status: 'clear',
				source: 'supertrend',
				side: 'short',
				lastClose: 100,
				confidence: 0.7,
				targetPrice: 94,
				targetLabel: 'entry - 3× ATR',
				invalidationPrice: 101,
				invalidationLabel: 'Supertrend trail',
			} as never,
		},
		target: {price: 94, label: 'entry - 3× ATR'},
		invalidation: {price: 101, label: 'Supertrend trail'},
	});
	assert.equal(targetBasisFromIdea(supertrend), 'Target: entry - 3× ATR');
	assert.equal(invalidationBasisFromIdea(supertrend), 'Invalidation: Supertrend trail');

	const ichimoku = stubIdea({
		analysisType: 'ichimoku',
		setup: {
			kind: 'ichimoku',
			setup: {
				status: 'clear',
				source: 'ichimoku',
				side: 'long',
				lastClose: 100,
				confidence: 0.7,
				targetPrice: 109,
				targetLabel: 'entry + 3× ATR',
				invalidationPrice: 97,
				invalidationLabel: 'Below cloud / kijun',
			} as never,
		},
		target: {price: 109, label: 'entry + 3× ATR'},
		invalidation: {price: 97, label: 'Below cloud / kijun'},
	});
	assert.equal(targetBasisFromIdea(ichimoku), 'Target: entry + 3× ATR');
	assert.equal(invalidationBasisFromIdea(ichimoku), 'Invalidation: Below cloud / kijun');
});

test('z-score ATR stop and key-level bases are included', () => {
	const zScore = stubIdea({
		analysisType: 'z_score',
		setup: {
			kind: 'z_score',
			setup: {
				status: 'clear',
				source: 'z_score',
				side: 'long',
				lastClose: 100,
				confidence: 0.7,
				targetPrice: 102,
				targetLabel: 'Z return to +0.5',
				invalidationPrice: 97,
				invalidationLabel: '1.5× ATR below entry',
			} as never,
		},
		target: {price: 102, label: 'Z return to +0.5'},
		invalidation: {price: 97, label: '1.5× ATR below entry'},
	});
	assert.equal(targetBasisFromIdea(zScore), 'Target: Z return to +0.5');
	assert.equal(invalidationBasisFromIdea(zScore), 'Invalidation: 1.5× ATR below entry');

	const keyLevels = stubIdea({
		analysisType: 'key_levels',
		setup: {
			kind: 'key_levels',
			setup: {
				status: 'clear',
				source: 'key_levels',
				side: 'long',
				lastClose: 100,
				confidence: 0.7,
				targetPrice: 110,
				targetLabel: 'next resistance',
				targetSource: 'next_level',
				invalidationPrice: 95,
				invalidationLabel: 'lower support',
			} as never,
		},
		target: {price: 110, label: 'next resistance'},
		invalidation: {price: 95, label: 'lower support'},
	});
	assert.equal(targetBasisFromIdea(keyLevels), 'Target: next resistance (next level)');
	assert.equal(invalidationBasisFromIdea(keyLevels), 'Invalidation: lower support');
});

test('missing labels fall back to analysis-type defaults when prices exist', () => {
	const idea = stubIdea({
		analysisType: 'range_volatility',
		setup: {
			kind: 'range_volatility',
			setup: {
				status: 'clear',
				source: 'range_volatility',
				side: 'long',
				lastClose: 100,
				confidence: 0.7,
				targetPrice: 105,
				invalidationPrice: 98,
			} as never,
		},
		target: {price: 105},
		invalidation: {price: 98},
	});
	assert.equal(
		targetBasisFromIdea(idea),
		'Target: range midpoint (~50% of range)',
	);
	assert.equal(
		invalidationBasisFromIdea(idea),
		'Invalidation: range bound break (high/low)',
	);
});
