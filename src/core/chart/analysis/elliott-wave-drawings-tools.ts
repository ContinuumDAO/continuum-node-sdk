import {z} from 'zod';
import type {SdkResult} from '../../result.js';
import type {DrawableElliottWaveSet} from '../../elliott-waves/types.js';
import type {ChartOverlayInput} from '../overlay-schemas.js';
import {extractLiveBindingFromFetchPayload} from '../live/binding-extract.js';
import {validateOhlcvBarsFromToolResult} from '../ohlcv-window.js';
import {attachChartLoadMeta} from '../chart-ohlcv-load-status.js';
import {runOhlcvIntegrityPipeline, rejectApplyPatternDrawingsWithoutChartContext} from '../ohlcv-integrity.js';
import type {ChartLiveBinding} from '../live/schemas.js';
import {prepareChart} from '../prepare.js';
import type {ChartPrepareReplay, PrepareChartOutput} from '../schemas.js';
import {AGENT_CHART_DISPLAY_MAX_POINTS} from '../schemas.js';
import {prepareOhlcvBarsForAnalysis} from './ohlcv-live-merge.js';
import {missingOhlcvBarsReason, preprocessOhlcvToolInput} from './ohlcv-input.js';

const elliottAnalysisPickSchema = z
	.object({
		drawableWaves: z.object({}).passthrough().optional(),
		waveMenu: z.array(z.object({}).passthrough()).optional(),
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
	if (record.drawableWaves == null && typeof record.analysis === 'object' && record.analysis != null) {
		return record.analysis;
	}
	return parsed;
}

function preprocessApplyElliottWaveDrawingsInput(raw: unknown): unknown {
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

export const ApplyElliottWaveDrawingsInputSchema = z.preprocess(
	preprocessApplyElliottWaveDrawingsInput,
	z
		.object({
			title: z.string().trim().min(1).max(256).optional(),
			label: z.string().trim().min(1).max(128).optional(),
			toolResult: z.unknown().optional(),
			rows: z.array(z.unknown()).min(1).optional(),
			prepareReplay: z.unknown().optional(),
			live: z.unknown().optional(),
			waveMenuNumber: z.number().int().min(1).max(64).optional(),
			removeElliottWaves: z.boolean().optional(),
			analysis: elliottAnalysisPickSchema.optional(),
			drawableWaves: z.object({}).passthrough().optional(),
		})
		.strict(),
);

function waveChartPoint(raw: {timeSec?: number; time?: number; price: number}): {time: number; price: number} | null {
	const price = raw.price;
	if (!Number.isFinite(price)) {
		return null;
	}
	const timeRaw = raw.timeSec ?? raw.time;
	if (typeof timeRaw !== 'number' || !Number.isFinite(timeRaw)) {
		return null;
	}
	return {time: timeRaw, price};
}

function normalizeDrawableWaveSet(raw: DrawableElliottWaveSet): DrawableElliottWaveSet | null {
	const waves = raw.waves.flatMap(w => {
		if (w.isInProgress) {
			return [];
		}
		const pointA = waveChartPoint(w.pointA as {timeSec?: number; time?: number; price: number});
		const pointB = waveChartPoint(w.pointB as {timeSec?: number; time?: number; price: number});
		if (!pointA || !pointB) {
			return [];
		}
		if (pointA.time === pointB.time && Math.abs(pointA.price - pointB.price) < 1e-9) {
			return [];
		}
		return [
			{
				...w,
				pointA: {timeSec: pointA.time, price: pointA.price},
				pointB: {timeSec: pointB.time, price: pointB.price},
			},
		];
	});
	if (!waves.length && !(raw.levels?.length)) {
		return null;
	}
	return {
		...raw,
		waves,
		markers: [],
	};
}

export function drawableWavesToOverlay(
	drawable: DrawableElliottWaveSet,
): Extract<ChartOverlayInput, {type: 'elliott_waves'}> | null {
	const normalized = normalizeDrawableWaveSet(drawable);
	if (!normalized) {
		return null;
	}
	return {
		type: 'elliott_waves',
		patternName: normalized.patternName,
		waves: normalized.waves.map(w => ({
			label: w.label,
			pointA: {time: w.pointA.timeSec, price: w.pointA.price},
			pointB: {time: w.pointB.timeSec, price: w.pointB.price},
			kind: w.kind,
			isInProgress: false,
		})),
		levels: normalized.levels.map(l => ({
			price: l.price,
			label: l.label,
			kind: l.kind,
			role: l.role,
		})),
		clipToBarSpan: normalized.clipToBarSpan,
		id: 'elliott_waves_primary',
	};
}

export const CalculateElliottWaveDrawingsOutputSchema = z
	.object({
		elliottWavesOverlay: z.object({}).passthrough(),
		drawableWaves: z.object({}).passthrough(),
		waveMenuNumber: z.number().int(),
	})
	.strict();

function resolveDrawableWaves(input: {
	analysis?: Record<string, unknown>;
	drawableWaves?: Record<string, unknown>;
}): DrawableElliottWaveSet | null {
	if (input.drawableWaves && typeof input.drawableWaves === 'object') {
		return input.drawableWaves as DrawableElliottWaveSet;
	}
	const analysis = input.analysis;
	if (!analysis) {
		return null;
	}
	if (analysis.drawableWaves && typeof analysis.drawableWaves === 'object') {
		return analysis.drawableWaves as DrawableElliottWaveSet;
	}
	return null;
}

function stripDrawingOverlays(replay: ChartPrepareReplay): ChartPrepareReplay {
	const drawingTypes = new Set([
		'horizontal_levels',
		'pivot_levels',
		'fibonacci',
		'trend_lines',
		'chart_pattern',
		'elliott_waves',
	]);
	return {
		...replay,
		overlays: (replay.overlays ?? []).filter(o => !drawingTypes.has(o.type)),
	};
}

function indicatorOverlaysFromReplay(replay: ChartPrepareReplay): ChartOverlayInput[] {
	return (
		replay.overlays?.filter(
			o =>
				o.type !== 'horizontal_levels' &&
				o.type !== 'pivot_levels' &&
				o.type !== 'fibonacci' &&
				o.type !== 'trend_lines' &&
				o.type !== 'chart_pattern' &&
				o.type !== 'elliott_waves',
		) ?? []
	);
}

export function calculateElliottWaveDrawings(input: unknown): SdkResult<z.infer<typeof CalculateElliottWaveDrawingsOutputSchema>> {
	const parsed = ApplyElliottWaveDrawingsInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.message};
	}
	const drawable = resolveDrawableWaves({
		analysis: parsed.data.analysis as Record<string, unknown> | undefined,
		drawableWaves: parsed.data.drawableWaves as Record<string, unknown> | undefined,
	});
	if (!drawable || !drawable.waves.length) {
		return {
			ok: false,
			reason:
				'No Elliott wave geometry to draw. Pass analysis from analyze_elliott_waves with drawableWaves or bound analysis.drawableWaves.',
		};
	}
	const waveMenuNumber = parsed.data.waveMenuNumber ?? 1;
	const overlay = drawableWavesToOverlay(drawable);
	if (!overlay) {
		return {
			ok: false,
			reason: 'elliott_waves produced no drawable geometry after normalizing wave points.',
		};
	}
	return {
		ok: true,
		data: {
			elliottWavesOverlay: overlay,
			drawableWaves: drawable,
			waveMenuNumber,
		},
	};
}

export async function applyElliottWaveDrawings(
	input: unknown,
): Promise<SdkResult<PrepareChartOutput>> {
	const parsed = ApplyElliottWaveDrawingsInputSchema.safeParse(input);
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
	const indicatorOverlays = indicatorOverlaysFromReplay(baseReplay);
	let mergedOverlays: ChartOverlayInput[] = [...indicatorOverlays];

	if (parsed.data.removeElliottWaves) {
		baseReplay = stripDrawingOverlays(baseReplay);
	} else {
		const calc = calculateElliottWaveDrawings(parsed.data);
		if (!calc.ok) {
			return calc;
		}
		const overlay = calc.data.elliottWavesOverlay as Extract<ChartOverlayInput, {type: 'elliott_waves'}>;
		baseReplay = stripDrawingOverlays(baseReplay);
		mergedOverlays = [...indicatorOverlays, overlay];
	}

	const nextTitle = parsed.data.title?.trim() || 'Chart';
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
