import {
	DEFAULT_CHART_EMA_PERIOD,
	DEFAULT_CHART_RSI_PERIOD,
} from './chart-defaults.js';
import type {ChartOverlayInput} from './overlay-schemas.js';

export type ChartCustomizationCatalog = {
	indicators: Array<{
		type: string;
		label: string;
		pane: 'main' | 'oscillator';
		params: Array<{name: string; default?: number | string}>;
	}>;
	drawings: Array<{
		id: string;
		label: string;
		calculateTool: string;
		applyField: string;
	}>;
	removeActions: string[];
	currentDefaults: {emaPeriod: number; rsiPeriod: number};
	exampleUserPhrases: string[];
};

export function listChartCustomizationOptions(): ChartCustomizationCatalog {
	return {
		indicators: [
			{type: 'sma', label: 'Simple moving average', pane: 'main', params: [{name: 'period', default: 20}]},
			{type: 'ema', label: 'Exponential moving average', pane: 'main', params: [{name: 'period', default: 20}]},
			{
				type: 'bollinger',
				label: 'Bollinger bands',
				pane: 'main',
				params: [
					{name: 'period', default: 20},
					{name: 'stdDev', default: 2},
				],
			},
			{type: 'fibonacci', label: 'Fibonacci retracements', pane: 'main', params: [{name: 'range or sourceSeriesId'}]},
			{type: 'rsi', label: 'RSI', pane: 'oscillator', params: [{name: 'period', default: 14}]},
			{type: 'macd', label: 'MACD', pane: 'oscillator', params: []},
			{type: 'stochasticrsi', label: 'Stochastic RSI', pane: 'oscillator', params: []},
		],
		drawings: [
			{
				id: 'key_levels',
				label: 'Key support/resistance (swing levels)',
				calculateTool: 'calculate_key_levels',
				applyField: 'horizontalLevels',
			},
			{
				id: 'pivot_points',
				label: 'Pivot points (PP, R1, S1, …)',
				calculateTool: 'calculate_pivot_points',
				applyField: 'pivotLevels',
			},
			{
				id: 'fibonacci',
				label: 'Fibonacci retracements (61.8% highlighted)',
				calculateTool: 'calculate_fibonacci_range',
				applyField: 'fibonacci',
			},
			{
				id: 'trend_lines',
				label: 'Trend lines (swing support/resistance diagonals)',
				calculateTool: 'calculate_trend_lines',
				applyField: 'trendLines',
			},
		],
		removeActions: [
			'Remove all indicators (candles + volume only)',
			'Remove drawing overlays (levels, pivots, Fibonacci lines)',
			'Replace indicator set (pass full overlays array to prepare_chart)',
		],
		currentDefaults: {
			emaPeriod: DEFAULT_CHART_EMA_PERIOD,
			rsiPeriod: DEFAULT_CHART_RSI_PERIOD,
		},
		exampleUserPhrases: [
			'what can I do to this chart',
			'chart options',
			'what indicators can you add',
			'help with the chart',
			'add pivot points',
			'draw fibonacci',
			'show trend lines on the chart',
			'draw support and resistance',
		],
	};
}

export type ChartDrawingInput = Extract<
	ChartOverlayInput,
	{type: 'horizontal_levels' | 'pivot_levels' | 'fibonacci' | 'trend_lines'}
>;
