import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	AGENT_CHART_DATA_FETCH_MONTH_NOT_ACTIVE,
	AGENT_CHART_DATA_FETCH_NO_PREFERRED_KEYGEN,
	agentChartDataFetchBlockedReason,
	isAgentChartDataFetchTool,
} from '../dist/core/agent/agent-chart-data-access.js';

test('isAgentChartDataFetchTool matches DeFi and CMC fetch tools', () => {
	assert.equal(isAgentChartDataFetchTool('ctm_hyperliquid_fetch_ohlcv'), true);
	assert.equal(isAgentChartDataFetchTool('coinmarketcap-public__get_kline_candles'), true);
	assert.equal(isAgentChartDataFetchTool('get_crypto_ohlcv_historical'), true);
	assert.equal(isAgentChartDataFetchTool('prepare_chart_from_rows'), false);
	assert.equal(isAgentChartDataFetchTool('analyze_trend_structure'), false);
});

test('agentChartDataFetchBlockedReason when preferred KeyGen missing', () => {
	assert.equal(
		agentChartDataFetchBlockedReason({preferredKeyGenId: '', status: null}),
		AGENT_CHART_DATA_FETCH_NO_PREFERRED_KEYGEN,
	);
});

test('agentChartDataFetchBlockedReason with status null only checks preferred KeyGen id', () => {
	assert.equal(
		agentChartDataFetchBlockedReason({
			preferredKeyGenId: 'KeyGen202606061714459993c372497',
			status: null,
		}),
		null,
	);
});

test('agentChartDataFetchBlockedReason when billing month inactive', () => {
	const reason = agentChartDataFetchBlockedReason({
		preferredKeyGenId: 'KeyGen202606061714459993c372497',
		status: {
			registered: true,
			fundedForCurrentMonth: false,
		},
	});
	assert.equal(reason, AGENT_CHART_DATA_FETCH_MONTH_NOT_ACTIVE);
});

test('agentChartDataFetchBlockedReason when billing month active', () => {
	assert.equal(
		agentChartDataFetchBlockedReason({
			preferredKeyGenId: 'KeyGen202606061714459993c372497',
			status: {
				registered: true,
				fundedForCurrentMonth: true,
			},
		}),
		null,
	);
});
