import {z} from 'zod';
import type {SdkResult} from '../../result.js';
import type {ChartOverlayInput} from '../overlay-schemas.js';
import type {PrepareChartOutput} from '../schemas.js';
import {
	existingHorizontalRows,
	fibOverlayForPair,
	fibPairSchema,
	resolveKeyFibChartTrend,
	finishKeyDrawingChart,
	indicatorOverlaysWithoutKeyDrawings,
	keyFibOverlaysFromReplay,
	mergeHorizontalLevel,
	normalizeAnalysisInput,
	prepareKeyDrawingContext,
	removeFibPairOverlay,
	stripKeyFibDrawingOverlays,
	type HorizontalLevelRow,
} from './key-level-drawings-shared.js';
import {stripTradePositionFromReplay} from '../trade-position-replay.js';
import {
	pickFibPairByNumber,
	pickKeyLevelByNumber,
	keyLevelMenuDisplayLabel,
	resolveChartFibTrendForClose,
	type KeyLevelFibPair,
	type KeyLevelMenuEntry,
	type KeyLevelsTradeSetupForDraw,
} from './key-level-menu-summary.js';
import {buildKeyLevelFibRetraceTradeSetup} from './trade-setups/key-level-fib-retrace-trade-setup.js';
import {lastCloseFromBars} from './key-levels-dataset.js';
import type {TradeSetupLevelsSource} from './trade-setups/trade-position-overlay.js';
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

/**
 * Trade Ratio graphic must follow the Fib pair being drawn — not the analysis
 * primary `keyLevelFibTradeSetup` (often a different fibPairs row).
 */
export function tradeSetupForAppliedKeyFib(input: {
	fibPairNumber?: number;
	analysis?: {
		fibPairs?: KeyLevelFibPair[];
		levelMenu?: KeyLevelMenuEntry[];
		keyLevelFibTradeSetup?: KeyLevelsTradeSetupForDraw | null;
		lastClose?: number;
	};
	rawBars: Record<string, unknown>[];
}): TradeSetupLevelsSource | null {
	const fibPairs = input.analysis?.fibPairs ?? [];
	const levelMenu = input.analysis?.levelMenu ?? [];
	const fibPairNumber = input.fibPairNumber;
	if (fibPairNumber == null || !fibPairs.length || !levelMenu.length) {
		return (input.analysis?.keyLevelFibTradeSetup as TradeSetupLevelsSource | null | undefined) ?? null;
	}
	const lastClose =
		typeof input.analysis?.lastClose === 'number' && Number.isFinite(input.analysis.lastClose)
			? input.analysis.lastClose
			: lastCloseFromBars(input.rawBars);
	if (lastClose == null) {
		return (input.analysis?.keyLevelFibTradeSetup as TradeSetupLevelsSource | null | undefined) ?? null;
	}
	return buildKeyLevelFibRetraceTradeSetup({
		lastClose,
		levelMenu,
		fibPairs,
		bars: input.rawBars,
		fibPairNumber,
	});
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
			omitTradeRatio: z.boolean().optional(),
			protocolId: z.string().trim().min(1).max(64).optional(),
		})
		.strict(),
);

/** Fib apply/remove draws 0 / 0.618 / 1 overlay plus bracket leg horizontals. */
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
		baseReplay = stripTradePositionFromReplay(stripKeyFibDrawingOverlays(baseReplay));
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
	let tradeSetup: TradeSetupLevelsSource | null = null;

	let fibOverlays = keyFibOverlaysFromReplay(baseReplay);

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
		tradeSetup = tradeSetupForAppliedKeyFib({
			fibPairNumber,
			analysis,
			rawBars: ctx.rawBars,
		});
		const chartTrend = resolveFibApplyChartTrend(
			pair,
			tradeSetup as KeyLevelsTradeSetupForDraw | null,
			analysis?.lastClose ?? lastCloseFromBars(ctx.rawBars) ?? undefined,
		);
		const fibOverlay = fibOverlayForPair(pair, chartTrend);
		fibOverlays = fibOverlays.filter(o => o.id !== fibOverlay.id);
		fibOverlays.push(fibOverlay);
	}

	const indicatorOverlays = indicatorOverlaysWithoutKeyDrawings(baseReplay, {
		stripFibOverlays: true,
	});
	const existingRows = existingHorizontalRows(baseReplay);
	const levelRows = existingRows.filter(row => row.label?.startsWith('Level #'));
	const nonKeyHorizontal = existingRows.filter(row => !row.label?.startsWith('Level #'));
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
	const allHorizontal = [...nonKeyHorizontal, ...levelRowsWithoutFibLegs, ...fibLegRows];
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
		tradeSetup,
		omitTradeRatio: parsed.data.omitTradeRatio,
		protocolId: parsed.data.protocolId,
		stripTradePosition:
			parsed.data.removeAllFibPairs || Boolean(parsed.data.removeFibPair),
	});
}
