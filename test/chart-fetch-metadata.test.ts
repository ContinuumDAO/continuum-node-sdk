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

test('extractChartMetadataFromFetchPayload reads symbol-interval-klines-envelope metadata', () => {
	const meta = extractChartMetadataFromFetchPayload(
		CHART_DATA_SHAPE_PAYLOADS['symbol-interval-klines-envelope'],
	);
	assert.equal(meta.title, 'BTCUSDT 1H');
	assert.equal(meta.label, 'BTCUSDT');
});

test('extractChartMetadataFromFetchPayload reads date-field historical envelope', () => {
	const meta = extractChartMetadataFromFetchPayload(
		CHART_DATA_SHAPE_PAYLOADS['date-field-historical-envelope'],
	);
	assert.equal(meta.title, 'BTCUSD 1D');
	assert.equal(meta.label, 'BTCUSD');
});

test('extractChartMetadataFromFetchPayload reads symbol-timeframe-bars envelope', () => {
	const meta = extractChartMetadataFromFetchPayload(
		CHART_DATA_SHAPE_PAYLOADS['symbol-timeframe-bars-envelope'],
	);
	assert.equal(meta.title, 'AAPL 1DAY');
	assert.equal(meta.label, 'AAPL');
});

test('extractChartMetadataFromFetchPayload reads symbol-keyed ohlc bars', () => {
	const meta = extractChartMetadataFromFetchPayload(
		CHART_DATA_SHAPE_PAYLOADS['symbol-keyed-ohlc-bars'],
	);
	assert.equal(meta.title, 'AAPL 1DAY');
	assert.equal(meta.label, 'AAPL');
});

test('extractChartMetadataFromFetchPayload reads date-field data array', () => {
	const meta = extractChartMetadataFromFetchPayload(
		CHART_DATA_SHAPE_PAYLOADS['date-field-data-array'],
	);
	assert.equal(meta.title, 'AAPL 1D');
	assert.equal(meta.label, 'AAPL');
});

test('extractChartMetadataFromFetchPayload reads markdown OHLCV table preamble', () => {
	const meta = extractChartMetadataFromFetchPayload(
		CHART_DATA_SHAPE_PAYLOADS['markdown-ohlcv-table'],
	);
	assert.equal(meta.title, 'NVDA 1D');
	assert.equal(meta.label, 'NVDA');
});

test('extractChartMetadataFromFetchPayload reads uniswap-v4 flat pool envelope', () => {
	const meta = extractChartMetadataFromFetchPayload(
		CHART_DATA_SHAPE_PAYLOADS['uniswap-v4-flat-pool-envelope'],
	);
	assert.equal(meta.title, 'ETH/USDC 1H');
	assert.equal(meta.label, 'ETH/USDC');
});
