import {z} from 'zod';
import type {SdkResult} from '../../result.js';
import {calculateTechnicalIndicator} from '../../ta/calculate.js';
import {coerceFiniteNumber} from '../point-normalize.js';
import {ChartLiveTickSchema} from '../live/schemas.js';
import {buildOhlcvAnalysisMeta, OhlcvAnalysisMetaSchema} from './analysis-meta.js';
import {prepareOhlcvBarsForAnalysis} from './ohlcv-live-merge.js';
import {preprocessOhlcvToolInput, missingOhlcvBarsReason} from './ohlcv-input.js';
import {ohlcvToolRejectIfLineOnly} from './time-series-analyze-tools.js';
import {buildDonchianHighlight} from './donchian-highlight.js';
import {entryProximityAtrFromOhlcvRows} from './trade-setups/entry-proximity-atr.js';
import {DEFAULT_ENTRY_PROXIMITY_ATR_PERIOD} from './trade-setups/trade-desk-defaults.js';
import {
	buildDonchianTradeSetup,
	DEFAULT_DONCHIAN_ENTRY_MODE,
	DEFAULT_DONCHIAN_PERIOD,
	DEFAULT_DONCHIAN_TARGET_ATR_MULTIPLE,
	type DonchianChannelPoint,
	type DonchianEntryMode,
} from './trade-setups/donchian-trade-setup.js';

const donchianInputSchema = z
	.object({
		toolResult: z.unknown().optional(),
		rows: z.array(z.unknown()).min(1).optional(),
		title: z.string().trim().min(1).max(256).optional(),
		label: z.string().trim().min(1).max(128).optional(),
		ohlcvDigest: z.string().trim().min(1).max(512).optional(),
		mergeLive: z.boolean().optional(),
		liveTick: ChartLiveTickSchema.optional(),
		allowRowsOnly: z.boolean().optional(),
		/** Channel length; desk may inject as donchianPeriod when period is omitted. */
		period: z.number().int().min(2).max(500).optional(),
		donchianPeriod: z.number().int().min(2).max(500).optional(),
		donchianEntryMode: z.enum(['retest', 'immediate']).optional(),
		/** Target = entry ± (multiple × ATR); desk donchianTargetAtrMultiple default 3. */
		donchianTargetAtrMultiple: z.number().min(0.1).max(50).optional(),
		entryProximityPct: z.number().min(0).max(100).optional(),
		entryProximityMode: z.enum(['price', 'atr']).optional(),
		entryProximityAtrPeriod: z.number().int().min(2).max(100).optional(),
		entryOffsetPct: z.number().min(0).max(50).optional(),
		invalidationOffsetPct: z.number().min(0).max(50).optional(),
		invalidationOffsetMode: z.enum(['price', 'atr']).optional(),
	})
	.strict();

export const AnalyzeDonchianBreakoutInputSchema = z.preprocess(
	preprocessOhlcvToolInput,
	donchianInputSchema,
);

export const AnalyzeDonchianBreakoutOutputSchema = z
	.object({
		analysis: z
			.object({
				summary: z.string(),
				interpretation: z.string(),
				upper: z.number(),
				middle: z.number(),
				lower: z.number(),
				priorUpper: z.number(),
				priorLower: z.number(),
				channelWidth: z.number(),
				period: z.number().int(),
				entryMode: z.enum(['retest', 'immediate']),
				donchianTradeSetup: z.object({}).catchall(z.unknown()).nullable(),
				donchianHighlight: z.object({}).catchall(z.unknown()),
			})
			.strict(),
		meta: OhlcvAnalysisMetaSchema,
	})
	.strict();

function resolvePeriod(data: {
	period?: number;
	donchianPeriod?: number;
}): number {
	return data.period ?? data.donchianPeriod ?? DEFAULT_DONCHIAN_PERIOD;
}

