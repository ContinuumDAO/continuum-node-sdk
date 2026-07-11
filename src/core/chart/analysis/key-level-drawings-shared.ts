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
import {missingOhlcvBarsReason, preprocessOhlcvToolInput} from './ohlcv-input.js';
import {
	fibPairOverlayId,
	keyLevelMenuDisplayLabel,
	type KeyLevelFibPair,
	type KeyLevelMenuEntry,
} from './key-level-menu-summary.js';

export const keyLevelMenuEntrySchema = z
	.object({
		index: z.number().int(),
		levelNumber: z.number().int(),
		kind: z.enum(['support', 'resistance']),
		swingKind: z.enum(['support', 'resistance']),
		isRoleFlipped: z.boolean(),
		price: z.number(),
		strength: z.number(),
		touchCount: z.number(),
		distancePct: z.number(),
		isPrimary: z.boolean(),
		isNearestSupport: z.boolean(),
		isNearestResistance: z.boolean(),
	})
	.strict();

export const fibPairSchema = z
	.object({
		pairNumber: z.number().int(),
		pairKind: z.enum(['primary_range', 'concentric']),
		concentricRank: z.number().int().optional(),
		lowLevelNumber: z.number().int(),
		highLevelNumber: z.number().int(),
		low: z.number(),
		high: z.number(),
		trend: z.enum(['up', 'down']),
		retracement618: z.number(),
		extension1618Up: z.number(),
		extension1618Down: z.number(),
		isPrimaryTradePair: z.boolean().optional(),
	})
	.strict();

export type HorizontalLevelRow = {
	price: number;
	kind?: 'support' | 'resistance' | 'level';
	label?: string;
};

