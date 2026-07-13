import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	defiOhlcvAnalysisWorkflowReminder,
	defiOhlcvChartWorkflowReminder,
	defiOhlcvWorkflowReminder,
	defiProtocolFetchOhlcvToolName,
} from '../dist/mcp/defi/ohlcv-chart-workflow.js';

test('defiProtocolFetchOhlcvToolName finds hyperliquid fetch tool', () => {
	assert.equal(defiProtocolFetchOhlcvToolName('hyperliquid'), 'ctm_hyperliquid_fetch_ohlcv');
});

test('defiProtocolFetchOhlcvToolName finds gmx fetch tool', () => {
	assert.equal(defiProtocolFetchOhlcvToolName('gmx'), 'ctm_gmx_fetch_ohlcv');
});

test('defiProtocolFetchOhlcvToolName finds uniswap-v4 fetch tool', () => {
	assert.equal(defiProtocolFetchOhlcvToolName('uniswap-v4'), 'ctm_uniswap_v4_fetch_ohlcv');
});

test('defiProtocolFetchOhlcvToolName returns undefined for protocols without ohlcv', () => {
	assert.equal(defiProtocolFetchOhlcvToolName('aave-v4'), undefined);
});

test('defiOhlcvAnalysisWorkflowReminder routes to analyze_* not prepare_chart', () => {
	const text = defiOhlcvAnalysisWorkflowReminder('hyperliquid', 'ctm_hyperliquid_fetch_ohlcv');
	assert.match(text, /analyze_/);
	assert.match(text, /Do NOT call prepare_chart/);
});

test('defiOhlcvChartWorkflowReminder mentions prepare_chart_from_rows', () => {
	const text = defiOhlcvChartWorkflowReminder('hyperliquid', 'ctm_hyperliquid_fetch_ohlcv');
	assert.match(text, /prepare_chart_from_rows/);
	assert.match(text, /ctm_hyperliquid_fetch_ohlcv/);
});

test('defiOhlcvWorkflowReminder includes both analysis and chart lanes', () => {
	const text = defiOhlcvWorkflowReminder('hyperliquid', 'ctm_hyperliquid_fetch_ohlcv');
	assert.match(text, /Analysis-only/);
	assert.match(text, /Chart\/plot/);
});
