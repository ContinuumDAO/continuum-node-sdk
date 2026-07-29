import {z} from 'zod';
import type {SdkResult} from '../../result.js';
import type {ChartOverlayInput} from '../overlay-schemas.js';
import {ChartDivergenceOverlaySchema} from '../overlay-schemas.js';
import {resolveOscillatorPaneIds} from '../overlays.js';
import {extractLiveBindingFromFetchPayload} from '../live/binding-extract.js';
import {validateOhlcvBarsFromToolResult} from '../ohlcv-window.js';
import {attachChartLoadMeta} from '../chart-ohlcv-load-status.js';
import {
	runOhlcvIntegrityPipeline,
	rejectApplyPatternDrawingsWithoutChartContext,
} from '../ohlcv-integrity.js';
import type {ChartLiveBinding} from '../live/schemas.js';
import {prepareChart} from '../prepare.js';
import type {ChartPrepareReplay, PrepareChartOutput} from '../schemas.js';
import {AGENT_CHART_DISPLAY_MAX_POINTS} from '../schemas.js';
import {summarizeOhlcvBars} from '../chart-ohlcv-summary.js';
import {DEFAULT_CHART_RSI_PERIOD} from '../chart-defaults.js';
import {AGENT_OHLCV_DATA_POLICY} from './analysis-meta.js';
import {prepareOhlcvBarsForAnalysis} from './ohlcv-live-merge.js';
import {missingOhlcvBarsReason, preprocessOhlcvToolInput} from './ohlcv-input.js';
import type {DivergenceHit} from './divergence/types.js';
import {kindLabel} from './divergence/detect.js';

const DIVERGENCE_RSI_ID = 'divergence_rsi';
const DIVERGENCE_STOCH_ID = 'divergence_stochrsi';

const hitSchema = z
	.object({
		kind: z.enum([
			'regular_bullish',
			'regular_bearish',
			'hidden_bullish',
			'hidden_bearish',
		]),
		oscillator: z.enum(['rsi', 'stochasticrsi']),
		p1: z.object({index: z.number(), timeSec: z.number(), value: z.number()}).strict(),
		p2: z.object({index: z.number(), timeSec: z.number(), value: z.number()}).strict(),
		o1: z.object({index: z.number(), timeSec: z.number(), value: z.number()}).strict(),
		o2: z.object({index: z.number(), timeSec: z.number(), value: z.number()}).strict(),
		barsSinceConfirm: z.number().int().optional(),
		side: z.enum(['long', 'short']).optional(),
		confidence: z.number().optional(),
	})
	.strict();

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
	if (
		record.primary == null &&
		record.divergences == null &&
		typeof record.analysis === 'object' &&
		record.analysis != null
	) {
		return record.analysis;
	}
	return parsed;
}

