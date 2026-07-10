import {z} from 'zod';
import type {SdkResult} from '../../result.js';
import {extractLiveBindingFromFetchPayload} from '../live/binding-extract.js';
import {validateOhlcvBarsFromToolResult} from '../ohlcv-window.js';
import {attachChartLoadMeta} from '../chart-ohlcv-load-status.js';
import {runOhlcvIntegrityPipeline, rejectApplyPatternDrawingsWithoutChartContext} from '../ohlcv-integrity.js';
import type {ChartLiveBinding} from '../live/schemas.js';
import type {ChartOverlayInput} from '../overlay-schemas.js';
import {prepareChart} from '../prepare.js';
import type {ChartPrepareReplay, PrepareChartOutput} from '../schemas.js';
import {AGENT_CHART_DISPLAY_MAX_POINTS} from '../schemas.js';
import {prepareOhlcvBarsForAnalysis} from './ohlcv-live-merge.js';
import {barsFromOhlcvToolInput, missingOhlcvBarsReason, preprocessOhlcvToolInput} from './ohlcv-input.js';
import type {TrendLine} from '../levels/trend-lines.js';
import {
	buildTrendLineMenu,
	pickTrendLineByNumber,
	trendLineMenuLabel,
} from './trend-line-menu-summary.js';

const trendLinePointSchema = z
	.object({
		time: z.number(),
		price: z.number(),
	})
	.strict();

const drawableTrendLineSchema = z
	.object({
		kind: z.enum(['support', 'resistance']),
		pointA: trendLinePointSchema,
		pointB: trendLinePointSchema,
		slope: z.number(),
		touchCount: z.number(),
		score: z.number(),
	})
	.strict();

const trendStructureAnalysisPickSchema = z
	.object({
		drawableTrendLines: z.array(drawableTrendLineSchema).optional(),
		trendLineMenu: z.array(z.object({}).passthrough()).optional(),
	})
	.passthrough();

function parseJsonObject(value: unknown): unknown {
	if (typeof value !== 'string') {
		return value;
	}
	const trimmed = value.trim();
	if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
		return value;
	}
	try {
		return JSON.parse(trimmed);
	} catch {
		return value;
	}
}

function normalizeAnalysisInput(analysis: unknown): unknown {
	const parsed = parseJsonObject(analysis);
	if (typeof parsed !== 'object' || parsed == null) {
		return parsed;
	}
	const record = parsed as Record<string, unknown>;
	if (record.drawableTrendLines == null && typeof record.analysis === 'object' && record.analysis != null) {
		return record.analysis;
	}
	return parsed;
}

function preprocessApplyTrendLineDrawingsInput(raw: unknown): unknown {
	const base = preprocessOhlcvToolInput(raw);
	if (typeof base !== 'object' || base == null) {
		return base;
	}
	const input = {...(base as Record<string, unknown>)};
	if (input.analysis != null) {
		input.analysis = normalizeAnalysisInput(input.analysis);
	}
	return input;
}

export const ApplyTrendLineDrawingsInputSchema = z.preprocess(
	preprocessApplyTrendLineDrawingsInput,
	z
		.object({
			title: z.string().trim().min(1).max(256).optional(),
			label: z.string().trim().min(1).max(128).optional(),
			toolResult: z.unknown().optional(),
			rows: z.array(z.unknown()).min(1).optional(),
			prepareReplay: z.unknown().optional(),
			live: z.unknown().optional(),
			trendLineNumber: z.number().int().min(1).max(64).optional(),
			removeTrendLine: z.boolean().optional(),
			removeAllTrendLines: z.boolean().optional(),
			analysis: trendStructureAnalysisPickSchema.optional(),
			trendLine: drawableTrendLineSchema.optional(),
		})
		.strict(),
);

export function trendLineLabelForNumber(trendLineNumber: number, kind: 'support' | 'resistance'): string {
	return trendLineMenuLabel(
		{
			kind,
			pointA: {time: 0, price: 0},
			pointB: {time: 0, price: 0},
			slope: 0,
			touchCount: 0,
			score: 0,
		},
		trendLineNumber,
	);
}

