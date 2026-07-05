import {z} from 'zod';
import type {SdkResult} from '../../result.js';
import {
	chartPatternHitToHorizontalLevels,
	chartPatternHitToOverlay,
	chartPatternHitToTrendLines,
	filterChartPatternIds,
	maxChartPatternMinBars,
	normalizeChartPatternOverlay,
	normalizeHorizontalLevelKind,
	remapOverlayTimesFromBarIndices,
	scanChartPatterns,
} from '../../chart-patterns/index.js';
import type {ChartPatternHit, ChartPatternId} from '../../chart-patterns/types.js';
import {extractOhlcvBarsFromUnknown, parseJsonIfString} from '../fetch-result.js';
import {extractLiveBindingFromFetchPayload} from '../live/binding-extract.js';
import {sanitizeOhlcvBarRows, validateOhlcvBarsFromToolResult} from '../ohlcv-window.js';
import type {ChartLiveBinding} from '../live/schemas.js';
import type {ChartOverlayInput} from '../overlay-schemas.js';
import {prepareChart} from '../prepare.js';
import type {ChartPrepareReplay, PrepareChartOutput} from '../schemas.js';
import {AnalyzeChartPatternsInputInnerSchema, preprocessAnalyzeChartPatternsInput} from './chart-patterns-tools.js';
import {
	barsFromOhlcvToolInput,
	missingOhlcvBarsReason,
	preprocessOhlcvToolInput,
} from './ohlcv-input.js';

const patternHitSchema = z.object({id: z.string()}).passthrough();

export const CalculateChartPatternDrawingsInputSchema = z.preprocess(
	preprocessAnalyzeChartPatternsInput,
	AnalyzeChartPatternsInputInnerSchema.extend({
		patternId: z.string().trim().min(1).max(64).optional(),
	}),
);

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
			label: z.string().trim().min(1).max(128).optional(),
			toolResult: z.unknown().optional(),
			rows: z.array(z.unknown()).min(1).optional(),
			prepareReplay: z.record(z.string(), z.unknown()).optional(),
			live: z.record(z.string(), z.unknown()).optional(),
			patternId: z.string().trim().min(1).max(64).optional(),
			pattern: patternHitSchema.optional(),
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
		return preprocessOhlcvToolInput(raw);
	}
	const input = {...(preprocessOhlcvToolInput(raw) as Record<string, unknown>)};
	if (input.analysis != null) {
		input.analysis = normalizeAnalysisInput(input.analysis);
	}
	if (input.drawings != null) {
		input.drawings = parseJsonObject(input.drawings);
	}
	if (input.prepareReplay != null) {
		input.prepareReplay = parseJsonObject(input.prepareReplay);
	}
	if (input.live != null) {
		input.live = parseJsonObject(input.live);
	}
	if (input.pattern != null) {
		input.pattern = parseJsonObject(input.pattern);
	}
	// Full calculate_chart_pattern_drawings response pasted at top level.
	if (
		input.drawings == null &&
		input.pattern != null &&
		typeof input.pattern === 'object' &&
		'drawings' in (input.pattern as Record<string, unknown>)
	) {
		const nested = input.pattern as Record<string, unknown>;
		if (nested.drawings && typeof nested.drawings === 'object') {
			input.drawings = nested.drawings;
		}
		if (nested.pattern && typeof nested.pattern === 'object') {
			input.pattern = nested.pattern;
		}
	}
	// Full calculate_chart_pattern_drawings response at top level: { pattern, drawings }.
	if (input.drawings == null && input.pattern != null && typeof input.pattern === 'object') {
		const rootDrawings = (input as Record<string, unknown>).drawings;
		if (rootDrawings && typeof rootDrawings === 'object') {
			input.drawings = rootDrawings;
		}
	}
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
	const extractOptions = {maxPoints: 400};
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

function pickPattern(
	hits: ChartPatternHit[],
	patternId?: string,
	analysis?: {
		pattern?: ChartPatternHit | null;
		patterns?: ChartPatternHit[];
		primaryPattern?: {id?: string} | null;
	},
): ChartPatternHit | null {
	if (analysis?.pattern) {
		return analysis.pattern as ChartPatternHit;
	}
	const targetId = patternId ?? analysis?.primaryPattern?.id;
	if (targetId && analysis?.patterns?.length) {
		const fromList = analysis.patterns.find(p => p.id === targetId);
		if (fromList) {
			return fromList as ChartPatternHit;
		}
	}
	if (patternId) {
		return hits.find(h => h.id === patternId) ?? analysis?.patterns?.find(p => p.id === patternId) ?? null;
	}
	return hits[0] ?? analysis?.patterns?.[0] ?? null;
}

