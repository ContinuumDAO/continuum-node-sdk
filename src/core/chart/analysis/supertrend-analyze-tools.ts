import {z} from 'zod';
import type {SdkResult} from '../../result.js';
import {calculateTechnicalIndicator} from '../../ta/calculate.js';
import {coerceFiniteNumber} from '../point-normalize.js';
import {ChartLiveTickSchema} from '../live/schemas.js';
import {buildOhlcvAnalysisMeta, OhlcvAnalysisMetaSchema} from './analysis-meta.js';
import {prepareOhlcvBarsForAnalysis} from './ohlcv-live-merge.js';
import {preprocessOhlcvToolInput, missingOhlcvBarsReason} from './ohlcv-input.js';
import {ohlcvToolRejectIfLineOnly} from './time-series-analyze-tools.js';
import {buildSupertrendHighlight} from './supertrend-highlight.js';
import {entryProximityAtrFromOhlcvRows} from './trade-setups/entry-proximity-atr.js';
import {DEFAULT_ENTRY_PROXIMITY_ATR_PERIOD} from './trade-setups/trade-desk-defaults.js';
import {
	buildSupertrendTradeSetup,
	DEFAULT_SUPERTREND_ENTRY_MODE,
	DEFAULT_SUPERTREND_MULTIPLIER,
	DEFAULT_SUPERTREND_PERIOD,
	DEFAULT_SUPERTREND_TARGET_ATR_MULTIPLE,
	type SupertrendEntryMode,
	type SupertrendPoint,
} from './trade-setups/supertrend-trade-setup.js';

const supertrendInputSchema = z
	.object({
		toolResult: z.unknown().optional(),
		rows: z.array(z.unknown()).min(1).optional(),
		title: z.string().trim().min(1).max(256).optional(),
		label: z.string().trim().min(1).max(128).optional(),
		ohlcvDigest: z.string().trim().min(1).max(512).optional(),
		mergeLive: z.boolean().optional(),
		liveTick: ChartLiveTickSchema.optional(),
		allowRowsOnly: z.boolean().optional(),
		period: z.number().int().min(2).max(500).optional(),
		supertrendPeriod: z.number().int().min(2).max(500).optional(),
		multiplier: z.number().positive().max(20).optional(),
		supertrendMultiplier: z.number().positive().max(20).optional(),
		supertrendEntryMode: z.enum(['flip', 'retest']).optional(),
		supertrendTargetAtrMultiple: z.number().min(0.1).max(50).optional(),
		entryProximityPct: z.number().min(0).max(100).optional(),
		entryProximityMode: z.enum(['price', 'atr']).optional(),
		entryProximityAtrPeriod: z.number().int().min(2).max(100).optional(),
		entryOffsetPct: z.number().min(0).max(50).optional(),
		invalidationOffsetPct: z.number().min(0).max(50).optional(),
	})
	.strict();

export const AnalyzeSupertrendInputSchema = z.preprocess(
	preprocessOhlcvToolInput,
	supertrendInputSchema,
);

export const AnalyzeSupertrendOutputSchema = z
	.object({
		analysis: z
			.object({
				summary: z.string(),
				interpretation: z.string(),
				supertrend: z.number(),
				direction: z.number(),
				period: z.number().int(),
				multiplier: z.number(),
				entryMode: z.enum(['flip', 'retest']),
				supertrendTradeSetup: z.object({}).catchall(z.unknown()).nullable(),
				supertrendHighlight: z.object({}).catchall(z.unknown()),
			})
			.strict(),
		meta: OhlcvAnalysisMetaSchema,
	})
	.strict();

function resolvePeriod(data: {period?: number; supertrendPeriod?: number}): number {
	return data.period ?? data.supertrendPeriod ?? DEFAULT_SUPERTREND_PERIOD;
}

function resolveMultiplier(data: {
	multiplier?: number;
	supertrendMultiplier?: number;
}): number {
	return data.multiplier ?? data.supertrendMultiplier ?? DEFAULT_SUPERTREND_MULTIPLIER;
}

function resolveEntryMode(mode: SupertrendEntryMode | undefined): SupertrendEntryMode {
	return mode ?? DEFAULT_SUPERTREND_ENTRY_MODE;
}

function extractOhlcSeries(bars: Record<string, unknown>[]): {
	high: number[];
	low: number[];
	close: number[];
} | null {
	const high: number[] = [];
	const low: number[] = [];
	const close: number[] = [];
	for (const bar of bars) {
		const h = coerceFiniteNumber(bar.high);
		const l = coerceFiniteNumber(bar.low);
		const c = coerceFiniteNumber(bar.close);
		if (h == null || l == null || c == null) {
			continue;
		}
		high.push(h);
		low.push(l);
		close.push(c);
	}
	if (high.length === 0) {
		return null;
	}
	return {high, low, close};
}

