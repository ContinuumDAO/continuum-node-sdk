import {z} from 'zod';
import type {SdkResult} from '../../result.js';
import type {ChartOverlayInput} from '../overlay-schemas.js';
import type {ChartPrepareReplay, PrepareChartOutput} from '../schemas.js';
import {
	existingHorizontalRows,
	fibExtensionLabelForPair,
	fibOverlayForPair,
	fibPairSchema,
	finishKeyDrawingChart,
	indicatorOverlaysWithoutKeyDrawings,
	keyFibOverlaysFromReplay,
	mergeFibExtensionTargetLine,
	normalizeAnalysisInput,
	prepareKeyDrawingContext,
	removeFibPairOverlay,
	stripKeyFibDrawingOverlays,
	type HorizontalLevelRow,
} from './key-level-drawings-shared.js';
import {
	pickFibPairByNumber,
	resolveFibExtensionTargetLine,
	type KeyLevelFibPair,
	type KeyLevelsTradeSetupForDraw,
} from './key-level-menu-summary.js';
import {preprocessOhlcvToolInput} from './ohlcv-input.js';

const keyFibAnalysisPickSchema = z
	.object({
		fibPairs: z.array(fibPairSchema).optional(),
		keyLevelFibTradeSetup: z.object({}).passthrough().nullable().optional(),
	})
	.passthrough();

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
				keyLevelFibTradeSetup?: KeyLevelsTradeSetupForDraw | null;
		  }
		| undefined;
	const fibPairs = analysis?.fibPairs ?? [];
	const tradeSetup = analysis?.keyLevelFibTradeSetup ?? null;
	const fibDisplayTrend =
		tradeSetup &&
		typeof tradeSetup === 'object' &&
		(tradeSetup as {displayTrend?: 'up' | 'down'}).displayTrend != null
			? (tradeSetup as {displayTrend: 'up' | 'down'}).displayTrend
			: undefined;

	let fibOverlays = keyFibOverlaysFromReplay(baseReplay);
	let extensionRows = fibExtensionRowsFromReplay(baseReplay);

	if (parsed.data.removeFibPair && parsed.data.fibPairNumber != null) {
		const pair = pickFibPairByNumber(fibPairs, parsed.data.fibPairNumber);
		if (pair) {
			baseReplay = removeFibPairOverlay(baseReplay, pair);
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
		const fibOverlay = fibOverlayForPair(pair, fibDisplayTrend);
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
	const allHorizontal = [...nonKeyHorizontal, ...levelRows, ...extensionRows];
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