function buildDrawingsFromPatternHit(
	hit: ChartPatternHit,
): z.infer<typeof CalculateChartPatternDrawingsOutputSchema>['drawings'] {
	const trendLines = chartPatternHitToTrendLines(hit);
	const horizontalLevels = chartPatternHitToHorizontalLevels(hit);
	const patternOverlay = chartPatternHitToOverlay(hit);
	return {
		...(trendLines.length ? {trendLines} : {}),
		...(horizontalLevels.length ? {horizontalLevels} : {}),
		patternOverlay,
	};
}

function resolveDrawingsForApply(input: {
	drawings?: z.infer<typeof CalculateChartPatternDrawingsOutputSchema>['drawings'];
	pattern?: ChartPatternHit | Record<string, unknown>;
	patternId?: string;
	analysis?: {
		pattern?: ChartPatternHit | null;
		patterns?: ChartPatternHit[];
		primaryPattern?: {id?: string} | null;
	};
	rawBars: Record<string, unknown>[];
	removeDrawings?: boolean;
}): z.infer<typeof CalculateChartPatternDrawingsOutputSchema>['drawings'] | undefined {
	if (input.removeDrawings || input.drawings?.patternOverlay) {
		return input.drawings;
	}

	const patternHint =
		input.pattern ??
		input.analysis?.pattern ??
		(input.analysis as {primaryPattern?: ChartPatternHit} | undefined)?.primaryPattern;

	if (input.drawings && (input.drawings.trendLines?.length || input.drawings.horizontalLevels?.length)) {
		return {
			...input.drawings,
			patternOverlay:
				input.drawings.patternOverlay ??
				(patternHint && typeof patternHint === 'object' && 'lines' in patternHint
					? chartPatternHitToOverlay(patternHint as ChartPatternHit)
					: undefined),
		};
	}

	const hits = scanChartPatterns(input.rawBars, {minConfidence: 0});
	const hit =
		(patternHint &&
		typeof patternHint === 'object' &&
		'lines' in patternHint &&
		'name' in patternHint
			? (patternHint as ChartPatternHit)
			: null) ?? pickPattern(hits, input.patternId, input.analysis);

	if (hit) {
		return buildDrawingsFromPatternHit(hit);
	}

	return input.drawings;
}