function resolveTrendLineForApply(input: {
	trendLineNumber?: number;
	trendLine?: TrendLine;
	analysis?: {drawableTrendLines?: TrendLine[]};
}): TrendLine | undefined {
	if (input.trendLine) {
		return input.trendLine;
	}
	const lines = input.analysis?.drawableTrendLines;
	if (!lines?.length || input.trendLineNumber == null) {
		return undefined;
	}
	return pickTrendLineByNumber(lines, input.trendLineNumber);
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

function mergeTrendLinesOverlay(
	existingLines: Array<{
		kind: 'support' | 'resistance';
		pointA: {time: number; price: number};
		pointB: {time: number; price: number};
		label?: string;
	}>,
	line: TrendLine,
	trendLineNumber: number,
): Array<{
	kind: 'support' | 'resistance';
	pointA: {time: number; price: number};
	pointB: {time: number; price: number};
	label?: string;
}> {
	const label = trendLineMenuLabel(line, trendLineNumber);
	const without = existingLines.filter(row => row.label !== label);
	return [
		...without,
		{
			kind: line.kind,
			pointA: line.pointA,
			pointB: line.pointB,
			label,
		},
	].slice(-8);
}

function existingTrendLineRows(replay: ChartPrepareReplay): Array<{
	kind: 'support' | 'resistance';
	pointA: {time: number; price: number};
	pointB: {time: number; price: number};
	label?: string;
}> {
	const overlay = replay.overlays?.find(o => o.type === 'trend_lines');
	if (!overlay || overlay.type !== 'trend_lines') {
		return [];
	}
	return overlay.lines.map(line => ({
		kind: line.kind ?? 'support',
		pointA: {time: line.pointA.time as number, price: line.pointA.price},
		pointB: {time: line.pointB.time as number, price: line.pointB.price},
		...(line.label ? {label: line.label} : {}),
	}));
}

export async function applyTrendLineDrawings(
	input: unknown,
): Promise<SdkResult<PrepareChartOutput>> {
	const parsed = ApplyTrendLineDrawingsInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.message};
	}

	const chartContext = rejectApplyPatternDrawingsWithoutChartContext(parsed.data);
	if (!chartContext.ok) {
		return chartContext;
	}

	const prepared = await prepareOhlcvBarsForAnalysis({
		...parsed.data,
		allowRowsOnly: Boolean(parsed.data.prepareReplay),
		mergeLive: false,
	});
	if (!prepared.ok) {
		return prepared;
	}
	const rawBars = prepared.data.bars;
	if (!rawBars.length) {
		return {
			ok: false,
			reason:
				missingOhlcvBarsReason(parsed.data) +
				' Use the same fetch JSON as the original chart — do not substitute analysis JSON or market snapshot.',
		};
	}

	if (parsed.data.toolResult != null) {
		const windowCheck = validateOhlcvBarsFromToolResult(
			rawBars,
			parsed.data.toolResult,
			parsed.data.title,
		);
		if (!windowCheck.ok) {
			return windowCheck;
		}
	}

	const integrity = runOhlcvIntegrityPipeline(rawBars, {
		toolResult: parsed.data.toolResult,
		rows: parsed.data.rows,
		allowRowsOnly: Boolean(parsed.data.prepareReplay),
	});
	if (!integrity.ok) {
		return integrity;
	}

	let baseReplay = (parsed.data.prepareReplay as ChartPrepareReplay | undefined) ?? {};
	if (parsed.data.removeAllTrendLines) {
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

	let trendLineRows = existingTrendLineRows(baseReplay);

	if (parsed.data.removeTrendLine && parsed.data.trendLineNumber != null) {
		const label = trendLineLabelForNumber(parsed.data.trendLineNumber, 'support');
		trendLineRows = trendLineRows.filter(
			row => row.label !== label && row.label !== trendLineLabelForNumber(parsed.data.trendLineNumber!, 'resistance'),
		);
		// Match either kind label
		const prefix = `Trend #${parsed.data.trendLineNumber} `;
		trendLineRows = trendLineRows.filter(row => !row.label?.startsWith(prefix));
	} else if (!parsed.data.removeAllTrendLines) {
		const line = resolveTrendLineForApply({
			trendLineNumber: parsed.data.trendLineNumber,
			trendLine: parsed.data.trendLine as TrendLine | undefined,
			analysis: parsed.data.analysis as {drawableTrendLines?: TrendLine[]} | undefined,
		});
		if (!line) {
			return {
				ok: false,
				reason:
					'No trend line to apply. Pass trendLineNumber from analyze_trend_structure trendLineMenu with bound analysis.drawableTrendLines.',
			};
		}
		const n = parsed.data.trendLineNumber ?? 1;
		trendLineRows = mergeTrendLinesOverlay(trendLineRows, line, n);
	}

	const mergedOverlays: ChartOverlayInput[] = [...indicatorOverlays];
	if (trendLineRows.length > 0) {
		mergedOverlays.push({
			type: 'trend_lines',
			lines: trendLineRows.map(row => ({
				kind: row.kind,
				pointA: row.pointA,
				pointB: row.pointB,
				...(row.label ? {label: row.label} : {}),
			})),
		});
	}

	const titleSuffix =
		parsed.data.removeAllTrendLines || parsed.data.removeTrendLine
			? undefined
			: parsed.data.trendLineNumber != null
				? `Trend #${parsed.data.trendLineNumber}`
				: undefined;
	const baseTitle = parsed.data.title?.trim() || 'Chart';
	const nextTitle =
		titleSuffix && !baseTitle.includes(titleSuffix) ? `${baseTitle} — ${titleSuffix}` : baseTitle;

	const skipDefaults =
		baseReplay.skipDefaultOverlays === true ||
		baseReplay.usedDefaultOverlays === true ||
		indicatorOverlays.length > 0;

	const chartResult = prepareChart({
		title: nextTitle,
		bars: rawBars,
		...(mergedOverlays.length ? {overlays: mergedOverlays} : {}),
		options: {
			maxPoints: AGENT_CHART_DISPLAY_MAX_POINTS,
			...(skipDefaults ? {skipDefaultOverlays: true} : {}),
		},
	});
	if (!chartResult.ok) {
		return chartResult;
	}

	const live: ChartLiveBinding | undefined =
		parsed.data.live != null
			? (parsed.data.live as ChartLiveBinding)
			: parsed.data.toolResult != null
				? extractLiveBindingFromFetchPayload(parsed.data.toolResult, {
						maxPoints: AGENT_CHART_DISPLAY_MAX_POINTS,
					})
				: undefined;

	return {
		ok: true,
		data: attachChartLoadMeta(
			{
				...chartResult.data,
				prepareReplay: {
					...baseReplay,
					overlays: mergedOverlays,
					...(skipDefaults ? {skipDefaultOverlays: true, usedDefaultOverlays: true} : {}),
				},
				...(live ? {live} : {}),
			},
			rawBars,
			{
				toolResult: parsed.data.toolResult,
				title: parsed.data.title ?? nextTitle,
				ohlcvFingerprint: integrity.data.fingerprint ?? prepared.data.fingerprint ?? undefined,
			},
		),
	};
}

export {buildTrendLineMenu};
