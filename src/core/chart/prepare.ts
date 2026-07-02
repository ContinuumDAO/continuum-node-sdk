import type {SdkResult} from '../result.js';
import {z} from 'zod';
import {
	DEFAULT_CHART_HEIGHT,
	PrepareChartInputSchema,
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

function formatPrepareChartValidationError(error: z.ZodError): string {
	return error.issues
		.map(issue => {
			const path = issue.path.length ? issue.path.join('.') : 'input';
			return `${path}: ${issue.message}`;
		})
		.join('; ');
}

export function prepareChart(input: unknown): SdkResult<PrepareChartOutput> {
	const parsed = PrepareChartInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: formatPrepareChartValidationError(parsed.error)};
	}

	const withVolume = ensureVolumeHistogramSeries(parsed.data);
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
