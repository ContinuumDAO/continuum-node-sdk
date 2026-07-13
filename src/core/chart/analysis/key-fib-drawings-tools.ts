import {z} from 'zod';
import type {SdkResult} from '../../result.js';
import type {ChartOverlayInput} from '../overlay-schemas.js';
import type {ChartPrepareReplay, PrepareChartOutput} from '../schemas.js';
import {
	existingHorizontalRows,
	fibExtensionLabelForPair,
	fibOverlayForPair,
	fibPairSchema,
	resolveKeyFibChartTrend,
	finishKeyDrawingChart,
	indicatorOverlaysWithoutKeyDrawings,
	keyFibOverlaysFromReplay,
	mergeFibExtensionTargetLine,
	mergeHorizontalLevel,
	normalizeAnalysisInput,
	prepareKeyDrawingContext,
	removeFibPairOverlay,
	stripKeyFibDrawingOverlays,
	type HorizontalLevelRow,
} from './key-level-drawings-shared.js';
import {
	pickFibPairByNumber,
	pickKeyLevelByNumber,
	keyLevelMenuDisplayLabel,
	resolveChartFibTrendForClose,
	resolveFibExtensionTargetLine,
	type KeyLevelFibPair,
	type KeyLevelMenuEntry,
	type KeyLevelsTradeSetupForDraw,
} from './key-level-menu-summary.js';
import {preprocessOhlcvToolInput} from './ohlcv-input.js';

const keyFibAnalysisPickSchema = z
	.object({
		fibPairs: z.array(fibPairSchema).optional(),
		levelMenu: z.array(z.object({}).passthrough()).optional(),
		keyLevelFibTradeSetup: z.object({}).passthrough().nullable().optional(),
		lastClose: z.number().optional(),
	})
	.passthrough();

function resolveFibApplyChartTrend(
	pair: KeyLevelFibPair,
	tradeSetup: KeyLevelsTradeSetupForDraw | null | undefined,
	lastClose?: number,
): 'up' | 'down' {
	if (
		tradeSetup?.priceRegime != null ||
		tradeSetup?.insideSubRegime != null ||
		tradeSetup?.fibRangeInverted != null
	) {
		return resolveKeyFibChartTrend({
			fibRangeInverted: tradeSetup?.fibRangeInverted,
			insideSubRegime: tradeSetup?.insideSubRegime,
			priceRegime: tradeSetup?.priceRegime,
		});
	}
	if (lastClose != null && Number.isFinite(lastClose)) {
		return resolveChartFibTrendForClose(lastClose, pair.low, pair.high, pair.retracement618);
	}
	return pair.chartFibTrend;
}

