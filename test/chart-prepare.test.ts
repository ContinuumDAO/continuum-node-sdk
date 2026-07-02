import assert from 'node:assert/strict';
import {test} from 'node:test';
import {prepareChart, isChartV1Payload} from '../dist/core/chart/prepare.js';
import {CHART_V1_KIND} from '../dist/core/chart/schemas.js';

test('prepareChart builds candlestick + line overlay envelope', () => {
	const result = prepareChart({
		title: 'BTC + SMA',
		series: [
			{
				id: 'btc',
				type: 'candlestick',
				label: 'BTC',
				data: [
					{time: 1_700_000_000, open: 100, high: 110, low: 90, close: 105},
					{time: 1_700_086_400, open: 105, high: 115, low: 100, close: 110},
				],
			},
			{
				id: 'sma',
				type: 'line',
				label: 'SMA(2)',
				overlay: true,
				data: [
					{time: 1_700_000_000, value: 102},
					{time: 1_700_086_400, value: 107},
				],
			},
		],
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	assert.equal(result.data.kind, CHART_V1_KIND);
	assert.equal(result.data.chart.title, 'BTC + SMA');
	assert.equal(result.data.chart.series.length, 2);
	assert.equal(result.data.chart.series[0]!.type, 'candlestick');
	assert.equal(result.data.chart.series[1]!.overlay, true);
	assert.ok(isChartV1Payload(result.data));
});

test('prepareChart accepts YYYY-MM-DD and dedupes by time', () => {
	const result = prepareChart({
		series: [
			{
				id: 'close',
				type: 'line',
				label: 'Close',
				data: [
					{time: '2026-01-01', value: 10},
					{time: '2026-01-01', value: 12},
					{time: '2026-01-02', value: 11},
				],
			},
		],
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	const data = result.data.chart.series[0]!.data;
	assert.equal(data.length, 2);
	assert.deepEqual(data[0]!.time, {year: 2026, month: 1, day: 1});
	assert.equal(data[0]!.value, 12);
});

test('prepareChart rejects empty series data', () => {
	const result = prepareChart({
		series: [
			{
				id: 'bad',
				type: 'line',
				label: 'Bad',
				data: [{time: 'not-a-date', value: 1}],
			},
		],
	});
	assert.equal(result.ok, false);
	if (result.ok) {
		return;
	}
	assert.match(result.reason, /Series "bad"/);
});

test('prepareChart trims to maxPoints keeping newest', () => {
	const rows = Array.from({length: 10}, (_, i) => ({
		time: 1_700_000_000 + i * 86_400,
		value: i,
	}));
	const result = prepareChart({
		series: [{id: 'x', type: 'line', label: 'X', data: rows}],
		options: {maxPoints: 3},
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	const data = result.data.chart.series[0]!.data;
	assert.equal(data.length, 3);
	assert.equal(data[0]!.value, 7);
	assert.equal(data[2]!.value, 9);
});

test('prepareChart tags histogram direction from candlesticks at same bar time', () => {
	const result = prepareChart({
		series: [
			{
				id: 'price',
				type: 'candlestick',
				label: 'BTC',
				data: [
					{time: 1_700_000_000, open: 100, high: 110, low: 90, close: 105},
					{time: 1_700_003_600, open: 105, high: 106, low: 98, close: 101},
				],
			},
			{
				id: 'vol',
				type: 'histogram',
				label: 'Volume',
				data: [
					{time: 1_700_000_000, value: 500},
					{time: 1_700_003_600, value: 420},
				],
			},
		],
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	const vol = result.data.chart.series.find(s => s.id === 'vol');
	assert.ok(vol);
	assert.equal(vol!.data[0]!.direction, 'up');
	assert.equal(vol!.data[1]!.direction, 'down');
});

test('prepareChart respects explicit histogram color over auto direction', () => {
	const result = prepareChart({
		series: [
			{
				id: 'price',
				type: 'candlestick',
				label: 'BTC',
				data: [{time: 1_700_000_000, open: 100, high: 110, low: 90, close: 105}],
			},
			{
				id: 'vol',
				type: 'histogram',
				label: 'Volume',
				data: [{time: 1_700_000_000, value: 500, color: '#336699'}],
			},
		],
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	const bar = result.data.chart.series.find(s => s.id === 'vol')!.data[0]!;
	assert.equal(bar.color, '#336699');
	assert.equal(bar.direction, undefined);
});

test('prepareChart skips volume direction when colorVolumeFromCandles is false', () => {
	const result = prepareChart({
		series: [
			{
				id: 'price',
				type: 'candlestick',
				label: 'BTC',
				data: [{time: 1_700_000_000, open: 100, high: 110, low: 90, close: 105}],
			},
			{
				id: 'vol',
				type: 'histogram',
				label: 'Volume',
				data: [{time: 1_700_000_000, value: 500}],
			},
		],
		options: {colorVolumeFromCandles: false},
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	const bar = result.data.chart.series.find(s => s.id === 'vol')!.data[0]!;
	assert.equal(bar.direction, undefined);
});

function candleSeries(id = 'btc', barCount = 10) {
	const closes = Array.from({ length: barCount }, (_, i) => 100 + i * 0.5 + Math.sin(i / 2));
	return {
		id,
		type: 'candlestick' as const,
		label: 'BTC',
		data: closes.map((close, i) => ({
			time: 1_700_000_000 + i * 3600,
			open: close - 0.5,
			high: close + 1,
			low: close - 1,
			close,
		})),
	};
}

test('prepareChart expands sma overlay from candlestick source', () => {
	const result = prepareChart({
		series: [candleSeries()],
		overlays: [{type: 'sma', sourceSeriesId: 'btc', period: 3}],
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	const sma = result.data.chart.series.find(s => s.id === 'sma3_btc');
	assert.ok(sma);
	assert.equal(sma!.type, 'line');
	assert.ok(sma!.data.length > 0);
});

test('prepareChart expands bollinger overlay to three lines', () => {
	const result = prepareChart({
		series: [candleSeries()],
		overlays: [{type: 'bollinger', sourceSeriesId: 'btc', period: 3, stdDev: 2}],
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	assert.ok(result.data.chart.series.some(s => s.id.endsWith('_upper')));
	assert.ok(result.data.chart.series.some(s => s.id.endsWith('_middle')));
	assert.ok(result.data.chart.series.some(s => s.id.endsWith('_lower')));
});

test('prepareChart expands fibonacci overlay with level subset', () => {
	const result = prepareChart({
		series: [candleSeries()],
		overlays: [
			{
				type: 'fibonacci',
				sourceSeriesId: 'btc',
				trend: 'up',
				levels: [0, 0.618, 1],
			},
		],
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	const fibSeries = result.data.chart.series.filter(s => s.label.startsWith('Fib '));
	assert.equal(fibSeries.length, 3);
	for (const s of fibSeries) {
		assert.equal(s.data.length, 2);
		assert.equal(s.data[0]!.value, s.data[1]!.value);
	}
});

test('prepareChart expands ema overlay', () => {
	const result = prepareChart({
		series: [candleSeries()],
		overlays: [{type: 'ema', sourceSeriesId: 'btc', period: 3, label: 'EMA(3)'}],
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	const ema = result.data.chart.series.find(s => s.label === 'EMA(3)');
	assert.ok(ema);
});

test('prepareChart expands rsi overlay into oscillator pane', () => {
	const result = prepareChart({
		series: [candleSeries('btc', 30)],
		overlays: [{type: 'rsi', sourceSeriesId: 'btc', period: 14}],
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	assert.ok(result.data.chart.panes && result.data.chart.panes.length >= 2);
	const rsi = result.data.chart.series.find(s => s.id.startsWith('rsi'));
	assert.ok(rsi);
	assert.ok(rsi!.paneId?.startsWith('osc_'));
});

test('prepareChart expands macd overlay into separate pane with histogram', () => {
	const result = prepareChart({
		series: [candleSeries('btc', 40)],
		overlays: [{type: 'macd', sourceSeriesId: 'btc'}],
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	const macdSeries = result.data.chart.series.filter(s => s.paneId?.startsWith('osc_'));
	assert.ok(macdSeries.length >= 2);
	assert.ok(macdSeries.some(s => s.type === 'histogram'));
});

test('prepareChart expands stochastic rsi overlay into oscillator pane', () => {
	const result = prepareChart({
		series: [candleSeries('btc', 45)],
		overlays: [{type: 'stochasticrsi', sourceSeriesId: 'btc'}],
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	const stoch = result.data.chart.series.filter(s => s.label.includes('Stoch RSI'));
	assert.ok(stoch.length >= 2);
	assert.ok(stoch.every(s => s.paneId?.startsWith('osc_')));
});

test('prepareChart applies default EMA(50) and RSI(14) on candlestick when overlays omitted', () => {
	const result = prepareChart({
		series: [candleSeries('btc', 60)],
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	assert.ok(result.data.chart.series.some(s => s.label === 'EMA(50)'));
	assert.ok(result.data.chart.series.some(s => s.id.startsWith('rsi')));
	assert.ok(result.data.chart.panes && result.data.chart.panes.length >= 2);
});

test('prepareChart skipDefaultOverlays omits default indicators', () => {
	const result = prepareChart({
		series: [candleSeries('btc', 60)],
		options: {skipDefaultOverlays: true},
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	assert.equal(result.data.chart.series.length, 1);
	assert.equal(result.data.chart.series[0]!.type, 'candlestick');
});

test('prepareChart promotes volume field on candles into histogram series', () => {
	const result = prepareChart({
		series: [
			{
				id: 'btc',
				type: 'candlestick',
				label: 'BTC',
				data: [
					{
						time: 1_700_000_000,
						open: 100,
						high: 110,
						low: 90,
						close: 105,
						volume: 1200,
					},
					{
						time: 1_700_003_600,
						open: 105,
						high: 106,
						low: 98,
						close: 101,
						volume: 980,
					},
				],
			},
		],
		options: {skipDefaultOverlays: true},
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	const vol = result.data.chart.series.find(s => s.id === 'volume');
	assert.ok(vol);
	assert.equal(vol!.type, 'histogram');
	assert.equal(vol!.data.length, 2);
});

test('prepareChart explicit overlays replace defaults', () => {
	const result = prepareChart({
		series: [candleSeries('btc', 60)],
		overlays: [{type: 'sma', sourceSeriesId: 'btc', period: 10}],
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	assert.ok(result.data.chart.series.some(s => s.id === 'sma10_btc'));
	assert.equal(result.data.chart.series.some(s => s.label === 'EMA(50)'), false);
});
