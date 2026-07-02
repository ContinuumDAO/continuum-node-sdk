import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildChartAttachmentRef,
	formatChartKeyGenFence,
	sha256HexUtf8,
} from '../dist/core/chart/keygen-format.js';
import {CHART_V1_KIND} from '../dist/core/chart/schemas.js';

test('buildChartAttachmentRef uses upload ids and title', () => {
	const envelope = {
		kind: CHART_V1_KIND,
		chart: {
			title: 'BTC 1h',
			height: 400,
			series: [{type: 'candlestick' as const, data: []}],
		},
	};
	const ref = buildChartAttachmentRef(envelope, {attachmentId: 'att-1', sha256: 'abc'});
	assert.equal(ref.attachmentId, 'att-1');
	assert.equal(ref.sha256, 'abc');
	assert.equal(ref.kind, CHART_V1_KIND);
	assert.equal(ref.title, 'BTC 1h');
});

test('formatChartKeyGenFence wraps continuum/chart/v1 json', () => {
	const envelope = {
		kind: CHART_V1_KIND,
		chart: {title: 'T', height: 300, series: [{type: 'line' as const, data: []}]},
	};
	const fence = formatChartKeyGenFence(envelope);
	assert.match(fence, /^```continuum\/chart\/v1\n/);
	assert.match(fence, /"kind":"continuum\/chart\/v1"/);
});

test('sha256HexUtf8 is stable', () => {
	assert.equal(sha256HexUtf8('hello').length, 64);
});