function resolveEntryMode(mode: DonchianEntryMode | undefined): DonchianEntryMode {
	return mode ?? DEFAULT_DONCHIAN_ENTRY_MODE;
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

function alignChannelsToBars(
	barCount: number,
	rows: unknown[],
): Array<DonchianChannelPoint | null> {
	const out: Array<DonchianChannelPoint | null> = Array.from({length: barCount}, () => null);
	if (!Array.isArray(rows) || rows.length === 0 || rows.length > barCount) {
		return out;
	}
	const offset = barCount - rows.length;
	for (let j = 0; j < rows.length; j++) {
		const row = rows[j] as Record<string, unknown> | null;
		if (!row || typeof row !== 'object') {
			continue;
		}
		const upper = coerceFiniteNumber(row.upper ?? row.Upper);
		const middle = coerceFiniteNumber(row.middle ?? row.Middle);
		const lower = coerceFiniteNumber(row.lower ?? row.Lower);
		if (upper == null || middle == null || lower == null || upper <= lower) {
			continue;
		}
		out[offset + j] = {upper, middle, lower};
	}
	return out;
}

export async function analyzeDonchianBreakout(
	input: unknown,
): Promise<SdkResult<z.infer<typeof AnalyzeDonchianBreakoutOutputSchema>>> {
	const parsed = AnalyzeDonchianBreakoutInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.message};
	}

	const lineOnly = ohlcvToolRejectIfLineOnly(parsed.data);
	if (lineOnly) {
		return lineOnly;
	}

	const period = resolvePeriod(parsed.data);
	const entryMode = resolveEntryMode(parsed.data.donchianEntryMode);
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
			reason: `Need at least ${minBars} OHLCV bars for Donchian breakout analysis (period ${period}).`,
		};
	}

	const ohlc = extractOhlcSeries(bars);
	if (!ohlc || ohlc.close.length < minBars) {
		return {ok: false, reason: 'Insufficient valid OHLC prices for Donchian analysis.'};
	}

	const ta = calculateTechnicalIndicator({
		indicator: 'donchianchannels',
		params: {period},
		input: {high: ohlc.high, low: ohlc.low, close: ohlc.close},
		options: {maxPoints: ohlc.high.length},
	});
	if (!ta.ok) {
		return ta;
	}

	const channels = alignChannelsToBars(ohlc.close.length, ta.data.result);
	const lastIndex = ohlc.close.length - 1;
	const current = channels[lastIndex];
	const prior = channels[lastIndex - 1];
	if (current == null || prior == null) {
		return {ok: false, reason: 'Donchian channels have no valid values after warmup.'};
	}

	const atrPeriod =
		parsed.data.entryProximityAtrPeriod ?? DEFAULT_ENTRY_PROXIMITY_ATR_PERIOD;
	const atr = entryProximityAtrFromOhlcvRows(bars, atrPeriod);
	const targetAtrMultiple =
		parsed.data.donchianTargetAtrMultiple ?? DEFAULT_DONCHIAN_TARGET_ATR_MULTIPLE;

	const donchianTradeSetup = buildDonchianTradeSetup({
		closes: ohlc.close,
		channels,
		period,
		entryMode,
		entryProximityPct: parsed.data.entryProximityPct,
		entryOffsetPct: parsed.data.entryOffsetPct,
		invalidationOffsetPct: parsed.data.invalidationOffsetPct,
		invalidationOffsetMode: parsed.data.invalidationOffsetMode,
		atr,
		targetAtrMultiple,
	});

	const channelWidth = current.upper - current.lower;
	const donchianHighlight = buildDonchianHighlight({
		upper: current.upper,
		middle: current.middle,
		lower: current.lower,
		priorUpper: prior.upper,
		priorLower: prior.lower,
		channelWidth,
		period,
		entryMode,
		setup: donchianTradeSetup,
	});

	const lastClose = ohlc.close[lastIndex]!;
	const summary = donchianHighlight.summary;
	let interpretation = `Donchian channels (${period}): upper ${current.upper.toFixed(2)}, middle ${current.middle.toFixed(2)}, lower ${current.lower.toFixed(2)}. Prior channel ${prior.lower.toFixed(2)}–${prior.upper.toFixed(2)}. Last close ${lastClose.toFixed(2)}. Entry mode: ${entryMode}. `;
	if (donchianTradeSetup?.invalidated) {
		interpretation += donchianTradeSetup.unclearReason ?? 'Setup invalidated.';
	} else if (
		donchianTradeSetup?.status === 'clear' &&
		donchianTradeSetup.side !== 'neutral'
	) {
		interpretation += `Trade setup (${donchianTradeSetup.setupPurposeCode}): ${donchianTradeSetup.side} at ${donchianTradeSetup.entryLabel ?? 'channel'} toward ${donchianTradeSetup.targetLabel ?? 'target'}.`;
	} else {
		interpretation +=
			donchianTradeSetup?.conditionalNote ??
			'No clear Donchian breakout/retest — wait for signal.';
	}

	return {
		ok: true,
		data: {
			analysis: {
				summary,
				interpretation,
				upper: current.upper,
				middle: current.middle,
				lower: current.lower,
				priorUpper: prior.upper,
				priorLower: prior.lower,
				channelWidth,
				period,
				entryMode,
				donchianTradeSetup,
				donchianHighlight,
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
