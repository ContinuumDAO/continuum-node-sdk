import type {SdkResult} from '../result.js';
import {
	DEFAULT_CHART_HEIGHT,
	type PrepareChartInput,
	type PrepareChartOutput,
} from './schemas.js';
import {expandChartOverlays} from './overlays.js';
import {buildPaneLayout} from './panes.js';
import {prepareChartCore, isChartV1Payload} from './prepare-core.js';

export {isChartV1Payload};

export function prepareChart(input: PrepareChartInput): SdkResult<PrepareChartOutput> {
	if (!input.overlays?.length) {
		return prepareChartCore(input);
	}

	const core = prepareChartCore({
		...input,
		overlays: undefined,
	});
	if (!core.ok) {
		return core;
	}

	const expanded = expandChartOverlays(core.data.chart.series, input.overlays);
	if (!expanded.ok) {
		return expanded;
	}

	const chartPayload = buildPaneLayout({
		...(input.title?.trim() ? {title: input.title.trim()} : {}),
		height: input.height ?? DEFAULT_CHART_HEIGHT,
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
