import type {SdkResult} from '../result.js';
import {
	DEFAULT_CHART_HEIGHT,
	type PrepareChartInput,
	type PrepareChartOutput,
} from './schemas.js';
import {
	ensureVolumeHistogramSeries,
	resolvePrepareChartOverlays,
} from './chart-defaults.js';
import {expandChartOverlays} from './overlays.js';
import {buildPaneLayout} from './panes.js';
import {prepareChartCore, isChartV1Payload} from './prepare-core.js';

export {isChartV1Payload};

export function prepareChart(input: PrepareChartInput): SdkResult<PrepareChartOutput> {
	const withVolume = ensureVolumeHistogramSeries(input);
	const overlays = resolvePrepareChartOverlays(withVolume);

	if (!overlays?.length) {
		return prepareChartCore(withVolume);
	}

	const core = prepareChartCore({
		...withVolume,
		overlays: undefined,
	});
	if (!core.ok) {
		return core;
	}

	const expanded = expandChartOverlays(core.data.chart.series, overlays);
	if (!expanded.ok) {
		return expanded;
	}

	const chartPayload = buildPaneLayout({
		...(withVolume.title?.trim() ? {title: withVolume.title.trim()} : {}),
		height: withVolume.height ?? DEFAULT_CHART_HEIGHT,
		series: expanded.data,
	});

	return {
		ok: true,
		data: {
			kind: core.data.kind,
			chart: chartPayload,
		},
	};
}
