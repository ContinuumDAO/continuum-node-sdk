import {z} from 'zod';
import type {SdkResult} from '../../result.js';
import type {ChartOverlayInput} from '../overlay-schemas.js';
import type {PrepareChartOutput} from '../schemas.js';
import {
	existingHorizontalRows,
	finishKeyDrawingChart,
	indicatorOverlaysWithoutKeyDrawings,
	keyFibOverlaysFromReplay,
	keyLevelMenuEntrySchema,
	mergeHorizontalLevel,
	normalizeAnalysisInput,
	prepareKeyDrawingContext,
	stripFibExtensionRows,
	stripKeyLevelDrawingOverlays,
	stripKeyLevelHorizontalRows,
	type HorizontalLevelRow,
} from './key-level-drawings-shared.js';
import {
	pickKeyLevelByNumber,
	resolveNextLevelTargetForDraw,
	nextLevelTargetLineLabel,
	type KeyLevelMenuEntry,
	type KeyLevelsTradeSetupForDraw,
} from './key-level-menu-summary.js';
import {preprocessOhlcvToolInput} from './ohlcv-input.js';

const keyLevelsAnalysisPickSchema = z
	.object({
		levelMenu: z.array(keyLevelMenuEntrySchema).optional(),
		levels: z.array(z.object({}).passthrough()).optional(),
		keyLevelsTradeSetup: z.object({}).passthrough().nullable().optional(),
	})
	.passthrough();

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
			analysis: keyLevelsAnalysisPickSchema.optional(),
		})
		.strict(),
);

function mergeTargetLevelLine(
	existing: HorizontalLevelRow[],
	input: {price: number; label: string},
): HorizontalLevelRow[] {
	const without = existing.filter(row => row.label !== input.label);
	return [...without, {price: input.price, kind: 'level' as const, label: input.label}];
}

function mergeTradeSetupTargetLevels(
	existing: HorizontalLevelRow[],
	menu: KeyLevelMenuEntry[],
	setup: KeyLevelsTradeSetupForDraw | null | undefined,
	appliedLevelNumber: number | undefined,
): HorizontalLevelRow[] {
	const targetRow = resolveNextLevelTargetForDraw(menu, setup, appliedLevelNumber);
	if (targetRow) {
		return mergeHorizontalLevel(existing, targetRow);
	}
	if (
		setup &&
		appliedLevelNumber != null &&
		(setup.levelNumber == null || setup.levelNumber === appliedLevelNumber) &&
		setup.targetSource === 'next_level' &&
		setup.targetPrice != null &&
		Number.isFinite(setup.targetPrice)
	) {
		return mergeTargetLevelLine(existing, {
			price: setup.targetPrice,
			label: nextLevelTargetLineLabel(setup),
		});
	}
	return existing;
}

function removeKeyLevelOverlays(replay: import('../schemas.js').ChartPrepareReplay, levelNumber: number) {
	const prefix = `Level #${levelNumber} `;
	const overlays = (replay.overlays ?? [])
		.map(o => {
			if (o.type === 'horizontal_levels') {
				return {
					...o,
					levels: o.levels.filter(row => !(row.label ?? '').startsWith(prefix)),
				};
			}
			return o;
		})
		.filter((o): o is ChartOverlayInput => o != null && (o.type !== 'horizontal_levels' || o.levels.length > 0));
	return {...replay, overlays};
}

/** Nearest key level horizontal lines only — no Fib overlays (use apply_key_fib_drawings). */
export async function applyKeyLevelDrawings(input: unknown): Promise<SdkResult<PrepareChartOutput>> {
	const parsed = ApplyKeyLevelDrawingsInputSchema.safeParse(input);
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
	if (parsed.data.removeAllLevels) {
		baseReplay = stripKeyLevelDrawingOverlays(baseReplay);
	}

	const analysis = parsed.data.analysis as
		| {
				levelMenu?: KeyLevelMenuEntry[];
				keyLevelsTradeSetup?: KeyLevelsTradeSetupForDraw | null;
		  }
		| undefined;
	const menu = analysis?.levelMenu ?? [];

	let horizontalRows: HorizontalLevelRow[] = stripFibExtensionRows(
		stripKeyLevelHorizontalRows(existingHorizontalRows(baseReplay)),
	);
	const fibOverlays = keyFibOverlaysFromReplay(baseReplay);

	if (parsed.data.removeLevel && parsed.data.levelNumber != null) {
		baseReplay = removeKeyLevelOverlays(baseReplay, parsed.data.levelNumber);
		horizontalRows = stripFibExtensionRows(
			stripKeyLevelHorizontalRows(existingHorizontalRows(baseReplay)),
		);
	} else if (!parsed.data.removeAllLevels) {
		const entry =
			parsed.data.levelNumber != null
				? pickKeyLevelByNumber(menu, parsed.data.levelNumber)
				: undefined;
		if (!entry) {
			return {
				ok: false,
				reason:
					'No key level to apply. Pass levelNumber from analyze_key_levels levelMenu. For Fib ranges use apply_key_fib_drawings.',
			};
		}
		horizontalRows = mergeHorizontalLevel(horizontalRows, entry);
		horizontalRows = mergeTradeSetupTargetLevels(
			horizontalRows,
			menu,
			analysis?.keyLevelsTradeSetup ?? null,
			parsed.data.levelNumber ?? undefined,
		);
	}

	const indicatorOverlays = indicatorOverlaysWithoutKeyDrawings(baseReplay, {
		stripLevelHorizontals: false,
		stripFibOverlays: false,
	});
	const nonKeyHorizontal = existingHorizontalRows(baseReplay).filter(
		row => !row.label?.startsWith('Level #') && !row.label?.startsWith('Fib 1.618 ext #'),
	);
	const allHorizontal = [...nonKeyHorizontal, ...horizontalRows];
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
		parsed.data.removeAllLevels || parsed.data.removeLevel
			? undefined
			: parsed.data.levelNumber != null
				? `Level #${parsed.data.levelNumber}`
				: undefined;

	return finishKeyDrawingChart({
		ctx: {...ctx, baseReplay},
		mergedOverlays,
		baseReplay,
		titleSuffix,
	});
}

export {buildKeyLevelMenu} from './key-level-menu-summary.js';
