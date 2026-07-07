import assert from 'node:assert/strict';
import {test} from 'node:test';
import {extractChartMetadataFromFetchPayload} from '../dist/core/chart/fetch-metadata.js';
import {CHART_DATA_SHAPE_PAYLOADS} from './fixtures/chart-data-shapes.ts';

test('extractChartMetadataFromFetchPayload reads top-level title', () => {
	const meta = extractChartMetadataFromFetchPayload({
		title: 'ASSET/USD 4H — last 90d',
		label: 'ASSET/USD',
		result: [{time: 1, open: 1, high: 2, low: 1, close: 2}],
	});
	assert.equal(meta.title, 'ASSET/USD 4H — last 90d');
	assert.equal(meta.label, 'ASSET/USD');
});

test('extractChartMetadataFromFetchPayload reads nested result title', () => {
	const meta = extractChartMetadataFromFetchPayload({
		result: {
			title: 'ASSET/USD 1D',
			label: 'ASSET/USD',
			bars: [{time: 1, open: 1, high: 2, low: 1, close: 2}],
		},
	});
	assert.equal(meta.title, 'ASSET/USD 1D');
});

test('extractChartMetadataFromFetchPayload reads nested-interval-envelope metadata', () => {
	const meta = extractChartMetadataFromFetchPayload(
		CHART_DATA_SHAPE_PAYLOADS['nested-interval-envelope'],
	);
	assert.equal(meta.title, 'ASSET 1H');
	assert.equal(meta.label, 'ASSET');
});

test('extractChartMetadataFromFetchPayload reads flat-symbol-envelope metadata', () => {
	const meta = extractChartMetadataFromFetchPayload(
		CHART_DATA_SHAPE_PAYLOADS['flat-symbol-envelope'],
	);
	assert.equal(meta.title, 'ASSET/USD 1H');
	assert.equal(meta.label, 'ASSET/USD');
});
