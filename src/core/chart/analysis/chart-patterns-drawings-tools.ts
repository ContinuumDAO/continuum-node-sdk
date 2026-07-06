import {z} from 'zod';
import type {SdkResult} from '../../result.js';
import {
	drawingSpecToOverlay,
} from '../../chart-patterns/drawing-spec.js';
import {
	enrichChartPatternHit,
} from '../../chart-patterns/pattern-enrich.js';
import {normalizeChartPatternId} from '../../chart-patterns/pattern-id-aliases.js';
import {
	filterChartPatternIds,
	maxChartPatternMinBars,
	normalizeChartPatternOverlay,
	remapOverlayTimesFromBarIndices,
	scanChartPatterns,
} from '../../chart-patterns/index.js';
import {normalizeBarsFromRows} from '../../chart-patterns/swings.js';
import type {ChartPatternHit, EnrichedChartPatternHit} from '../../chart-patterns/types.js';
import {extractLiveBindingFromFetchPayload} from '../live/binding-extract.js';
import {validateOhlcvBarsFromToolResult} from '../ohlcv-window.js';
import {attachChartLoadMeta} from '../chart-ohlcv-load-status.js';
import {
	collectChartPatternOverlayPrices,
	summarizeOhlcvBars,
} from '../chart-ohlcv-summary.js';
import {rejectGeometryOutsideOhlcvSummary, rejectApplyPatternDrawingsWithoutChartContext, runOhlcvIntegrityPipeline} from '../ohlcv-integrity.js';
import {AGENT_OHLCV_DATA_POLICY} from './analysis-meta.js';
import type {ChartLiveBinding} from '../live/schemas.js';
import type {ChartOverlayInput} from '../overlay-schemas.js';
import {prepareChart} from '../prepare.js';
import type {ChartPrepareReplay, PrepareChartOutput} from '../schemas.js';
import {AnalyzeChartPatternsInputInnerSchema, preprocessAnalyzeChartPatternsInput} from './chart-patterns-tools.js';
import {prepareOhlcvBarsForAnalysis} from './ohlcv-live-merge.js';
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
		patternIndex: z.number().int().min(0).optional(),
		selectionMode: z.enum(['primary', 'highest_confidence']).optional(),
		usePrimary: z.boolean().optional(),
		showVolumeConfirmation: z.boolean().optional(),
		showVolumeProfile: z.boolean().optional(),
	}),
);