function preprocessDivergenceDrawingsInput(raw: unknown): unknown {
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

export function hitsToDivergenceOverlay(
	hits: DivergenceHit[],
	paneByOsc?: Partial<Record<'rsi' | 'stochasticrsi', string>>,
): Extract<ChartOverlayInput, {type: 'divergence'}> | null {
	const segments = hits.slice(0, 4).map(hit => ({
		kind: hit.kind,
		oscillator: hit.oscillator,
		...(paneByOsc?.[hit.oscillator]
			? {oscillatorPaneId: paneByOsc[hit.oscillator]}
			: {}),
		price: {
			pointA: {time: hit.p1.timeSec, price: hit.p1.value},
			pointB: {time: hit.p2.timeSec, price: hit.p2.value},
		},
		oscillatorLine: {
			pointA: {time: hit.o1.timeSec, value: hit.o1.value},
			pointB: {time: hit.o2.timeSec, value: hit.o2.value},
		},
		label: kindLabel(hit.kind),
	}));
	if (!segments.length) {
		return null;
	}
	return {
		type: 'divergence',
		segments,
		id: 'divergence_primary',
	};
}

function collectHitsFromAnalysis(analysis: {
	primary?: DivergenceHit | null;
	divergences?: DivergenceHit[];
	includeSecondaries?: boolean;
}): DivergenceHit[] {
	const hits: DivergenceHit[] = [];
	if (analysis.primary) {
		hits.push(analysis.primary);
	}
	if (analysis.includeSecondaries && analysis.divergences?.length) {
		for (const hit of analysis.divergences) {
			if (
				analysis.primary &&
				hit.p2.index === analysis.primary.p2.index &&
				hit.kind === analysis.primary.kind &&
				hit.oscillator === analysis.primary.oscillator
			) {
				continue;
			}
			hits.push(hit);
			if (hits.length >= 4) {
				break;
			}
		}
	}
	return hits;
}

/**
 * Resolve candlestick series id for new indicator overlays.
 * prepare_chart_from_rows defaults to `candles` (not `price`); reuse any existing overlay source.
 */
export function resolveDivergenceSourceSeriesId(overlays: ChartOverlayInput[]): string {
	for (const o of overlays) {
		if (
			(o.type === 'ema' ||
				o.type === 'sma' ||
				o.type === 'rsi' ||
				o.type === 'stochasticrsi' ||
				o.type === 'macd' ||
				o.type === 'bollinger' ||
				o.type === 'donchian' ||
				o.type === 'zscore') &&
			typeof o.sourceSeriesId === 'string' &&
			o.sourceSeriesId.trim()
		) {
			return o.sourceSeriesId.trim();
		}
	}
	return 'candles';
}

/** Ensure Stoch RSI always; RSI when any segment needs it. */
export function ensureDivergenceIndicatorOverlays(
	overlays: ChartOverlayInput[],
	needsRsi: boolean,
	sourceSeriesId?: string,
): ChartOverlayInput[] {
	const next = [...overlays];
	const sourceId = sourceSeriesId?.trim() || resolveDivergenceSourceSeriesId(next);
	const hasStoch = next.some(o => o.type === 'stochasticrsi');
	const hasRsi = next.some(o => o.type === 'rsi');
	if (!hasStoch) {
		next.push({
			type: 'stochasticrsi',
			sourceSeriesId: sourceId,
			id: DIVERGENCE_STOCH_ID,
		});
	}
	if (needsRsi && !hasRsi) {
		next.push({
			type: 'rsi',
			sourceSeriesId: sourceId,
			period: DEFAULT_CHART_RSI_PERIOD,
			id: DIVERGENCE_RSI_ID,
			label: `RSI(${DEFAULT_CHART_RSI_PERIOD})`,
		});
	}
	return next;
}

export const CalculateDivergenceDrawingsInputSchema = z.preprocess(
	preprocessDivergenceDrawingsInput,
	z
		.object({
			analysis: z
				.object({
					primary: hitSchema.nullable().optional(),
					divergences: z.array(hitSchema).optional(),
				})
				.passthrough()
				.optional(),
			primary: hitSchema.optional(),
			divergences: z.array(hitSchema).optional(),
			includeSecondaries: z.boolean().optional(),
		})
		.strict(),
);

export const CalculateDivergenceDrawingsOutputSchema = z
	.object({
		divergenceOverlay: ChartDivergenceOverlaySchema,
	})
	.strict();

export function calculateDivergenceDrawings(
	input: unknown,
): SdkResult<z.infer<typeof CalculateDivergenceDrawingsOutputSchema>> {
	const parsed = CalculateDivergenceDrawingsInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.message};
	}
	const analysis = parsed.data.analysis ?? {};
	const hits = collectHitsFromAnalysis({
		primary: (parsed.data.primary ?? analysis.primary ?? null) as DivergenceHit | null,
		divergences: (parsed.data.divergences ?? analysis.divergences) as DivergenceHit[] | undefined,
		includeSecondaries: parsed.data.includeSecondaries === true,
	});
	const overlay = hitsToDivergenceOverlay(hits);
	if (!overlay) {
		return {ok: false, reason: 'No divergence hits to draw. Run analyze_divergence first.'};
	}
	return {ok: true, data: {divergenceOverlay: overlay}};
}

export const ApplyDivergenceDrawingsInputSchema = z.preprocess(
	preprocessDivergenceDrawingsInput,
	z
		.object({
			title: z.string().trim().min(1).max(256).optional(),
			label: z.string().trim().min(1).max(128).optional(),
			toolResult: z.unknown().optional(),
			rows: z.array(z.unknown()).min(1).optional(),
			ohlcvDigest: z.string().trim().min(1).max(512).optional(),
			prepareReplay: z.unknown().optional(),
			live: z.unknown().optional(),
			removeDrawings: z.boolean().optional(),
			includeSecondaries: z.boolean().optional(),
			analysis: z
				.object({
					primary: hitSchema.nullable().optional(),
					divergences: z.array(hitSchema).optional(),
				})
				.passthrough()
				.optional(),
			drawings: z
				.object({
					divergenceOverlay: ChartDivergenceOverlaySchema.optional(),
				})
				.strict()
				.optional(),
			divergenceOverlay: ChartDivergenceOverlaySchema.optional(),
		})
		.strict(),
);

function stripDivergenceOverlays(replay: ChartPrepareReplay): ChartPrepareReplay {
	const overlays = replay.overlays?.filter(o => o.type !== 'divergence') ?? [];
	return {...replay, overlays};
}

