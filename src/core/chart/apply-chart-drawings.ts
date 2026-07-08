import type {SdkResult} from '../result.js';
import {preprocessOhlcvToolInput, missingOhlcvBarsReason} from './analysis/ohlcv-input.js';
import {extractOhlcvBarsFromUnknown, parseJsonIfString} from './fetch-result.js';
import {extractLiveBindingFromFetchPayload} from './live/binding-extract.js';
import {validateOhlcvBarsFromToolResult, sanitizeOhlcvBarRows, OHLCV_EXTRACT_MAX_BARS} from './ohlcv-window.js';
import {attachChartLoadMeta} from './chart-ohlcv-load-status.js';
import {runOhlcvIntegrityPipeline} from './ohlcv-integrity.js';
import type {ChartLiveBinding} from './live/schemas.js';
import type {ChartOverlayInput} from './overlay-schemas.js';
import {prepareChart} from './prepare.js';
import type {ChartPrepareReplay, PrepareChartOutput} from './schemas.js';
import {AGENT_CHART_DISPLAY_MAX_POINTS} from './schemas.js';

const APPLY_DRAWINGS_MAX_POINTS = AGENT_CHART_DISPLAY_MAX_POINTS;

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
		return preprocessOhlcvToolInput(raw);
	}
	const input = {...(preprocessOhlcvToolInput(raw) as Record<string, unknown>)};
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
	const extractOptions = {maxPoints: OHLCV_EXTRACT_MAX_BARS};
	const fromTool =
		input.toolResult != null
			? (extractOhlcvBarsFromUnknown(input.toolResult, extractOptions) ?? [])
			: [];
	const raw =
		(fromTool.length ? fromTool : null) ??
		(input.rows?.length ? input.rows : null) ??
		[];
	return sanitizeOhlcvBarRows(raw as Record<string, unknown>[]);
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
				missingOhlcvBarsReason(input) +
				' Use the same fetch JSON as the original chart — do not substitute analysis JSON or market snapshot.',
		};
	}

	if (input.toolResult != null) {
		const windowCheck = validateOhlcvBarsFromToolResult(bars, input.toolResult, input.title);
		if (!windowCheck.ok) {
			return windowCheck;
		}
	}

	const integrity = runOhlcvIntegrityPipeline(bars, {
		toolResult: input.toolResult,
		rows: input.rows,
	});
	if (!integrity.ok) {
		return integrity;
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
		data: attachChartLoadMeta(
			{
				...chartResult.data,
				...(live ? {live} : {}),
			},
			bars,
			{toolResult: input.toolResult, title: input.title, ohlcvFingerprint: integrity.data.fingerprint},
		),
	};
}
