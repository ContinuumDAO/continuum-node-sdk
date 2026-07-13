import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
	chartDataSourceShortCodeFromFetchToolName,
	chartDataSourceShortCodeFromFetchPayload,
	extractChartDataPurposeContext,
	formatChartDataPurposeTokens,
} from '../dist/core/chart/analysis/trade-setups/chart-data-purpose.js';
import {formatTradePurposeMetaCtm1} from '../dist/core/chart/analysis/trade-setups/trade-purpose-format.js';

describe('chart-data-purpose', () => {
	it('infers hl from hyperliquid fetch tool', () => {
		assert.equal(
			chartDataSourceShortCodeFromFetchToolName('ctm_hyperliquid__fetch_ohlcv'),
			'hl',
		);
	});

	it('infers cg from coingecko execute', () => {
		assert.equal(chartDataSourceShortCodeFromFetchToolName('coingecko__execute'), 'cg');
	});

	it('extracts interval and bar count from meta and fetch', () => {
		const ctx = extractChartDataPurposeContext({
			analysisMeta: {
				barCount: 180,
				fetchContext: {interval: '4h', coin: 'ETH'},
			},
			fetchPayload: {
				dataSource: 'protocol_ohlcv',
				ohlcv: {coin: 'ETH', interval: '4h', candles: new Array(180).fill({})},
			},
			fetchToolName: 'ctm_hyperliquid__fetch_ohlcv',
		});
		assert.deepEqual(ctx, {dataSource: 'hl', interval: '4h', barCount: 180});
	});

	it('formats ds iv n tokens', () => {
		assert.deepEqual(
			formatChartDataPurposeTokens({dataSource: 'cg', interval: '1h', barCount: 90}),
			['ds=cg', 'iv=1h', 'n=90'],
		);
	});

	it('formatTradePurposeMetaCtm1 includes chart data tokens before symbol', () => {
		const {meta} = formatTradePurposeMetaCtm1({
			protocol: 'hyperliquid',
			side: 'long',
			setup: 'trend-ret',
			entryEffective: 2950,
			patternFailureEffective: 2772,
			symbolShort: 'ETH',
			chartData: {dataSource: 'hl', interval: '4h', barCount: 180},
		});
		assert.match(meta, /ds=hl\|iv=4h\|n=180\|ETH$/);
	});
});