export async function applyDivergenceDrawings(
	input: unknown,
): Promise<SdkResult<PrepareChartOutput>> {
	const parsed = ApplyDivergenceDrawingsInputSchema.safeParse(input);
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
				' Use the same fetch JSON as the original chart — do not substitute analysis JSON.',
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
	if (parsed.data.removeDrawings) {
		baseReplay = stripDivergenceOverlays(baseReplay);
	}

	const analysis = parsed.data.analysis;
	let divergenceOverlay =
		parsed.data.divergenceOverlay ??
		parsed.data.drawings?.divergenceOverlay ??
		undefined;

	if (!parsed.data.removeDrawings && !divergenceOverlay) {
		const fromAnalysisOverlay = (analysis as {divergenceOverlay?: unknown} | undefined)
			?.divergenceOverlay;
		if (fromAnalysisOverlay && typeof fromAnalysisOverlay === 'object') {
			const parsedOverlay = ChartDivergenceOverlaySchema.safeParse(fromAnalysisOverlay);
			if (parsedOverlay.success) {
				divergenceOverlay = parsedOverlay.data;
			}
		}
	}
	if (!parsed.data.removeDrawings && !divergenceOverlay) {
		const hits = collectHitsFromAnalysis({
			primary: (analysis?.primary ?? null) as DivergenceHit | null,
			divergences: analysis?.divergences as DivergenceHit[] | undefined,
			includeSecondaries: parsed.data.includeSecondaries === true,
		});
		divergenceOverlay = hitsToDivergenceOverlay(hits) ?? undefined;
	}

	const nonDrawingOverlays =
		baseReplay.overlays?.filter(
			o =>
				o.type !== 'horizontal_levels' &&
				o.type !== 'pivot_levels' &&
				o.type !== 'fibonacci' &&
				o.type !== 'trend_lines' &&
				o.type !== 'chart_pattern' &&
				o.type !== 'elliott_waves' &&
				o.type !== 'divergence',
		) ?? [];

	const needsRsi =
		divergenceOverlay?.segments.some(s => s.oscillator === 'rsi') === true ||
		(analysis?.primary as DivergenceHit | null | undefined)?.oscillator === 'rsi' ||
		(analysis?.divergences as DivergenceHit[] | undefined)?.some(h => h.oscillator === 'rsi') ===
			true;

	// Always inject Stoch RSI; inject RSI when any segment targets it.
	// sourceSeriesId must match the candlestick series (`candles` by default — not `price`).
	const withIndicators = ensureDivergenceIndicatorOverlays(nonDrawingOverlays, needsRsi);
	const paneByOsc = resolveOscillatorPaneIds(withIndicators);
	if (divergenceOverlay) {
		divergenceOverlay = {
			...divergenceOverlay,
			segments: divergenceOverlay.segments.map(seg => ({
				...seg,
				oscillatorPaneId: paneByOsc[seg.oscillator] ?? seg.oscillatorPaneId,
			})),
		};
	}

	const mergedOverlays: ChartOverlayInput[] = [
		...withIndicators,
		...(divergenceOverlay && !parsed.data.removeDrawings ? [divergenceOverlay] : []),
	];

	if (!parsed.data.removeDrawings && !divergenceOverlay) {
		return {
			ok: false,
			reason:
				'No divergence overlay to apply. Pass analysis from analyze_divergence or drawings from calculate_divergence_drawings.',
		};
	}

	const baseTitle = parsed.data.title?.trim() || 'Chart';
	const skipDefaults =
		baseReplay.skipDefaultOverlays === true ||
		baseReplay.usedDefaultOverlays === true ||
		withIndicators.length > 0;

	const chartResult = prepareChart({
		title: baseTitle,
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

	const live =
		(parsed.data.live as ChartLiveBinding | undefined) ??
		(parsed.data.toolResult != null
			? extractLiveBindingFromFetchPayload(parsed.data.toolResult, {
					maxPoints: AGENT_CHART_DISPLAY_MAX_POINTS,
				})
			: undefined);

	const overlayWarnings: string[] = [];
	if (divergenceOverlay && !parsed.data.removeDrawings) {
		overlayWarnings.push(
			`Divergence overlay applied (${divergenceOverlay.segments.length} segment(s)); Stochastic RSI pane ensured. ` +
				'Use this chart output — do not call prepare_chart_from_rows again for overlay-only requests.',
		);
	}
	const ohlcvSummary = summarizeOhlcvBars(rawBars);

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
				title: parsed.data.title ?? baseTitle,
				ohlcvFingerprint: integrity.data.fingerprint ?? prepared.data.fingerprint ?? undefined,
			},
		),
	};
}
