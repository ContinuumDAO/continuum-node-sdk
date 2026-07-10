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
import {
	buildKeyLevelMenu,
	fibPairForLevel,
	fibPairOverlayId,
	keyLevelMenuLabel,
	pickKeyLevelByNumber,
	resolveFibExtensionTargetLine,
	type KeyLevelFibPair,
	type KeyLevelMenuEntry,
	type KeyLevelsTradeSetupForDraw,
} from './key-level-menu-summary.js';

const keyLevelMenuEntrySchema = z
	.object({
		index: z.number().int(),
		levelNumber: z.number().int(),
		kind: z.enum(['support', 'resistance']),
		price: z.number(),
		strength: z.number(),
		touchCount: z.number(),
		distancePct: z.number(),
		isPrimary: z.boolean(),
		isNearestSupport: z.boolean(),
		isNearestResistance: z.boolean(),
	})
	.strict();

const fibPairSchema = z
	.object({
		pairNumber: z.number().int(),
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

const keyLevelsAnalysisPickSchema = z
	.object({
		levelMenu: z.array(keyLevelMenuEntrySchema).optional(),
		fibPairs: z.array(fibPairSchema).optional(),
		levels: z.array(z.object({}).passthrough()).optional(),
		keyLevelsTradeSetup: z.object({}).passthrough().nullable().optional(),
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
	if (record.levelMenu == null && typeof record.analysis === 'object' && record.analysis != null) {
		return record.analysis;
	}
	return parsed;
}

function preprocessApplyKeyLevelDrawingsInput(raw: unknown): unknown {
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

export const ApplyKeyLevelDrawingsInputSchema = z.preprocess(
	preprocessApplyKeyLevelDrawingsInput,
	z
		.object({
			title: z.string().trim().min(1).max(256).optional(),
			label: z.string().trim().min(1).max(128).optional(),
			toolResult: z.unknown().optional(),
			rows: z.array(z.unknown()).min(1).optional(),
			prepareReplay: z.unknown().optional(),
			live: z.unknown().optional(),
			levelNumber: z.number().int().min(1).max(64).optional(),
			removeLevel: z.boolean().optional(),
			removeAllLevels: z.boolean().optional(),
			includeFibPair: z.boolean().optional(),
			analysis: keyLevelsAnalysisPickSchema.optional(),
		})
		.strict(),
);

type HorizontalLevelRow = {
	price: number;
	kind?: 'support' | 'resistance' | 'level';
	label?: string;
};

function isDrawingOverlay(o: ChartOverlayInput): boolean {
	return (
		o.type === 'horizontal_levels' ||
		o.type === 'pivot_levels' ||
		o.type === 'fibonacci' ||
		o.type === 'trend_lines' ||
		o.type === 'chart_pattern'
	);
}

function existingHorizontalRows(replay: ChartPrepareReplay): HorizontalLevelRow[] {
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

function mergeFibExtensionTargetLine(
	existing: HorizontalLevelRow[],
	extension: {price: number; label: string},
): HorizontalLevelRow[] {
	const without = existing.filter(row => row.label !== extension.label);
	return [...without, {price: extension.price, kind: 'level' as const, label: extension.label}];
}

function fibExtensionLabelForPair(pair: KeyLevelFibPair): string {
	return `Fib 1.618 ext #${pair.lowLevelNumber}-#${pair.highLevelNumber}`;
}

function stripFibExtensionRows(rows: HorizontalLevelRow[]): HorizontalLevelRow[] {
	return rows.filter(row => !row.label?.startsWith('Fib 1.618 ext #'));
}

function mergeHorizontalLevel(
	existing: HorizontalLevelRow[],
	entry: KeyLevelMenuEntry,
): HorizontalLevelRow[] {
	const label = keyLevelMenuLabel(entry.kind, entry.levelNumber, entry.price);
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

function fibOverlayForPair(pair: KeyLevelFibPair): Extract<ChartOverlayInput, {type: 'fibonacci'}> {
	const id = fibPairOverlayId(pair.lowLevelNumber, pair.highLevelNumber);
	return {
		type: 'fibonacci',
		id,
		range: {high: pair.high, low: pair.low, trend: pair.trend},
		highlightLevels: [0, 0.618, 1],
		levelStyles: {
			'0': {lineStyle: 'solid', lineWidth: 3, color: '#66BB6A'},
			'1': {lineStyle: 'solid', lineWidth: 3, color: '#42A5F5'},
			'0.618': {lineStyle: 'solid', lineWidth: 3, color: '#FFA726'},
		},
		style: {lineStyle: 'dotted', lineWidth: 1, color: '#88888866'},
	};
}

function stripKeyLevelDrawingOverlays(replay: ChartPrepareReplay): ChartPrepareReplay {
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

function removeKeyLevelOverlays(replay: ChartPrepareReplay, levelNumber: number): ChartPrepareReplay {
	const prefix = `Level #${levelNumber} `;
	const fibPrefix = `#${levelNumber}-`;
	const extPrefix = `Fib 1.618 ext #${levelNumber}-`;
	const extSuffix = `-#${levelNumber}`;
	const overlays = (replay.overlays ?? [])
		.map(o => {
			if (o.type === 'horizontal_levels') {
				return {
					...o,
					levels: o.levels.filter(row => {
						const label = row.label ?? '';
						if (label.startsWith(prefix)) {
							return false;
						}
						if (label.startsWith(extPrefix) || label.endsWith(extSuffix)) {
							return false;
						}
						return true;
					}),
				};
			}
			if (o.type === 'fibonacci' && String(o.id ?? '').includes(fibPrefix)) {
				return null;
			}
			return o;
		})
		.filter((o): o is ChartOverlayInput => o != null && (o.type !== 'horizontal_levels' || o.levels.length > 0));
	return {...replay, overlays};
}

export async function applyKeyLevelDrawings(input: unknown): Promise<SdkResult<PrepareChartOutput>> {
	const parsed = ApplyKeyLevelDrawingsInputSchema.safeParse(input);
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
	if (parsed.data.removeAllLevels) {
		baseReplay = stripKeyLevelDrawingOverlays(baseReplay);
	}

	const analysis = parsed.data.analysis as
		| {
				levelMenu?: KeyLevelMenuEntry[];
				fibPairs?: KeyLevelFibPair[];
				keyLevelsTradeSetup?: KeyLevelsTradeSetupForDraw | null;
		  }
		| undefined;
	const menu = analysis?.levelMenu ?? [];
	const fibPairs = analysis?.fibPairs ?? [];
	const tradeSetup = analysis?.keyLevelsTradeSetup ?? null;

	let horizontalRows = stripFibExtensionRows(
		existingHorizontalRows(baseReplay).filter(row => row.label?.startsWith('Level #')),
	);
	let fibOverlays =
		baseReplay.overlays?.filter(
			(o): o is Extract<ChartOverlayInput, {type: 'fibonacci'}> =>
				o.type === 'fibonacci' && String(o.id ?? '').startsWith('KeyFib #'),
		) ?? [];

	if (parsed.data.removeLevel && parsed.data.levelNumber != null) {
		baseReplay = removeKeyLevelOverlays(baseReplay, parsed.data.levelNumber);
		horizontalRows = existingHorizontalRows(baseReplay).filter(
			row => row.label?.startsWith('Level #') || row.label?.startsWith('Fib 1.618 ext #'),
		);
		fibOverlays =
			baseReplay.overlays?.filter(
				(o): o is Extract<ChartOverlayInput, {type: 'fibonacci'}> =>
					o.type === 'fibonacci' && String(o.id ?? '').startsWith('KeyFib #'),
			) ?? [];
	} else if (!parsed.data.removeAllLevels) {
		const entry = pickKeyLevelByNumber(menu, parsed.data.levelNumber ?? 1);
		if (!entry) {
			return {
				ok: false,
				reason:
					'No key level to apply. Pass levelNumber from analyze_key_levels levelMenu with bound analysis.',
			};
		}
		horizontalRows = mergeHorizontalLevel(horizontalRows, entry);
		const includeFib = parsed.data.includeFibPair !== false;
		if (includeFib) {
			const pair =
				fibPairForLevel(fibPairs, entry.levelNumber) ??
				fibPairs.find(p => p.isPrimaryTradePair) ??
				null;
			if (pair) {
				const fibOverlay = fibOverlayForPair(pair);
				fibOverlays = fibOverlays.filter(o => o.id !== fibOverlay.id);
				fibOverlays.push(fibOverlay);
				const extensionLine = resolveFibExtensionTargetLine(tradeSetup, pair);
				if (extensionLine) {
					horizontalRows = mergeFibExtensionTargetLine(horizontalRows, extensionLine);
				} else {
					horizontalRows = horizontalRows.filter(row => row.label !== fibExtensionLabelForPair(pair));
				}
			}
		}
	}

	const indicatorOverlays =
		baseReplay.overlays?.filter(o => {
			if (o.type === 'horizontal_levels') {
				return o.levels.some(
					row =>
						!row.label?.startsWith('Level #') && !row.label?.startsWith('Fib 1.618 ext #'),
				);
			}
			if (o.type === 'fibonacci') {
				return !String(o.id ?? '').startsWith('KeyFib #');
			}
			return !isDrawingOverlay(o);
		}) ?? [];

	const mergedOverlays: ChartOverlayInput[] = [...indicatorOverlays];
	const nonKeyHorizontal = existingHorizontalRows(baseReplay).filter(
		row => !row.label?.startsWith('Level #') && !row.label?.startsWith('Fib 1.618 ext #'),
	);
	const allHorizontal = [...nonKeyHorizontal, ...horizontalRows];
	if (allHorizontal.length > 0) {
		mergedOverlays.push({
			type: 'horizontal_levels',
			levels: allHorizontal,
			style: {lineStyle: 'solid', lineWidth: 3},
		});
	}
	mergedOverlays.push(...fibOverlays);

	const titleSuffix =
		parsed.data.removeAllLevels || parsed.data.removeLevel
			? undefined
			: parsed.data.levelNumber != null
				? `Level #${parsed.data.levelNumber}`
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

export {buildKeyLevelMenu};
