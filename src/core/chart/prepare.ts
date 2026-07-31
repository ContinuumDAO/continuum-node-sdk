import type {SdkResult} from '../result.js';
import {z} from 'zod';
import {
	DEFAULT_CHART_HEIGHT,
	PrepareChartInputSchema,
	type PrepareChartOutput,
} from './schemas.js';
import {
	defaultOverlayChartWarnings,
	ensureVolumeHistogramSeries,
	resolvePrepareChartOverlays,
} from './chart-defaults.js';
import {expandChartOverlays} from './overlays.js';
import {buildPaneLayout} from './panes.js';
import {prepareChartCore, isChartV1Payload} from './prepare-core.js';
import {buildPrepareReplay} from './prepare-replay.js';
import {
	chartPayloadWithTradePosition,
} from './trade-position-replay.js';
import {
	chartPayloadWithLiquidityDepthProfile,
} from './liquidity-depth-profile-replay.js';

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
	const prepareReplay = buildPrepareReplay(withVolume);
	const overlayWarnings = defaultOverlayChartWarnings(withVolume.series);
	const indicatorOverlays = resolvePrepareChartOverlays(withVolume);
	const drawingOverlays = withVolume.drawings ?? [];
	const allOverlays =
		withVolume.overlays !== undefined
			? [...withVolume.overlays, ...drawingOverlays]
			: indicatorOverlays || drawingOverlays.length
				? [...(indicatorOverlays ?? []), ...drawingOverlays]
				: undefined;
	const toExpand = allOverlays?.filter(
		o => o.type !== 'trade_position' && o.type !== 'liquidity_depth_profile',
	);

	if (!toExpand?.length) {
		const core = prepareChartCore(withVolume);
		if (!core.ok) {
			return core;
		}
		const chartWithTrade = chartPayloadWithTradePosition(core.data.chart, allOverlays);
		const chartWithDepth = chartPayloadWithLiquidityDepthProfile(chartWithTrade, allOverlays);
		return {
			ok: true,
			data: {
				...core.data,
				chart: chartWithDepth,
				...(prepareReplay ? {prepareReplay} : {}),
				...(overlayWarnings.length > 0 ? {meta: {warnings: overlayWarnings}} : {}),
			},
		};
	}

	const core = prepareChartCore({
		...withVolume,
		overlays: undefined,
		drawings: undefined,
	});
	if (!core.ok) {
		return core;
	}

	const expanded = expandChartOverlays(core.data.chart.series, toExpand);
	if (!expanded.ok) {
		return expanded;
	}

	const chartPayload = buildPaneLayout({
		...(withVolume.title?.trim() ? {title: withVolume.title.trim()} : {}),
		height: withVolume.height ?? DEFAULT_CHART_HEIGHT,
		series: expanded.data,
	});
	const chartWithTrade = chartPayloadWithTradePosition(chartPayload, allOverlays);
	const chartWithDepth = chartPayloadWithLiquidityDepthProfile(chartWithTrade, allOverlays);

	return {
		ok: true,
		data: {
			kind: core.data.kind,
			chart: chartWithDepth,
			...(prepareReplay ? {prepareReplay} : {}),
			...(overlayWarnings.length > 0 ? {meta: {warnings: overlayWarnings}} : {}),
		},
	};
}
