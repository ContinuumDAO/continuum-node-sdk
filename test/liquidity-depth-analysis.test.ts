import assert from 'node:assert/strict';
import {test} from 'node:test';
import {listChartAnalysisOptions} from '../dist/core/chart/analysis/analysis-catalog.js';
import {analyzeLiquidityDepth} from '../dist/core/chart/analysis/liquidity-depth-analyze-tools.js';
import {slimAnalysisOutputForAgent} from '../dist/core/chart/analysis/analysis-agent-view.js';
import {prepareChart} from '../dist/core/chart/prepare.js';
import {
	averageDepthSamples,
	buildLiquidityDepthLevelMenu,
	ingestDepthSnapshot,
	normalizeBinanceDepth,
	normalizeCoinbaseProductBook,
	resetDepthSamplersForTests,
	snapshotToBins,
} from '../dist/core/chart/depth/index.js';

const sampleBars = Array.from({length: 20}, (_, i) => ({
	time: 1_700_000_000 + i * 3600,
	open: 100 + i,
	high: 101 + i,
	low: 99 + i,
	close: 100.5 + i,
}));

const binanceDepthFixture = {
	lastUpdateId: 98_097_543_530,
	bids: [
		['100.00', '5.5'],
		['99.90', '12.0'],
		['99.50', '40.0'],
		['99.00', '8.0'],
	],
	asks: [
		['100.10', '3.0'],
		['100.20', '9.0'],
		['100.80', '25.0'],
		['101.00', '4.0'],
	],
};

test('listChartAnalysisOptions includes liquidity_depth', () => {
	const catalog = listChartAnalysisOptions();
	const entry = catalog.analyses.find(a => a.id === 'liquidity_depth');
	assert.ok(entry);
	assert.equal(entry!.analyzeTool, 'analyze_liquidity_depth');
	assert.equal(entry!.relatedDrawing?.calculateTool, 'apply_liquidity_depth_drawings');
	assert.equal(entry!.optionalSkill, 'chart-analysis-liquidity-depth');
});

test('normalizeBinanceDepth maps tuple book to NormalizedDepthSnapshot', () => {
	const snap = normalizeBinanceDepth(binanceDepthFixture, {
		symbol: 'btcusdt',
		asOfMs: 1_700_000_000_000,
	});
	assert.ok(snap);
	assert.equal(snap!.exchangeId, 'binance');
	assert.equal(snap!.market, 'spot');
	assert.equal(snap!.symbol, 'BTCUSDT');
	assert.equal(snap!.bids[0]?.price, 100);
	assert.equal(snap!.asks[0]?.price, 100.1);
	assert.ok(snap!.mid != null);
	assert.equal(snap!.updateId, 98_097_543_530);
});

test('normalizeCoinbaseProductBook maps pricebook objects (future adapter)', () => {
	const snap = normalizeCoinbaseProductBook(
		{
			pricebook: {
				product_id: 'BTC-USD',
				bids: [{price: '100.00', size: '1.5'}],
				asks: [{price: '100.10', size: '2.0'}],
				time: '2026-07-31T16:47:23.695462Z',
			},
			mid_market: '100.05',
		},
		{},
	);
	assert.ok(snap);
	assert.equal(snap!.exchangeId, 'coinbase');
	assert.equal(snap!.symbol, 'BTC-USD');
	assert.equal(snap!.mid, 100.05);
});

test('averageDepthSamples and levelMenu rank walls', () => {
	resetDepthSamplersForTests();
	const snap = normalizeBinanceDepth(binanceDepthFixture, {
		symbol: 'BTCUSDT',
		asOfMs: Date.now(),
	});
	assert.ok(snap);
	const bins = snapshotToBins(snap!);
	assert.ok(bins.length > 0);
	const profile = averageDepthSamples(
		[
			{asOfMs: Date.now() - 10_000, bins, mid: snap!.mid},
			{asOfMs: Date.now(), bins, mid: snap!.mid},
		],
		{exchangeId: 'binance', symbol: 'BTCUSDT', windowSec: 300},
	);
	assert.ok(profile);
	const menu = buildLiquidityDepthLevelMenu(profile!, {levelCount: 4});
	assert.ok(menu.length > 0);
	assert.ok(menu.every(m => m.side === 'bid' || m.side === 'ask'));
	assert.ok(menu.every(m => m.relativeStrength >= 0 && m.relativeStrength <= 1));
});

test('analyzeLiquidityDepth with ingested snapshots (skipSampler)', async () => {
	resetDepthSamplersForTests();
	const now = Date.now();
	for (let i = 0; i < 6; i++) {
		const snap = normalizeBinanceDepth(binanceDepthFixture, {
			symbol: 'BTCUSDT',
			asOfMs: now - (5 - i) * 12_000,
		});
		assert.ok(snap);
		ingestDepthSnapshot({exchangeId: 'binance', symbol: 'BTCUSDT'}, snap!);
	}

	const result = await analyzeLiquidityDepth({
		title: 'BTCUSDT 1H',
		rows: sampleBars,
		symbol: 'BTCUSDT',
		allowRowsOnly: true,
		mergeLive: false,
		skipSampler: true,
		depthLevelCount: 6,
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	assert.equal(result.data.analysis.market, 'spot');
	assert.equal(result.data.analysis.exchangeId, 'binance');
	assert.equal(result.data.analysis.symbol, 'BTCUSDT');
	assert.ok(result.data.analysis.levelMenu.length > 0);
	assert.ok(result.data.analysis.profileBins.length > 0);
	assert.equal(result.data.analysis.warmingUp, false);

	const slim = slimAnalysisOutputForAgent(result.data);
	const analysis = slim.analysis as Record<string, unknown>;
	assert.ok(Array.isArray(analysis.levelMenu));
	assert.equal(analysis.profileBins, undefined);
	assert.ok(typeof analysis.profileBinCount === 'number');
	assert.match(String(analysis.levelPresentationHint ?? ''), /Not a Trade Idea/i);

	resetDepthSamplersForTests();
});

test('prepareChart attaches liquidityDepthProfile without expanding bins to series', () => {
	const prepared = prepareChart({
		title: 'Depth overlay',
		bars: sampleBars,
		overlays: [
			{
				type: 'liquidity_depth_profile',
				placement: 'left',
				exchangeId: 'binance',
				symbol: 'BTCUSDT',
				windowSec: 300,
				sampleCount: 6,
				bins: [
					{
						priceLo: 99.5,
						priceHi: 99.55,
						bidSize: 40,
						askSize: 0,
						totalSize: 40,
					},
					{
						priceLo: 100.8,
						priceHi: 100.85,
						bidSize: 0,
						askSize: 25,
						totalSize: 25,
					},
				],
			},
		],
		options: {skipDefaultOverlays: true},
	});
	assert.equal(prepared.ok, true);
	if (!prepared.ok) {
		return;
	}
	assert.ok(prepared.data.chart.liquidityDepthProfile);
	assert.equal(prepared.data.chart.liquidityDepthProfile!.type, 'liquidity_depth_profile');
	assert.equal(prepared.data.chart.liquidityDepthProfile!.bins.length, 2);
	assert.ok(!prepared.data.chart.series.some(s => s.id.includes('depth')));
});
