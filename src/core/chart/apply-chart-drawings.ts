import type {SdkResult} from '../result.js';
import {extractOhlcvBarsFromUnknown, parseJsonIfString} from './fetch-result.js';
import {extractLiveBindingFromFetchPayload} from './live/binding-extract.js';
import {validateOhlcvBarsFromToolResult} from './ohlcv-window.js';
import type {ChartLiveBinding} from './live/schemas.js';
import type {ChartOverlayInput} from './overlay-schemas.js';
import {prepareChart} from './prepare.js';
import type {ChartPrepareReplay, PrepareChartOutput} from './schemas.js';

const APPLY_DRAWINGS_MAX_POINTS = 400;

export type ApplyChartDrawingsInput = {
	title?: string;
	toolResult?: unknown;
	rows?: unknown[];
	prepareReplay?: ChartPrepareReplay;
	live?: ChartLiveBinding;
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

export function preprocessApplyChartDrawingsInput(raw: unknown): unknown {
	if (typeof raw !== 'object' || raw == null) {
		return raw;
	}
	const input = {...(raw as Record<string, unknown>)};
	if (input.toolResult != null) {
		input.toolResult = parseJsonIfString(input.toolResult);
	}
	if (input.prepareReplay != null) {
		input.prepareReplay = parseJsonIfString(input.prepareReplay);
	}
	if (input.live != null) {
		input.live = parseJsonIfString(input.live);
	}
	if (input.trendLines == null) {
		const calcTrendLines = (input.data as Record<string, unknown> | undefined)?.trendLines;
		if (Array.isArray(calcTrendLines)) {
			input.trendLines = calcTrendLines;
		}
	}
	return input;
}

function barsFromInput(input: ApplyChartDrawingsInput): Record<string, unknown>[] {
	const extractOptions = {maxPoints: APPLY_DRAWINGS_MAX_POINTS};
	if (input.rows?.length) {
		return input.rows as Record<string, unknown>[];
	}
	if (input.toolResult != null) {
		return (extractOhlcvBarsFromUnknown(input.toolResult, extractOptions) ??
			[]) as Record<string, unknown>[];
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
		const incomplete = input.trendLines.some(
			line =>
				!line.pointA ||
				!line.pointB ||
				!Number.isFinite(line.pointA.time) ||
				!Number.isFinite(line.pointB.time),
		);
		if (incomplete) {
			return out;
		}
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

function shouldSkipDefaultOverlays(
	baseReplay: ChartPrepareReplay,
	indicatorOverlays: ChartOverlayInput[],
): boolean {
	return (
		baseReplay.skipDefaultOverlays === true ||
		baseReplay.usedDefaultOverlays === true ||
		indicatorOverlays.length > 0
	);
}

function resolveLiveBinding(input: ApplyChartDrawingsInput): ChartLiveBinding | undefined {
	if (input.live) {
		return input.live;
	}
	if (input.toolResult != null) {
		return extractLiveBindingFromFetchPayload(input.toolResult, {
			maxPoints: APPLY_DRAWINGS_MAX_POINTS,
		});
	}
	return undefined;
}

/** Re-prepare chart with drawing overlays merged into prepareReplay. */
export function applyChartDrawings(
	input: ApplyChartDrawingsInput,
): SdkResult<PrepareChartOutput> {
	const bars = barsFromInput(input);
	if (!bars.length) {
		return {
			ok: false,
			reason:
				'Provide `rows` or `toolResult` with OHLCV bars to apply chart drawings. Use the same fetch JSON as the original chart — do not substitute analysis JSON or market snapshot.',
		};
	}

	if (input.toolResult != null) {
		const windowCheck = validateOhlcvBarsFromToolResult(bars, input.toolResult);
		if (!windowCheck.ok) {
			return windowCheck;
		}
	}

	const title = input.title?.trim() || 'Chart';
	const newDrawings = drawingOverlaysFromInput(input);
	if (
		input.trendLines?.length &&
		!newDrawings.some(o => o.type === 'trend_lines') &&
		!input.removeDrawings
	) {
		return {
			ok: false,
			reason:
				'`trendLines` entries must include `pointA` and `pointB` from `calculate_trend_lines`. `analyze_trend_structure` summaries cannot be drawn directly.',
		};
	}

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
	const skipDefaults = shouldSkipDefaultOverlays(baseReplay, indicatorOverlays);

	const chartResult = prepareChart({
		title,
		bars,
		...(mergedOverlays.length ? {overlays: mergedOverlays} : {}),
		options: {
			maxPoints: APPLY_DRAWINGS_MAX_POINTS,
			...(skipDefaults ? {skipDefaultOverlays: true} : {}),
		},
	});
	if (!chartResult.ok) {
		return chartResult;
	}

	const live = resolveLiveBinding(input);
	return {
		ok: true,
		data: {
			...chartResult.data,
			...(live ? {live} : {}),
		},
	};
}