function preprocessApplyKeyFibDrawingsInput(raw: unknown): unknown {
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

export const ApplyKeyFibDrawingsInputSchema = z.preprocess(
	preprocessApplyKeyFibDrawingsInput,
	z
		.object({
			title: z.string().trim().min(1).max(256).optional(),
			label: z.string().trim().min(1).max(128).optional(),
			toolResult: z.unknown().optional(),
			rows: z.array(z.unknown()).min(1).optional(),
			prepareReplay: z.unknown().optional(),
			live: z.unknown().optional(),
			fibPairNumber: z.number().int().min(1).max(32).optional(),
			removeFibPair: z.boolean().optional(),
			removeAllFibPairs: z.boolean().optional(),
			analysis: keyFibAnalysisPickSchema.optional(),
		})
		.strict(),
);

function fibExtensionRowsFromReplay(replay: ChartPrepareReplay): HorizontalLevelRow[] {
	return existingHorizontalRows(replay).filter(row => row.label?.startsWith('Fib 1.618 ext #'));
}

/** Fib apply/remove never reads or writes nearest Level # horizontals. */
export async function applyKeyFibDrawings(input: unknown): Promise<SdkResult<PrepareChartOutput>> {
	const parsed = ApplyKeyFibDrawingsInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.message};
	}

	const ctxResult = await prepareKeyDrawingContext(parsed.data, {
		allowRowsOnly: Boolean(parsed.data.prepareReplay),
	});
	if (!ctxResult.ok) {
		return ctxResult;
	}
	const ctx = ctxResult.data;

	let baseReplay = ctx.baseReplay;
	if (parsed.data.removeAllFibPairs) {
		baseReplay = stripKeyFibDrawingOverlays(baseReplay);
	}

	const analysis = parsed.data.analysis as
		| {
				fibPairs?: KeyLevelFibPair[];
				levelMenu?: KeyLevelMenuEntry[];
				keyLevelFibTradeSetup?: KeyLevelsTradeSetupForDraw | null;
				lastClose?: number;
		  }
		| undefined;
	const fibPairs = analysis?.fibPairs ?? [];
	const levelMenu = analysis?.levelMenu ?? [];
	const tradeSetup = analysis?.keyLevelFibTradeSetup ?? null;

	let fibOverlays = keyFibOverlaysFromReplay(baseReplay);
	let extensionRows = fibExtensionRowsFromReplay(baseReplay);

	if (parsed.data.removeFibPair && parsed.data.fibPairNumber != null) {
		const pair = pickFibPairByNumber(fibPairs, parsed.data.fibPairNumber);
		if (pair) {
			baseReplay = removeFibPairOverlay(baseReplay, pair);
			const legLabels = new Set<string>();
			const lowRow = pickKeyLevelByNumber(levelMenu, pair.lowLevelNumber);
			const highRow = pickKeyLevelByNumber(levelMenu, pair.highLevelNumber);
			if (lowRow) {
				legLabels.add(
					keyLevelMenuDisplayLabel(lowRow.kind, lowRow.levelNumber, lowRow.price, lowRow.swingKind),
				);
			}
			if (highRow) {
				legLabels.add(
					keyLevelMenuDisplayLabel(highRow.kind, highRow.levelNumber, highRow.price, highRow.swingKind),
				);
			}
			if (legLabels.size > 0) {
				const overlays = (baseReplay.overlays ?? []).map(o => {
					if (o.type !== 'horizontal_levels') {
						return o;
					}
					const levels = o.levels.filter(row => !legLabels.has(row.label ?? ''));
					return levels.length > 0 ? {...o, levels} : null;
				}).filter((o): o is ChartOverlayInput => o != null);
				baseReplay = {...baseReplay, overlays};
			}
		}
		fibOverlays = keyFibOverlaysFromReplay(baseReplay);
		extensionRows = fibExtensionRowsFromReplay(baseReplay);
	} else if (!parsed.data.removeAllFibPairs) {
		const fibPairNumber = parsed.data.fibPairNumber;
		if (fibPairNumber == null) {
			return {
				ok: false,
				reason:
					'No Fib range to apply. Pass fibPairNumber from analyze_key_level_fibonacci fibPairs (explicit — no auto-apply of primaryFibPair).',
			};
		}
		const pair = pickFibPairByNumber(fibPairs, fibPairNumber);
		if (!pair) {
			return {
				ok: false,
				reason: `Fib pair #${fibPairNumber} not found in bound analysis.fibPairs.`,
			};
		}
		const chartTrend = resolveFibApplyChartTrend(pair, tradeSetup, analysis?.lastClose);
		const fibOverlay = fibOverlayForPair(pair, chartTrend);
		fibOverlays = fibOverlays.filter(o => o.id !== fibOverlay.id);
		fibOverlays.push(fibOverlay);
		const extensionLine = resolveFibExtensionTargetLine(tradeSetup, pair);
		if (extensionLine) {
			extensionRows = mergeFibExtensionTargetLine(
				extensionRows.filter(row => row.label !== fibExtensionLabelForPair(pair)),
				extensionLine,
			);
		} else {
			extensionRows = extensionRows.filter(row => row.label !== fibExtensionLabelForPair(pair));
		}
	}

	const indicatorOverlays = indicatorOverlaysWithoutKeyDrawings(baseReplay, {
		stripFibOverlays: true,
	});
	const existingRows = existingHorizontalRows(baseReplay);
	const levelRows = existingRows.filter(row => row.label?.startsWith('Level #'));
	const nonKeyHorizontal = existingRows.filter(
		row => !row.label?.startsWith('Level #') && !row.label?.startsWith('Fib 1.618 ext #'),
	);
	const fibLegRows =
		parsed.data.removeAllFibPairs || parsed.data.removeFibPair
			? []
			: (() => {
					const fibPairNumber = parsed.data.fibPairNumber;
					if (fibPairNumber == null) {
						return [] as HorizontalLevelRow[];
					}
					const pair = pickFibPairByNumber(fibPairs, fibPairNumber);
					if (!pair) {
						return [] as HorizontalLevelRow[];
					}
					let rows: HorizontalLevelRow[] = [];
					const lowRow = pickKeyLevelByNumber(levelMenu, pair.lowLevelNumber);
					const highRow = pickKeyLevelByNumber(levelMenu, pair.highLevelNumber);
					if (lowRow) {
						rows = mergeHorizontalLevel(rows, lowRow);
					}
					if (highRow) {
						rows = mergeHorizontalLevel(rows, highRow);
					}
					return rows;
				})();
	const mergedLegLabels = new Set(fibLegRows.map(row => row.label));
	const levelRowsWithoutFibLegs = levelRows.filter(row => !mergedLegLabels.has(row.label ?? ''));
	const allHorizontal = [...nonKeyHorizontal, ...levelRowsWithoutFibLegs, ...fibLegRows, ...extensionRows];
	const mergedOverlays: ChartOverlayInput[] = [...indicatorOverlays];
	if (allHorizontal.length > 0) {
		mergedOverlays.push({
			type: 'horizontal_levels',
			levels: allHorizontal,
			style: {lineStyle: 'solid', lineWidth: 3},
		});
	}
	mergedOverlays.push(...fibOverlays);

	const titleSuffix =
		parsed.data.removeAllFibPairs || parsed.data.removeFibPair
			? undefined
			: parsed.data.fibPairNumber != null
				? `Fib #${parsed.data.fibPairNumber}`
				: undefined;

	return finishKeyDrawingChart({
		ctx: {...ctx, baseReplay},
		mergedOverlays,
		baseReplay,
		titleSuffix,
	});
}
