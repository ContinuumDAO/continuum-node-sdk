import {z} from 'zod';
import type {SdkResult} from '../../result.js';
import {
	chartPatternHitToHorizontalLevels,
	chartPatternHitToOverlay,
	chartPatternHitToTrendLines,
	filterChartPatternIds,
	maxChartPatternMinBars,
	normalizeHorizontalLevelKind,
	scanChartPatterns,
} from '../../chart-patterns/index.js';
import type {ChartPatternHit, ChartPatternId} from '../../chart-patterns/types.js';
import {extractOhlcvBarsFromUnknown} from '../fetch-result.js';
import type {ChartOverlayInput} from '../overlay-schemas.js';
import {prepareChart} from '../prepare.js';
import type {ChartPrepareReplay, PrepareChartOutput} from '../schemas.js';
import {AnalyzeChartPatternsInputSchema} from './chart-patterns-tools.js';

const patternHitSchema = z.object({id: z.string()}).passthrough();

export const CalculateChartPatternDrawingsInputSchema = AnalyzeChartPatternsInputSchema.extend({
	patternId: z.string().trim().min(1).max(64).optional(),
});

export const CalculateChartPatternDrawingsOutputSchema = z
	.object({
		pattern: z.record(z.string(), z.unknown()),
		drawings: z
			.object({
				trendLines: z.array(z.record(z.string(), z.unknown())).optional(),
				horizontalLevels: z.array(z.record(z.string(), z.unknown())).optional(),
				patternOverlay: z.record(z.string(), z.unknown()),
			})
			.strict(),
	})
	.strict();

export const ApplyChartPatternDrawingsInputSchema = z.preprocess(
	preprocessApplyChartPatternDrawingsInput,
	z
		.object({
			title: z.string().trim().min(1).max(256).optional(),
			toolResult: z.unknown().optional(),
			rows: z.array(z.unknown()).min(1).optional(),
			prepareReplay: z.record(z.string(), z.unknown()).optional(),
			patternId: z.string().trim().min(1).max(64).optional(),
			drawings: CalculateChartPatternDrawingsOutputSchema.shape.drawings.optional(),
			analysis: z
				.object({
					pattern: patternHitSchema.nullable().optional(),
					patterns: z.array(patternHitSchema).optional(),
				})
				.passthrough()
				.optional(),
			removeDrawings: z.boolean().optional(),
		})
		.strict(),
);

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
	if (record.pattern == null && typeof record.analysis === 'object' && record.analysis != null) {
		return record.analysis;
	}
	return parsed;
}

function preprocessApplyChartPatternDrawingsInput(raw: unknown): unknown {
	if (typeof raw !== 'object' || raw == null) {
		return raw;
	}
	const input = {...(raw as Record<string, unknown>)};
	if (input.analysis != null) {
		input.analysis = normalizeAnalysisInput(input.analysis);
	}
	if (input.drawings != null) {
		input.drawings = parseJsonObject(input.drawings);
	}
	if (input.prepareReplay != null) {
		input.prepareReplay = parseJsonObject(input.prepareReplay);
	}
	// Accept full calculate_chart_pattern_drawings response at top level.
	const calcDrawings = input.drawings as Record<string, unknown> | undefined;
	if (
		calcDrawings &&
		typeof calcDrawings === 'object' &&
		calcDrawings.patternOverlay != null &&
		input.pattern != null &&
		input.analysis == null
	) {
		input.analysis = {pattern: input.pattern};
	}
	if (input.drawings == null && calcDrawings?.patternOverlay != null) {
		input.drawings = calcDrawings;
	}
	// analysis.pattern.levels with kind neckline must not be copied into horizontalLevels.
	return input;
}

function normalizeHorizontalLevels(
	levels: Array<{price: number; label?: string; kind?: string}> | undefined,
): Array<{price: number; label?: string; kind?: 'support' | 'resistance' | 'level'}> | undefined {
	if (!levels?.length) {
		return undefined;
	}
	return levels.map(level => ({
		price: level.price,
		...(level.label ? {label: level.label} : {}),
		...(normalizeHorizontalLevelKind(level.kind)
			? {kind: normalizeHorizontalLevelKind(level.kind)}
			: {}),
	}));
}

function normalizeTrendLineKind(kind: string | undefined): 'support' | 'resistance' {
	if (kind === 'support' || kind === 'boundary') {
		return 'support';
	}
	return 'resistance';
}

function barsFromInput(input: {
	toolResult?: unknown;
	rows?: unknown[];
}): Record<string, unknown>[] {
	if (input.rows?.length) {
		return input.rows as Record<string, unknown>[];
	}
	if (input.toolResult != null) {
		return (extractOhlcvBarsFromUnknown(input.toolResult) ?? []) as Record<string, unknown>[];
	}
	return [];
}

function pickPattern(
	hits: ChartPatternHit[],
	patternId?: string,
	analysis?: {pattern?: ChartPatternHit | null; patterns?: ChartPatternHit[]},
): ChartPatternHit | null {
	if (analysis?.pattern) {
		return analysis.pattern as ChartPatternHit;
	}
	if (patternId) {
		return hits.find(h => h.id === patternId) ?? analysis?.patterns?.find(p => p.id === patternId) ?? null;
	}
	return hits[0] ?? null;
}

