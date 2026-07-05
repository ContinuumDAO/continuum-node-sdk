import type {SdkResult} from '../result.js';
import {extractOhlcvBarsFromUnknown} from './fetch-result.js';
import {prepareChartFromRows} from './prepare-from-rows.js';
import {prepareChart} from './prepare.js';
import type {ChartOverlayInput} from './overlay-schemas.js';
import type {ChartPrepareReplay, PrepareChartOutput} from './schemas.js';

export type ApplyChartDrawingsInput = {
	title?: string;
	toolResult?: unknown;
	rows?: unknown[];
	prepareReplay?: ChartPrepareReplay;
	horizontalLevels?: Array<{price: number; label?: string; kind?: 'support' | 'resistance' | 'level'}>;
	pivotLevels?: Array<{id: string; price: number}>;
	fibonacci?: Extract<ChartOverlayInput, {type: 'fibonacci'}>;
	trendLines?: Array<{
		kind: 'support' | 'resistance';
		pointA: {time: number; price: number};
		pointB: {time: number; price: number};
		label?: string;
	}>;
	removeDrawings?: boolean;
};

function barsFromInput(input: ApplyChartDrawingsInput): Record<string, unknown>[] {
	if (input.rows?.length) {
		return input.rows as Record<string, unknown>[];
	}
	if (input.toolResult != null) {
		return (extractOhlcvBarsFromUnknown(input.toolResult) ?? []) as Record<string, unknown>[];
	}
	return [];
}

function drawingOverlaysFromInput(input: ApplyChartDrawingsInput): ChartOverlayInput[] {
	if (input.removeDrawings) {
		return [];
	}
	const out: ChartOverlayInput[] = [];
	if (input.horizontalLevels?.length) {
		out.push({type: 'horizontal_levels', levels: input.horizontalLevels});
	}
	if (input.pivotLevels?.length) {
		out.push({type: 'pivot_levels', levels: input.pivotLevels});
	}
	if (input.fibonacci) {
		out.push(input.fibonacci);
	}
	if (input.trendLines?.length) {
		out.push({
			type: 'trend_lines',
			lines: input.trendLines.map(line => ({
				kind: line.kind,
				pointA: line.pointA,
				pointB: line.pointB,
				...(line.label ? {label: line.label} : {}),
			})),
		});
	}
	return out;
}

function stripDrawingOverlays(replay: ChartPrepareReplay): ChartPrepareReplay {
	if (!replay.overlays?.length) {
		return replay;
	}
	const kept = replay.overlays.filter(
		o =>
			o.type !== 'horizontal_levels' &&
			o.type !== 'pivot_levels' &&
			o.type !== 'fibonacci' &&
			o.type !== 'trend_lines' &&
			o.type !== 'chart_pattern',
	);
	return {...replay, overlays: kept};
}

/** Re-prepare chart with drawing overlays merged into prepareReplay. */
export function applyChartDrawings(
	input: ApplyChartDrawingsInput,
): SdkResult<PrepareChartOutput> {
	const bars = barsFromInput(input);
	if (!bars.length) {
		return {
			ok: false,
			reason: 'Provide `rows` or `toolResult` with OHLCV bars to apply chart drawings.',
		};
	}

	const title = input.title?.trim() || 'Chart';
	const newDrawings = drawingOverlaysFromInput(input);
	let baseReplay = input.prepareReplay ?? {};

	if (input.removeDrawings) {
		baseReplay = stripDrawingOverlays(baseReplay);
	}

	const indicatorOverlays =
		baseReplay.overlays?.filter(
			o =>
				o.type !== 'horizontal_levels' &&
				o.type !== 'pivot_levels' &&
				o.type !== 'fibonacci' &&
				o.type !== 'trend_lines' &&
				o.type !== 'chart_pattern',
		) ?? [];

	const mergedOverlays = [...indicatorOverlays, ...newDrawings];

	if (input.toolResult != null) {
		const fromRows = prepareChartFromRows({
			title,
			toolResult: input.toolResult,
		});
		if (!fromRows.ok) {
			return fromRows;
		}
		if (!mergedOverlays.length && !baseReplay.skipDefaultOverlays) {
			return fromRows;
		}
		return prepareChart({
			title,
			bars,
			overlays: mergedOverlays.length ? mergedOverlays : [],
			...(baseReplay.skipDefaultOverlays ? {options: {skipDefaultOverlays: true}} : {}),
		});
	}

	return prepareChart({
		title,
		bars,
		...(mergedOverlays.length ? {overlays: mergedOverlays} : {}),
		...(baseReplay.skipDefaultOverlays ? {options: {skipDefaultOverlays: true}} : {}),
	});
}