export const CalculateChartPatternDrawingsOutputSchema = z
	.object({
		pattern: z.record(z.string(), z.unknown()),
		drawingSpec: z.record(z.string(), z.unknown()).optional(),
		drawings: z
			.object({
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
			patternIndex: z.number().int().min(0).optional(),
			selectionMode: z.enum(['primary', 'highest_confidence']).optional(),
			usePrimary: z.boolean().optional(),
			showVolumeConfirmation: z.boolean().optional(),
			showVolumeProfile: z.boolean().optional(),
			pattern: patternHitSchema.optional(),
			drawings: CalculateChartPatternDrawingsOutputSchema.shape.drawings.optional(),
			analysis: z
				.object({
					pattern: patternHitSchema.nullable().optional(),
					patterns: z.array(patternHitSchema).optional(),
					primaryPattern: patternHitSchema.nullable().optional(),
					highestConfidencePattern: patternHitSchema.nullable().optional(),
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

function pickPattern(
	hits: EnrichedChartPatternHit[],
	options: {
		patternId?: string;
		patternIndex?: number;
		selectionMode?: 'primary' | 'highest_confidence';
		usePrimary?: boolean;
		analysis?: {
			pattern?: EnrichedChartPatternHit | null;
			patterns?: EnrichedChartPatternHit[];
			primaryPattern?: {id?: string} | null;
			highestConfidencePattern?: {id?: string} | null;
		};
	},
): EnrichedChartPatternHit | null {
	const analysis = options.analysis;
	const normalizedId = normalizeChartPatternId(options.patternId);

	if (options.patternIndex != null && analysis?.patterns?.length) {
		const byIndex = analysis.patterns[options.patternIndex];
		if (byIndex) {
			return byIndex;
		}
	}

	if (normalizedId && analysis?.patterns?.length) {
		const fromList = analysis.patterns.find(p => p.id === normalizedId);
		if (fromList) {
			return fromList;
		}
	}
	if (normalizedId) {
		const fromHits = hits.find(h => h.id === normalizedId);
		if (fromHits) {
			return fromHits;
		}
	}

	const mode =
		options.selectionMode ??
		(options.usePrimary === false ? undefined : 'primary');

	if (mode === 'highest_confidence') {
		const hcId = analysis?.highestConfidencePattern?.id;
		if (hcId && analysis?.patterns?.length) {
			const hit = analysis.patterns.find(p => p.id === hcId);
			if (hit) {
				return hit;
			}
		}
		const sorted = [...hits].sort(
			(a, b) => b.confidence - a.confidence || b.barSpan.toIndex - a.barSpan.toIndex,
		);
		return sorted[0] ?? null;
	}

	if (analysis?.pattern) {
		return analysis.pattern;
	}
	const primaryId = analysis?.primaryPattern?.id;
	if (primaryId && analysis?.patterns?.length) {
		const hit = analysis.patterns.find(p => p.id === primaryId);
		if (hit) {
			return hit;
		}
	}

	return hits[0] ?? analysis?.patterns?.[0] ?? null;
}

function buildDrawingsFromPatternHit(
	hit: EnrichedChartPatternHit | ChartPatternHit,
	rawBars: Record<string, unknown>[],
	options?: {showVolumeConfirmation?: boolean; showVolumeProfile?: boolean},
): z.infer<typeof CalculateChartPatternDrawingsOutputSchema> {
	const bars = normalizeBarsFromRows(rawBars);
	const enriched =
		'drawingSpec' in hit && hit.drawingSpec
			? (hit as EnrichedChartPatternHit)
			: enrichChartPatternHit(hit as ChartPatternHit, bars, rawBars);
	const patternOverlay = drawingSpecToOverlay(enriched.drawingSpec, enriched, {
		measuredMove: enriched.measuredMove,
		volumeConfirmation: enriched.volumeConfirmation,
		showVolumeConfirmation: options?.showVolumeConfirmation,
		showVolumeProfile: options?.showVolumeProfile,
		bars,
		rawBars,
	});
	return {
		pattern: enriched,
		drawingSpec: enriched.drawingSpec,
		drawings: {patternOverlay},
	};
}

function resolveDrawingsForApply(input: {
	drawings?: z.infer<typeof CalculateChartPatternDrawingsOutputSchema>['drawings'];
	pattern?: EnrichedChartPatternHit | Record<string, unknown>;
	patternId?: string;
	patternIndex?: number;
	selectionMode?: 'primary' | 'highest_confidence';
	usePrimary?: boolean;
	showVolumeConfirmation?: boolean;
	showVolumeProfile?: boolean;
	analysis?: {
		pattern?: EnrichedChartPatternHit | null;
		patterns?: EnrichedChartPatternHit[];
		primaryPattern?: {id?: string} | null;
		highestConfidencePattern?: {id?: string} | null;
	};
	rawBars: Record<string, unknown>[];
	removeDrawings?: boolean;
}): z.infer<typeof CalculateChartPatternDrawingsOutputSchema> | undefined {
	if (input.removeDrawings) {
		return input.drawings ? {pattern: {}, drawings: input.drawings} : undefined;
	}

	if (input.drawings?.patternOverlay) {
		return {
			pattern: (input.pattern as EnrichedChartPatternHit) ?? {},
			drawings: input.drawings,
		};
	}

	const patternHint =
		(input.pattern as EnrichedChartPatternHit | undefined) ??
		input.analysis?.pattern ??
		undefined;

	if (patternHint && 'drawingSpec' in patternHint && patternHint.drawingSpec) {
		return buildDrawingsFromPatternHit(patternHint as EnrichedChartPatternHit, input.rawBars, {
			showVolumeConfirmation: input.showVolumeConfirmation,
			showVolumeProfile: input.showVolumeProfile,
		});
	}

	const hits = scanChartPatterns(input.rawBars, {minConfidence: 0}).map(hit =>
		enrichChartPatternHit(hit, normalizeBarsFromRows(input.rawBars), input.rawBars),
	);
	const hit = pickPattern(hits, {
		patternId: input.patternId,
		patternIndex: input.patternIndex,
		selectionMode: input.selectionMode,
		usePrimary: input.usePrimary,
		analysis: input.analysis,
	});

	if (hit) {
		return buildDrawingsFromPatternHit(hit, input.rawBars, {
			showVolumeConfirmation: input.showVolumeConfirmation,
			showVolumeProfile: input.showVolumeProfile,
		});
	}

	return input.drawings ? {pattern: {}, drawings: input.drawings} : undefined;
}

function barsFromInput(input: {
	toolResult?: unknown;
	rows?: unknown[];
}): Record<string, unknown>[] {
	return barsFromOhlcvToolInput(input);
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

export async function calculateChartPatternDrawings(
	input: unknown,
): Promise<SdkResult<z.infer<typeof CalculateChartPatternDrawingsOutputSchema>>> {
	const parsed = CalculateChartPatternDrawingsInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.message};
	}
	const prepared = await prepareOhlcvBarsForAnalysis(parsed.data);
	if (!prepared.ok) {
		return prepared;
	}
	const rawBars = prepared.data.bars;
	if (!rawBars.length) {
		return {ok: false, reason: missingOhlcvBarsReason(parsed.data)};
	}

	const integrity = runOhlcvIntegrityPipeline(rawBars, parsed.data);
	if (!integrity.ok) {
		return integrity;
	}

	const patternIds = filterChartPatternIds(parsed.data.patterns);
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
	}).map(hit => enrichChartPatternHit(hit, normalizeBarsFromRows(rawBars), rawBars));

	const pattern = pickPattern(hits, {
		patternId: parsed.data.patternId,
		patternIndex: parsed.data.patternIndex,
		selectionMode: parsed.data.selectionMode,
		usePrimary: parsed.data.usePrimary,
	});
	if (!pattern) {
		return {ok: false, reason: 'No chart pattern found matching criteria.'};
	}

	return {
		ok: true,
		data: buildDrawingsFromPatternHit(pattern, rawBars, {
			showVolumeConfirmation: parsed.data.showVolumeConfirmation,
			showVolumeProfile: parsed.data.showVolumeProfile,
		}),
	};
}

export async function applyChartPatternDrawings(
	input: unknown,
): Promise<SdkResult<PrepareChartOutput>> {
	const parsed = ApplyChartPatternDrawingsInputSchema.safeParse(input);
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
		const windowCheck = validateOhlcvBarsFromToolResult(rawBars, parsed.data.toolResult);
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

	const analysis = parsed.data.analysis as {
		pattern?: EnrichedChartPatternHit | null;
		patterns?: EnrichedChartPatternHit[];
		primaryPattern?: {id?: string} | null;
		highestConfidencePattern?: {id?: string} | null;
	} | undefined;

	const hasExplicitPatternInput =
		parsed.data.drawings?.patternOverlay != null ||
		analysis?.pattern != null ||
		analysis?.primaryPattern != null ||
		analysis?.highestConfidencePattern != null ||
		(analysis?.patterns?.length ?? 0) > 0 ||
		parsed.data.pattern != null ||
		parsed.data.patternId != null ||
		parsed.data.patternIndex != null ||
		parsed.data.selectionMode != null;

	const resolved = hasExplicitPatternInput
		? resolveDrawingsForApply({
				drawings: parsed.data.drawings,
				pattern: parsed.data.pattern as EnrichedChartPatternHit | undefined,
				patternId: parsed.data.patternId,
				patternIndex: parsed.data.patternIndex,
				selectionMode: parsed.data.selectionMode,
				usePrimary: parsed.data.usePrimary,
				showVolumeConfirmation: parsed.data.showVolumeConfirmation,
				showVolumeProfile: parsed.data.showVolumeProfile,
				analysis,
				rawBars,
				removeDrawings: parsed.data.removeDrawings,
			})
		: undefined;

	let baseReplay = (parsed.data.prepareReplay as ChartPrepareReplay | undefined) ?? {};
	if (parsed.data.removeDrawings) {
		baseReplay = stripPatternDrawingOverlays(baseReplay);
	}

	let patternOverlay: Extract<ChartOverlayInput, {type: 'chart_pattern'}> | undefined;
	if (!parsed.data.removeDrawings && resolved?.drawings.patternOverlay) {
		const patternHint =
			(parsed.data.pattern as EnrichedChartPatternHit | undefined) ??
			analysis?.pattern ??
			(resolved.pattern as EnrichedChartPatternHit | undefined);
		const normalized = normalizeChartPatternOverlay(
			resolved.drawings.patternOverlay,
			patternHint,
		);
		patternOverlay = normalized
			? remapOverlayTimesFromBarIndices(normalized, rawBars)
			: undefined;
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
		...(patternOverlay ? [patternOverlay] : []),
	];

	if (
		!parsed.data.removeDrawings &&
		!mergedOverlays.some(o => o.type === 'chart_pattern')
	) {
		return {
			ok: false,
			reason:
				'No pattern overlay to apply. Pass `drawings` from `calculate_chart_pattern_drawings` or `analysis` from `analyze_chart_patterns` with selectionMode / patternId / patternIndex.',
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
	const ohlcvSummary = summarizeOhlcvBars(rawBars);
	if (patternOverlay && ohlcvSummary) {
		const geometryReject = rejectGeometryOutsideOhlcvSummary(
			ohlcvSummary,
			collectChartPatternOverlayPrices(patternOverlay),
		);
		if (!geometryReject.ok) {
			return geometryReject;
		}
	}

	return {
		ok: true,
		data: attachChartLoadMeta(
			{
				...chartResult.data,
				...(live ? {live} : {}),
				meta: {
					...(chartResult.data.meta ?? {}),
					dataPolicy: AGENT_OHLCV_DATA_POLICY,
					...(ohlcvSummary ? {ohlcvSummary} : {}),
					...(overlayWarnings.length ? {warnings: overlayWarnings} : {}),
				},
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
