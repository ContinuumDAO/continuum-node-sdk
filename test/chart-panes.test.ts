import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildPaneLayout, MAIN_CHART_PANE_ID} from '../dist/core/chart/panes.js';

test('buildPaneLayout splits main, volume, and oscillator panes', () => {
	const chart = buildPaneLayout({
		height: 400,
		series: [
			{id: 'btc', type: 'candlestick', label: 'BTC', data: [{time: 1, open: 1, high: 2, low: 0.5, close: 1.5}]},
			{id: 'volume', type: 'histogram', label: 'Volume', data: [{time: 1, value: 100}]},
			{id: 'rsi14', type: 'line', label: 'RSI', data: [{time: 1, value: 55}], paneId: 'osc_rsi'},
		],
	});
	assert.ok(chart.panes);
	assert.deepEqual(
		chart.panes!.map(p => p.id),
		['main', 'volume', 'osc_rsi'],
	);
	const vol = chart.series.find(s => s.id === 'volume');
	assert.equal(vol?.paneId, 'volume');
	assert.equal(vol?.priceScaleId, 'right');
	const total = chart.panes!.reduce((s, p) => s + p.heightRatio, 0);
	assert.ok(Math.abs(total - 1) < 0.01);
});

test('buildPaneLayout splits main and oscillator panes', () => {
	const chart = buildPaneLayout({
		height: 400,
		series: [
			{id: 'btc', type: 'candlestick', label: 'BTC', data: [{time: 1, open: 1, high: 2, low: 0.5, close: 1.5}]},
			{id: 'rsi14', type: 'line', label: 'RSI', data: [{time: 1, value: 55}], paneId: 'osc_rsi'},
		],
	});
	assert.ok(chart.panes);
	assert.equal(chart.panes![0]!.id, MAIN_CHART_PANE_ID);
	assert.ok(chart.panes!.some((p) => p.id === 'osc_rsi'));
	const total = chart.panes!.reduce((s, p) => s + p.heightRatio, 0);
	assert.ok(Math.abs(total - 1) < 0.01);
});
