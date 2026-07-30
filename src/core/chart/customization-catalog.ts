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
		summary: string;
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
			{
				type: 'sma',
				label: 'Simple moving average',
				pane: 'main',
				params: [{name: 'period', default: 20}],
				summary: 'Simple moving average of close over a lookback period.',
			},
			{
				type: 'ema',
				label: 'Exponential moving average',
				pane: 'main',
				params: [{name: 'period', default: 20}],
				summary: 'Exponential moving average of close (more weight on recent bars).',
			},
			{
				type: 'bollinger',
				label: 'Bollinger bands',
				pane: 'main',
				params: [
					{name: 'period', default: 20},
					{name: 'stdDev', default: 2},
				],
				summary: 'SMA with upper/lower bands at ±N standard deviations.',
			},
			{
				type: 'donchian',
				label: 'Donchian channels',
				pane: 'main',
				params: [{name: 'period', default: 20}],
				summary: 'Highest high / lowest low channel over a lookback period.',
			},
			{
				type: 'supertrend',
				label: 'Supertrend',
				pane: 'main',
				params: [
					{name: 'period', default: 10},
					{name: 'multiplier', default: 3},
				],
				summary: 'ATR-based trend trail that flips with direction changes.',
			},
			{
				type: 'ichimoku',
				label: 'Ichimoku cloud',
				pane: 'main',
				params: [
					{name: 'conversionPeriod', default: 9},
					{name: 'basePeriod', default: 26},
					{name: 'spanPeriod', default: 52},
					{name: 'displacement', default: 26},
				],
				summary: 'Ichimoku cloud: Tenkan, Kijun, forward cloud, optional Chikou.',
			},
			{
				type: 'fibonacci',
				label: 'Fibonacci retracements',
				pane: 'main',
				params: [{name: 'range or sourceSeriesId'}],
				summary: 'Horizontal Fibonacci retracement levels between a swing high/low.',
			},
			{
				type: 'rsi',
				label: 'RSI',
				pane: 'oscillator',
				params: [{name: 'period', default: 14}],
				summary: 'Relative strength index (0–100 momentum oscillator).',
			},
			{
				type: 'zscore',
				label: 'Z-score',
				pane: 'oscillator',
				params: [
					{name: 'period', default: 20},
					{name: 'entryZ', default: 2},
					{name: 'exitZ', default: 0.5},
				],
				summary: 'Close distance from SMA in standard deviations (mean-reversion).',
			},
			{
				type: 'macd',
				label: 'MACD',
				pane: 'oscillator',
				params: [],
				summary: 'MACD line, signal line, and histogram from EMA spreads.',
			},
			{
				type: 'stochasticrsi',
				label: 'Stochastic RSI',
				pane: 'oscillator',
				params: [],
				summary: 'Stochastic oscillator applied to RSI (%K and %D).',
			},
			{
				type: 'obv',
				label: 'On-balance volume',
				pane: 'oscillator',
				params: [],
				summary: 'On-balance volume — cumulative volume by close direction.',
			},
			{
				type: 'ad',
				label: 'Accumulation/distribution',
				pane: 'oscillator',
				params: [],
				summary: 'Chaikin A/D line — cumulative volume-weighted close location in the bar.',
			},
			{
				type: 'adosc',
				label: 'Chaikin A/D oscillator',
				pane: 'oscillator',
				params: [
					{name: 'fastPeriod', default: 3},
					{name: 'slowPeriod', default: 10},
				],
				summary: 'Chaikin A/D oscillator — EMA(fast) − EMA(slow) of the A/D line.',
			},
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
			{
				id: 'chart_patterns',
				label: 'Classic chart pattern overlay (H&S, doubles, cup & handle, …)',
				calculateTool: 'calculate_chart_pattern_drawings',
				applyField: 'patternOverlay',
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