function alignSupertrendToBars(
	barCount: number,
	rows: unknown[],
): Array<SupertrendPoint | null> {
	const out: Array<SupertrendPoint | null> = Array.from({length: barCount}, () => null);
	if (!Array.isArray(rows) || rows.length === 0 || rows.length > barCount) {
		return out;
	}
	const offset = barCount - rows.length;
	for (let j = 0; j < rows.length; j++) {
		const row = rows[j] as Record<string, unknown> | null;
		if (!row || typeof row !== 'object') {
			continue;
		}
		const supertrend = coerceFiniteNumber(row.supertrend ?? row.SuperTrend);
		const direction = coerceFiniteNumber(row.direction ?? row.Direction);
		if (supertrend == null || direction == null) {
			continue;
		}
		out[offset + j] = {
			supertrend,
			direction: direction >= 0 ? 1 : -1,
		};
	}
	return out;
}

export async function analyzeSupertrend(
	input: unknown,
): Promise<SdkResult<z.infer<typeof AnalyzeSupertrendOutputSchema>>> {
	const parsed = AnalyzeSupertrendInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.message};
	}

	const lineOnly = ohlcvToolRejectIfLineOnly(parsed.data);
	if (lineOnly) {
		return lineOnly;
	}

	const period = resolvePeriod(parsed.data);
	const multiplier = resolveMultiplier(parsed.data);
	const entryMode = resolveEntryMode(parsed.data.supertrendEntryMode);
	const minBars = period + 2;

	const prepared = await prepareOhlcvBarsForAnalysis(parsed.data);
	if (!prepared.ok) {
		if (!parsed.data.toolResult && !parsed.data.rows?.length) {
			return {ok: false, reason: missingOhlcvBarsReason(parsed.data)};
		}
		return prepared;
	}

	const {bars, liveMerge, fingerprint} = prepared.data;
	if (bars.length < minBars) {
		return {
			ok: false,
			reason: `Need at least ${minBars} OHLCV bars for Supertrend analysis (period ${period}).`,
		};
	}

	const ohlc = extractOhlcSeries(bars);
	if (!ohlc || ohlc.close.length < minBars) {
		return {ok: false, reason: 'Insufficient valid OHLC prices for Supertrend analysis.'};
	}

	const ta = calculateTechnicalIndicator({
		indicator: 'supertrend',
		params: {period, multiplier},
		input: {high: ohlc.high, low: ohlc.low, close: ohlc.close},
		options: {maxPoints: ohlc.high.length},
	});
	if (!ta.ok) {
		return ta;
	}

	const points = alignSupertrendToBars(ohlc.close.length, ta.data.result);
	const lastIndex = ohlc.close.length - 1;
	const current = points[lastIndex];
	if (current == null) {
		return {ok: false, reason: 'Supertrend has no valid values after warmup.'};
	}

	const atrPeriod =
		parsed.data.entryProximityAtrPeriod ?? DEFAULT_ENTRY_PROXIMITY_ATR_PERIOD;
	const atr = entryProximityAtrFromOhlcvRows(bars, atrPeriod);
	const targetAtrMultiple =
		parsed.data.supertrendTargetAtrMultiple ?? DEFAULT_SUPERTREND_TARGET_ATR_MULTIPLE;

	const supertrendTradeSetup = buildSupertrendTradeSetup({
		closes: ohlc.close,
		points,
		period,
		multiplier,
		entryMode,
		entryProximityPct: parsed.data.entryProximityPct,
		entryOffsetPct: parsed.data.entryOffsetPct,
		invalidationOffsetPct: parsed.data.invalidationOffsetPct,
		atr,
		targetAtrMultiple,
	});

	const supertrendHighlight = buildSupertrendHighlight({
		supertrend: current.supertrend,
		direction: current.direction,
		period,
		multiplier,
		entryMode,
		setup: supertrendTradeSetup,
	});

	const lastClose = ohlc.close[lastIndex]!;
	const summary = supertrendHighlight.summary;
	let interpretation = `Supertrend (${period}, ${multiplier}): trail ${current.supertrend.toFixed(2)}, direction ${current.direction >= 0 ? 'bullish' : 'bearish'}. Last close ${lastClose.toFixed(2)}. Entry mode: ${entryMode}. `;
	if (supertrendTradeSetup?.invalidated) {
		interpretation += supertrendTradeSetup.unclearReason ?? 'Setup invalidated.';
	} else if (
		supertrendTradeSetup?.status === 'clear' &&
		supertrendTradeSetup.side !== 'neutral'
	) {
		interpretation += `Trade setup (${supertrendTradeSetup.setupPurposeCode}): ${supertrendTradeSetup.side} at ${supertrendTradeSetup.entryLabel ?? 'entry'} toward ${supertrendTradeSetup.targetLabel ?? 'target'}.`;
	} else {
		interpretation +=
			supertrendTradeSetup?.conditionalNote ??
			'No clear Supertrend flip/retest — wait for signal.';
	}

	return {
		ok: true,
		data: {
			analysis: {
				summary,
				interpretation,
				supertrend: current.supertrend,
				direction: current.direction,
				period,
				multiplier,
				entryMode,
				supertrendTradeSetup,
				supertrendHighlight,
			},
			meta: buildOhlcvAnalysisMeta(bars, {
				title: parsed.data.title,
				toolResult: parsed.data.toolResult,
				liveMerge,
				ohlcvFingerprint: fingerprint,
			}),
		},
	};
}
