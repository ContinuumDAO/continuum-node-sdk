import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	defiOhlcvChartWorkflowReminder,
	defiProtocolFetchOhlcvToolName,
} from '../dist/mcp/defi/ohlcv-chart-workflow.js';

test('defiProtocolFetchOhlcvToolName finds hyperliquid fetch tool', () => {
	assert.equal(defiProtocolFetchOhlcvToolName('hyperliquid'), 'ctm_hyperliquid_fetch_ohlcv');
});

test('defiProtocolFetchOhlcvToolName finds gmx fetch tool', () => {
	assert.equal(defiProtocolFetchOhlcvToolName('gmx'), 'ctm_gmx_fetch_ohlcv');
});

test('defiProtocolFetchOhlcvToolName returns undefined for protocols without ohlcv', () => {
	assert.equal(defiProtocolFetchOhlcvToolName('aave-v4'), undefined);
});

test('defiOhlcvChartWorkflowReminder mentions prepare_chart_from_rows', () => {
	const text = defiOhlcvChartWorkflowReminder('hyperliquid', 'ctm_hyperliquid_fetch_ohlcv');
	assert.match(text, /prepare_chart_from_rows/);
	assert.match(text, /ctm_hyperliquid_fetch_ohlcv/);
});
