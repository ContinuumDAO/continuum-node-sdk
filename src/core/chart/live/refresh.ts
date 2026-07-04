import {prepareChart} from '../prepare.js';
import {applyPrepareReplayToInput} from '../prepare-replay.js';
import type {ChartLiveBinding, ChartLiveTick} from './schemas.js';
import {candlestickBarsFromChart, mergeLiveTickIntoBars} from './merge-tick.js';
import type {ChartPrepareReplay, ChartV1Payload, PrepareChartOutput} from '../schemas.js';

export type RefreshChartFromLiveTickResult = {
	chart: ChartV1Payload;
	barRolledOver: boolean;
	prepareReplay?: ChartPrepareReplay;
};

function primaryCandlestick(
	chart: ChartV1Payload,
): {id: string; label: string} | null {
	const candle = chart.series.find(s => s.type === 'candlestick');
	if (!candle) {
		return null;
	}
	return {id: candle.id, label: candle.label};
}

/**
 * Apply a live tick to an existing chart payload and rebuild series via prepareChart
 * (same overlay/pane rules as the initial static chart).
 */
export function refreshChartFromLiveTick(
	chart: ChartV1Payload,
	tick: ChartLiveTick,
	binding: ChartLiveBinding,
	prepareReplay?: ChartPrepareReplay,
): RefreshChartFromLiveTickResult | null {
	const meta = primaryCandlestick(chart);
	if (!meta) {
		return null;
	}

	const bars = candlestickBarsFromChart(chart.series);
	const {bars: merged, barRolledOver} = mergeLiveTickIntoBars(bars, tick, {
		bucketSec: binding.bucketSec,
		...(binding.maxPoints != null ? {maxPoints: binding.maxPoints} : {}),
	});

	const baseInput = {
		...(chart.title?.trim() ? {title: chart.title.trim()} : {}),
		...(chart.height != null ? {height: chart.height} : {}),
		series: [
			{
				id: meta.id,
				type: 'candlestick' as const,
				label: meta.label,
				data: merged,
			},
		],
		options: {
			maxPoints: binding.maxPoints,
		},
	};

	const prepared = prepareChart(applyPrepareReplayToInput(baseInput, prepareReplay));

	if (!prepared.ok) {
		return null;
	}

	return {
		chart: prepared.data.chart,
		barRolledOver,
		prepareReplay: prepared.data.prepareReplay ?? prepareReplay,
	};
}

export type {PrepareChartOutput};