function drawingOverlaysFromCalc(
	drawings?: z.infer<typeof CalculateChartPatternDrawingsOutputSchema>['drawings'],
): ChartOverlayInput[] {
	if (!drawings) {
		return [];
	}
	const out: ChartOverlayInput[] = [];
	if (drawings.horizontalLevels?.length) {
		out.push({
			type: 'horizontal_levels',
			levels: normalizeHorizontalLevels(
				drawings.horizontalLevels as Array<{price: number; label?: string; kind?: string}>,
			)!,
		});
	}
	if (drawings.trendLines?.length) {
		out.push({
			type: 'trend_lines',
			lines: (drawings.trendLines as Array<{
				kind?: string;
				pointA: {time: number; price: number};
				pointB: {time: number; price: number};
				label?: string;
			}>).map(line => ({
				kind: normalizeTrendLineKind(line.kind),
				pointA: line.pointA,
				pointB: line.pointB,
				...(line.label ? {label: line.label} : {}),
			})),
		});
	}
	return out;
}

function stripPatternDrawingOverlays(replay: ChartPrepareReplay): ChartPrepareReplay {
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

export function calculateChartPatternDrawings(
	input: unknown,
): SdkResult<z.infer<typeof CalculateChartPatternDrawingsOutputSchema>> {
	const parsed = CalculateChartPatternDrawingsInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.message};
	}
	const rawBars = barsFromInput(parsed.data);
	if (!rawBars.length) {
		return {ok: false, reason: 'Provide OHLCV rows or toolResult with candle data.'};
	}
	const patternIds = filterChartPatternIds(parsed.data.patterns) as ChartPatternId[] | undefined;
	const minBars = maxChartPatternMinBars(patternIds);
	if (rawBars.length < minBars) {
		return {
			ok: false,
			reason: `Need at least ${minBars} OHLCV bars for classic chart pattern detection (got ${rawBars.length}).`,
		};
	}

	const hits = scanChartPatterns(rawBars, {
		patternIds,
		focusWindow: parsed.data.focusWindow,
		minConfidence: parsed.data.minConfidence,
		swingLookback: parsed.data.swingLookback,
		smoothHeadShoulders: parsed.data.smoothHeadShoulders,
		smoothWindow: parsed.data.smoothWindow,
		retestTolerancePct: parsed.data.retestTolerancePct,
		retestAtrPeriod: parsed.data.retestAtrPeriod,
		retestAtrMultiplier: parsed.data.retestAtrMultiplier,
	});
	const pattern = pickPattern(hits, parsed.data.patternId);
	if (!pattern) {
		return {ok: false, reason: 'No chart pattern found matching criteria.'};
	}

	const trendLines = chartPatternHitToTrendLines(pattern);
	const horizontalLevels = chartPatternHitToHorizontalLevels(pattern);
	const patternOverlay = chartPatternHitToOverlay(pattern);

	return {
		ok: true,
		data: {
			pattern,
			drawings: {
				...(trendLines.length ? {trendLines} : {}),
				...(horizontalLevels.length ? {horizontalLevels} : {}),
				patternOverlay,
			},
		},
	};
}

export function applyChartPatternDrawings(
	input: unknown,
): SdkResult<PrepareChartOutput> {
	const parsed = ApplyChartPatternDrawingsInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.message};
	}

	const rawBars = barsFromInput(parsed.data);
	if (!rawBars.length) {
		return {
			ok: false,
			reason: 'Provide `rows` or `toolResult` with OHLCV bars to apply chart pattern drawings.',
		};
	}

	let baseReplay = (parsed.data.prepareReplay as ChartPrepareReplay | undefined) ?? {};
	if (parsed.data.removeDrawings) {
		baseReplay = stripPatternDrawingOverlays(baseReplay);
	}

	let patternOverlay: Extract<ChartOverlayInput, {type: 'chart_pattern'}> | undefined;
	if (!parsed.data.removeDrawings) {
		if (parsed.data.drawings?.patternOverlay) {
			patternOverlay = parsed.data.drawings.patternOverlay as Extract<
				ChartOverlayInput,
				{type: 'chart_pattern'}
			>;
		} else {
			const hits = scanChartPatterns(rawBars, {minConfidence: 0});
			const pattern = pickPattern(hits, parsed.data.patternId, parsed.data.analysis as {
				pattern?: ChartPatternHit | null;
				patterns?: ChartPatternHit[];
			});
			if (pattern) {
				patternOverlay = chartPatternHitToOverlay(pattern);
			} else if (parsed.data.analysis?.pattern) {
				patternOverlay = chartPatternHitToOverlay(parsed.data.analysis.pattern as ChartPatternHit);
			}
		}
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

	const mergedOverlays: ChartOverlayInput[] = [
		...indicatorOverlays,
		...drawingOverlaysFromCalc(parsed.data.drawings),
		...(patternOverlay ? [patternOverlay] : []),
	];

	const titleSuffix = patternOverlay?.patternName;
	const baseTitle = parsed.data.title?.trim() || 'Chart';
	const nextTitle =
		titleSuffix && !baseTitle.includes(titleSuffix)
			? `${baseTitle} — ${titleSuffix}`
			: baseTitle;

	return prepareChart({
		title: nextTitle,
		bars: rawBars,
		...(mergedOverlays.length ? {overlays: mergedOverlays} : {}),
		...(baseReplay.skipDefaultOverlays ? {options: {skipDefaultOverlays: true}} : {}),
	});
}