function drawingOverlaysFromCalc(
	drawings?: z.infer<typeof CalculateChartPatternDrawingsOutputSchema>['drawings'],
	options?: {skipTrendLines?: boolean},
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
	if (drawings.trendLines?.length && !options?.skipTrendLines) {
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
		return {ok: false, reason: missingOhlcvBarsReason(parsed.data)};
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
			reason:
				missingOhlcvBarsReason(parsed.data) +
				' Use the same fetch JSON as the original chart — do not substitute analysis JSON or market snapshot.',
		};
	}

	if (parsed.data.toolResult != null) {
		const windowCheck = validateOhlcvBarsFromToolResult(rawBars, parsed.data.toolResult);
		if (!windowCheck.ok) {
			return windowCheck;
		}
	}

	const patternHintEarly =
		parsed.data.pattern ??
		parsed.data.analysis?.pattern ??
		(parsed.data.analysis as {primaryPattern?: ChartPatternHit} | undefined)?.primaryPattern;
	const hasExplicitPatternInput =
		parsed.data.drawings?.patternOverlay != null ||
		parsed.data.analysis?.pattern != null ||
		parsed.data.analysis?.primaryPattern != null ||
		(parsed.data.analysis?.patterns?.length ?? 0) > 0 ||
		parsed.data.pattern != null ||
		parsed.data.patternId != null;

	const resolvedDrawings = hasExplicitPatternInput
		? resolveDrawingsForApply({
				drawings: parsed.data.drawings,
				pattern: parsed.data.pattern as ChartPatternHit | undefined,
				patternId: parsed.data.patternId,
				analysis: parsed.data.analysis as {
					pattern?: ChartPatternHit | null;
					patterns?: ChartPatternHit[];
					primaryPattern?: {id?: string} | null;
				},
				rawBars,
				removeDrawings: parsed.data.removeDrawings,
			})
		: parsed.data.drawings;

	let baseReplay = (parsed.data.prepareReplay as ChartPrepareReplay | undefined) ?? {};
	if (parsed.data.removeDrawings) {
		baseReplay = stripPatternDrawingOverlays(baseReplay);
	}

	let patternOverlay: Extract<ChartOverlayInput, {type: 'chart_pattern'}> | undefined;
	const patternHint = patternHintEarly;
	const hasPatternOverlayInput =
		hasExplicitPatternInput || resolvedDrawings?.patternOverlay != null;

	if (!parsed.data.removeDrawings) {
		if (resolvedDrawings?.patternOverlay) {
			const normalized = normalizeChartPatternOverlay(
				resolvedDrawings.patternOverlay,
				patternHint as ChartPatternHit | undefined,
			);
			patternOverlay = normalized
				? remapOverlayTimesFromBarIndices(normalized, rawBars)
				: undefined;
		} else if (hasPatternOverlayInput) {
			const hits = scanChartPatterns(rawBars, {minConfidence: 0});
			const pattern = pickPattern(hits, parsed.data.patternId, parsed.data.analysis as {
				pattern?: ChartPatternHit | null;
				patterns?: ChartPatternHit[];
			});
			if (pattern) {
				patternOverlay = remapOverlayTimesFromBarIndices(
					chartPatternHitToOverlay(pattern),
					rawBars,
				);
			} else if (parsed.data.analysis?.pattern) {
				const normalized =
					normalizeChartPatternOverlay(
						parsed.data.analysis.pattern,
						parsed.data.analysis.pattern as ChartPatternHit,
					) ?? chartPatternHitToOverlay(parsed.data.analysis.pattern as ChartPatternHit);
				patternOverlay = remapOverlayTimesFromBarIndices(normalized, rawBars);
			} else if (parsed.data.pattern) {
				const normalized =
					normalizeChartPatternOverlay(
						parsed.data.pattern,
						parsed.data.pattern as ChartPatternHit,
					) ?? chartPatternHitToOverlay(parsed.data.pattern as ChartPatternHit);
				patternOverlay = remapOverlayTimesFromBarIndices(normalized, rawBars);
			}
		}
	}

	const calcDrawings = resolvedDrawings ?? parsed.data.drawings;

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
		...drawingOverlaysFromCalc(calcDrawings, {
			skipTrendLines: Boolean(patternOverlay?.lines.length),
		}),
		...(patternOverlay ? [patternOverlay] : []),
	];

	if (
		!parsed.data.removeDrawings &&
		!mergedOverlays.some(
			o =>
				o.type === 'chart_pattern' ||
				o.type === 'horizontal_levels' ||
				o.type === 'trend_lines',
		)
	) {
		return {
			ok: false,
			reason:
				'No pattern overlay to apply. Pass `drawings` from `calculate_chart_pattern_drawings` or `analysis: { pattern }` from `analyze_chart_patterns`.',
		};
	}

	const titleSuffix = patternOverlay?.patternName;
	const baseTitle = parsed.data.title?.trim() || 'Chart';
	const nextTitle =
		titleSuffix && !baseTitle.includes(titleSuffix)
			? `${baseTitle} — ${titleSuffix}`
			: baseTitle;

	const skipDefaults =
		baseReplay.skipDefaultOverlays === true ||
		baseReplay.usedDefaultOverlays === true ||
		indicatorOverlays.length > 0;

	const chartResult = prepareChart({
		title: nextTitle,
		bars: rawBars,
		...(mergedOverlays.length ? {overlays: mergedOverlays} : {}),
		options: {
			maxPoints: 400,
			...(skipDefaults ? {skipDefaultOverlays: true} : {}),
		},
	});
	if (!chartResult.ok) {
		return chartResult;
	}
	const live =
		(parsed.data.live as ChartLiveBinding | undefined) ??
		(parsed.data.toolResult != null
			? extractLiveBindingFromFetchPayload(parsed.data.toolResult, {maxPoints: 400})
			: undefined);

	const overlayWarnings: string[] = [];
	if (patternOverlay) {
		overlayWarnings.push(
			`Classic pattern overlay applied: ${patternOverlay.patternName}. ` +
				'Use this chart output — do not call prepare_chart_from_rows again for overlay-only requests.',
		);
	}

	return {
		ok: true,
		data: {
			...chartResult.data,
			...(live ? {live} : {}),
			...(overlayWarnings.length
				? {
						meta: {
							warnings: [...(chartResult.data.meta?.warnings ?? []), ...overlayWarnings],
						},
					}
				: {}),
		},
	};
}