export function parseJsonObject(value: unknown): unknown {
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

export function normalizeAnalysisInput(analysis: unknown): unknown {
	const parsed = parseJsonObject(analysis);
	if (typeof parsed !== 'object' || parsed == null) {
		return parsed;
	}
	const record = parsed as Record<string, unknown>;
	if (record.levelMenu == null && typeof record.analysis === 'object' && record.analysis != null) {
		return record.analysis;
	}
	return parsed;
}

export function isDrawingOverlay(o: ChartOverlayInput): boolean {
	return (
		o.type === 'horizontal_levels' ||
		o.type === 'pivot_levels' ||
		o.type === 'fibonacci' ||
		o.type === 'trend_lines' ||
		o.type === 'chart_pattern'
	);
}

export function existingHorizontalRows(replay: ChartPrepareReplay): HorizontalLevelRow[] {
	const overlay = replay.overlays?.find(o => o.type === 'horizontal_levels');
	if (!overlay || overlay.type !== 'horizontal_levels') {
		return [];
	}
	return overlay.levels.map(row => ({
		price: row.price,
		...(row.kind === 'support' || row.kind === 'resistance' ? {kind: row.kind} : {}),
		...(row.label ? {label: row.label} : {}),
	}));
}

export function fibExtensionLabelForPair(pair: KeyLevelFibPair): string {
	return `Fib 1.618 ext #${pair.lowLevelNumber}-#${pair.highLevelNumber}`;
}

/** fast-technical-indicators fib: trend `down` → level 0 at range low; trend `up` → level 0 at range high. */
export function chartFibTrendForRange(fibRangeInverted?: boolean): 'up' | 'down' {
	return fibRangeInverted ? 'up' : 'down';
}

/** Chart Fib orientation from trade setup (prefer regime/sub-regime over boolean alone). */
export function resolveKeyFibChartTrend(input: {
	fibRangeInverted?: boolean;
	insideSubRegime?: 'upper_half' | 'lower_half';
	priceRegime?: 'inside_range' | 'above_range' | 'below_range';
}): 'up' | 'down' {
	if (input.priceRegime === 'below_range') {
		return 'up';
	}
	if (input.insideSubRegime === 'lower_half') {
		return 'up';
	}
	if (input.insideSubRegime === 'upper_half') {
		return 'down';
	}
	if (input.priceRegime === 'above_range') {
		return 'down';
	}
	return chartFibTrendForRange(input.fibRangeInverted);
}

const FIB_AXIS_LABEL_LEVELS = new Set([0, 0.618, 1]);

export function fibLevelShowsAxisLabel(level: number, isHighlight: boolean): boolean {
	return isHighlight && FIB_AXIS_LABEL_LEVELS.has(level);
}

export function fibOverlayForPair(
	pair: KeyLevelFibPair,
	chartTrend?: 'up' | 'down',
	fibRangeInverted = false,
): Extract<ChartOverlayInput, {type: 'fibonacci'}> {
	const id = fibPairOverlayId(pair.lowLevelNumber, pair.highLevelNumber);
	const trend = chartTrend ?? chartFibTrendForRange(fibRangeInverted);
	return {
		type: 'fibonacci',
		id,
		range: {high: pair.high, low: pair.low, trend},
		trend,
		highlightLevels: [0, 0.618, 1],
		levelStyles: {
			'0': {lineStyle: 'solid', lineWidth: 3, color: '#66BB6A'},
			'1': {lineStyle: 'solid', lineWidth: 3, color: '#42A5F5'},
			'0.618': {lineStyle: 'solid', lineWidth: 3, color: '#FFA726'},
		},
		style: {lineStyle: 'dashed', lineWidth: 2, color: '#E040FB'},
	};
}

export function stripKeyLevelHorizontalRows(rows: HorizontalLevelRow[]): HorizontalLevelRow[] {
	return rows.filter(
		row => !row.label?.startsWith('Level #') && !row.label?.startsWith('Fib 1.618 ext #'),
	);
}

export function stripKeyLevelDrawingOverlays(replay: ChartPrepareReplay): ChartPrepareReplay {
	if (!replay.overlays?.length) {
		return replay;
	}
	const kept = replay.overlays.filter(o => {
		if (o.type === 'horizontal_levels') {
			const levels = o.levels.filter(
				row => !row.label?.startsWith('Level #') && !row.label?.startsWith('Fib 1.618 ext #'),
			);
			return levels.length > 0;
		}
		if (o.type === 'fibonacci') {
			return !String(o.id ?? '').startsWith('KeyFib #');
		}
		return !isDrawingOverlay(o);
	});
	return {...replay, overlays: kept};
}

export function stripKeyFibDrawingOverlays(replay: ChartPrepareReplay): ChartPrepareReplay {
	if (!replay.overlays?.length) {
		return replay;
	}
	const kept = replay.overlays
		.map(o => {
			if (o.type === 'fibonacci' && String(o.id ?? '').startsWith('KeyFib #')) {
				return null;
			}
			if (o.type === 'horizontal_levels') {
				const levels = o.levels.filter(row => !row.label?.startsWith('Fib 1.618 ext #'));
				return levels.length > 0 ? {...o, levels} : null;
			}
			return o;
		})
		.filter((o): o is ChartOverlayInput => o != null);
	return {...replay, overlays: kept};
}

export function removeFibPairOverlay(replay: ChartPrepareReplay, pair: KeyLevelFibPair): ChartPrepareReplay {
	const fibId = fibPairOverlayId(pair.lowLevelNumber, pair.highLevelNumber);
	const extLabel = fibExtensionLabelForPair(pair);
	const overlays = (replay.overlays ?? [])
		.map(o => {
			if (o.type === 'fibonacci' && String(o.id ?? '') === fibId) {
				return null;
			}
			if (o.type === 'horizontal_levels') {
				return {
					...o,
					levels: o.levels.filter(row => row.label !== extLabel),
				};
			}
			return o;
		})
		.filter((o): o is ChartOverlayInput => o != null && (o.type !== 'horizontal_levels' || o.levels.length > 0));
	return {...replay, overlays};
}

export function mergeFibExtensionTargetLine(
	existing: HorizontalLevelRow[],
	extension: {price: number; label: string},
): HorizontalLevelRow[] {
	const without = existing.filter(row => row.label !== extension.label);
	return [...without, {price: extension.price, kind: 'level' as const, label: extension.label}];
}

export function keyFibOverlaysFromReplay(
	replay: ChartPrepareReplay,
): Extract<ChartOverlayInput, {type: 'fibonacci'}>[] {
	return (
		replay.overlays?.filter(
			(o): o is Extract<ChartOverlayInput, {type: 'fibonacci'}> =>
				o.type === 'fibonacci' && String(o.id ?? '').startsWith('KeyFib #'),
		) ?? []
	);
}

export function indicatorOverlaysWithoutKeyDrawings(
	replay: ChartPrepareReplay,
	options?: {stripLevelHorizontals?: boolean; stripFibOverlays?: boolean},
): ChartOverlayInput[] {
	const stripLevels = options?.stripLevelHorizontals === true;
	const stripFib = options?.stripFibOverlays === true;
	return (
		replay.overlays
			?.map(o => {
				if (o.type === 'horizontal_levels') {
					const levels = o.levels.filter(row => {
						const label = row.label ?? '';
						if (stripLevels && label.startsWith('Level #')) {
							return false;
						}
						if (label.startsWith('Fib 1.618 ext #')) {
							return false;
						}
						return true;
					});
					if (levels.length === 0) {
						return null;
					}
					const hasNonKeyRow = levels.some(
						row =>
							!row.label?.startsWith('Level #') && !row.label?.startsWith('Fib 1.618 ext #'),
					);
					if (!hasNonKeyRow) {
						return null;
					}
					return levels.length === o.levels.length ? o : {...o, levels};
				}
				if (o.type === 'fibonacci' && stripFib && String(o.id ?? '').startsWith('KeyFib #')) {
					return null;
				}
				return isDrawingOverlay(o) ? null : o;
			})
			.filter((o): o is ChartOverlayInput => o != null) ?? []
	);
}

export function stripFibExtensionRows(rows: HorizontalLevelRow[]): HorizontalLevelRow[] {
	return rows.filter(row => !row.label?.startsWith('Fib 1.618 ext #'));
}

export type PrepareKeyDrawingContext = {
	parsed: {
		title?: string;
		label?: string;
		toolResult?: unknown;
		rows?: unknown[];
		prepareReplay?: unknown;
		live?: unknown;
	};
	rawBars: Record<string, unknown>[];
	baseReplay: ChartPrepareReplay;
	integrityFingerprint?: unknown;
	preparedFingerprint?: unknown;
};

export async function prepareKeyDrawingContext(
	input: unknown,
	options: {allowRowsOnly?: boolean},
): Promise<SdkResult<PrepareKeyDrawingContext>> {
	const parsed = input as PrepareKeyDrawingContext['parsed'];
	const chartContext = rejectApplyPatternDrawingsWithoutChartContext(parsed);
	if (!chartContext.ok) {
		return chartContext;
	}

	const prepared = await prepareOhlcvBarsForAnalysis({
		...parsed,
		allowRowsOnly: options.allowRowsOnly ?? Boolean(parsed.prepareReplay),
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
				missingOhlcvBarsReason(parsed) +
				' Use the same fetch JSON as the original chart — do not substitute analysis JSON or market snapshot.',
		};
	}

	if (parsed.toolResult != null) {
		const windowCheck = validateOhlcvBarsFromToolResult(rawBars, parsed.toolResult, parsed.title);
		if (!windowCheck.ok) {
			return windowCheck;
		}
	}

	const integrity = runOhlcvIntegrityPipeline(rawBars, {
		toolResult: parsed.toolResult,
		rows: parsed.rows,
		allowRowsOnly: options.allowRowsOnly ?? Boolean(parsed.prepareReplay),
	});
	if (!integrity.ok) {
		return integrity;
	}

	return {
		ok: true,
		data: {
			parsed,
			rawBars,
			baseReplay: (parsed.prepareReplay as ChartPrepareReplay | undefined) ?? {},
			integrityFingerprint: integrity.data.fingerprint ?? undefined,
			preparedFingerprint: prepared.data.fingerprint ?? undefined,
		},
	};
}

export function finishKeyDrawingChart(input: {
	ctx: PrepareKeyDrawingContext;
	mergedOverlays: ChartOverlayInput[];
	baseReplay: ChartPrepareReplay;
	titleSuffix?: string;
}): SdkResult<PrepareChartOutput> {
	const {ctx, mergedOverlays, baseReplay, titleSuffix} = input;
	const indicatorOverlays = indicatorOverlaysWithoutKeyDrawings(baseReplay);
	const skipDefaults =
		baseReplay.skipDefaultOverlays === true ||
		baseReplay.usedDefaultOverlays === true ||
		indicatorOverlays.length > 0;

	const baseTitle = ctx.parsed.title?.trim() || 'Chart';
	const nextTitle =
		titleSuffix && !baseTitle.includes(titleSuffix) ? `${baseTitle} — ${titleSuffix}` : baseTitle;

	const chartResult = prepareChart({
		title: nextTitle,
		bars: ctx.rawBars,
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
		ctx.parsed.live != null
			? (ctx.parsed.live as ChartLiveBinding)
			: ctx.parsed.toolResult != null
				? extractLiveBindingFromFetchPayload(ctx.parsed.toolResult, {
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
			ctx.rawBars,
			{
				toolResult: ctx.parsed.toolResult,
				title: ctx.parsed.title ?? nextTitle,
				ohlcvFingerprint:
					(ctx.integrityFingerprint as import('../ohlcv-integrity.js').OhlcvFingerprint | undefined) ??
					(ctx.preparedFingerprint as import('../ohlcv-integrity.js').OhlcvFingerprint | undefined) ??
					undefined,
			},
		),
	};
}

export function mergeHorizontalLevel(
	existing: HorizontalLevelRow[],
	entry: KeyLevelMenuEntry,
): HorizontalLevelRow[] {
	const label = keyLevelMenuDisplayLabel(entry.kind, entry.levelNumber, entry.price, entry.swingKind);
	const without = existing.filter(row => row.label !== label);
	return [
		...without,
		{
			price: entry.price,
			kind: entry.kind,
			label,
		},
	].slice(-16);
}
