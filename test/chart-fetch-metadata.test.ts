import assert from 'node:assert/strict';
import {test} from 'node:test';
import {extractChartMetadataFromFetchPayload} from '../dist/core/chart/fetch-metadata.js';

test('extractChartMetadataFromFetchPayload reads top-level title', () => {
	const meta = extractChartMetadataFromFetchPayload({
		title: 'ETH/USD 4H — last 90d',
		label: 'ETH/USD',
		result: [{time: 1, open: 1, high: 2, low: 1, close: 2}],
	});
	assert.equal(meta.title, 'ETH/USD 4H — last 90d');
	assert.equal(meta.label, 'ETH/USD');
});

test('extractChartMetadataFromFetchPayload reads nested result title', () => {
	const meta = extractChartMetadataFromFetchPayload({
		result: {
			title: 'BTC/USD 1D',
			label: 'BTC/USD',
			bars: [{time: 1, open: 1, high: 2, low: 1, close: 2}],
		},
	});
	assert.equal(meta.title, 'BTC/USD 1D');
});

test('extractChartMetadataFromFetchPayload reads hyperliquid ohlcv wrapper', () => {
	const meta = extractChartMetadataFromFetchPayload({
		ohlcv: {coin: 'ETH', interval: '1h', candles: []},
	});
	assert.equal(meta.title, 'ETH 1H');
	assert.equal(meta.label, 'ETH');
});

test('extractChartMetadataFromFetchPayload reads gmx flat symbol timeframe candles', () => {
	const meta = extractChartMetadataFromFetchPayload({
		symbol: 'ETH/USD [WETH-USDC]',
		timeframe: '1h',
		candles: [{timestampMs: 1, open: '1', high: '2', low: '1', close: '2'}],
	});
	assert.equal(meta.title, 'ETH/USD 1H');
	assert.equal(meta.label, 'ETH/USD');
});
