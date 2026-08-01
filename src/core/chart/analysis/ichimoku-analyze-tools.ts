import {z} from 'zod';
import type {SdkResult} from '../../result.js';
import {calculateTechnicalIndicator} from '../../ta/calculate.js';
import {coerceFiniteNumber} from '../point-normalize.js';
import {ChartLiveTickSchema} from '../live/schemas.js';
import {buildOhlcvAnalysisMeta, OhlcvAnalysisMetaSchema} from './analysis-meta.js';
import {prepareOhlcvBarsForAnalysis} from './ohlcv-live-merge.js';
import {preprocessOhlcvToolInput, missingOhlcvBarsReason} from './ohlcv-input.js';
import {ohlcvToolRejectIfLineOnly} from './time-series-analyze-tools.js';
import {buildIchimokuHighlight} from './ichimoku-highlight.js';
import {entryProximityAtrFromOhlcvRows} from './trade-setups/entry-proximity-atr.js';
import {DEFAULT_ENTRY_PROXIMITY_ATR_PERIOD} from './trade-setups/trade-desk-defaults.js';
import {
	buildIchimokuTradeSetup,
	currentCloudFromPoints,
	DEFAULT_ICHIMOKU_BASE_PERIOD,
	DEFAULT_ICHIMOKU_CONVERSION_PERIOD,
	DEFAULT_ICHIMOKU_DISPLACEMENT,
	DEFAULT_ICHIMOKU_SPAN_PERIOD,
	DEFAULT_ICHIMOKU_TARGET_ATR_MULTIPLE,
	type IchimokuPoint,
} from './trade-setups/ichimoku-trade-setup.js';

const ichimokuInputSchema = z
	.object({
		toolResult: z.unknown().optional(),
		rows: z.array(z.unknown()).min(1).optional(),
		title: z.string().trim().min(1).max(256).optional(),
		label: z.string().trim().min(1).max(128).optional(),
		ohlcvDigest: z.string().trim().min(1).max(512).optional(),
		mergeLive: z.boolean().optional(),
		liveTick: ChartLiveTickSchema.optional(),
		allowRowsOnly: z.boolean().optional(),
		conversionPeriod: z.number().int().min(2).max(500).optional(),
		ichimokuConversionPeriod: z.number().int().min(2).max(500).optional(),
		basePeriod: z.number().int().min(2).max(500).optional(),
		ichimokuBasePeriod: z.number().int().min(2).max(500).optional(),
		spanPeriod: z.number().int().min(2).max(500).optional(),
		ichimokuSpanPeriod: z.number().int().min(2).max(500).optional(),
		displacement: z.number().int().min(1).max(200).optional(),
		ichimokuDisplacement: z.number().int().min(1).max(200).optional(),
		ichimokuTargetAtrMultiple: z.number().min(0.1).max(50).optional(),
		entryProximityPct: z.number().min(0).max(100).optional(),
		entryProximityMode: z.enum(['price', 'atr']).optional(),
		entryProximityAtrPeriod: z.number().int().min(2).max(100).optional(),
		entryOffsetPct: z.number().min(0).max(50).optional(),
		invalidationOffsetPct: z.number().min(0).max(50).optional(),
		invalidationOffsetMode: z.enum(['price', 'atr']).optional(),
	})
	.strict();

export const AnalyzeIchimokuInputSchema = z.preprocess(
	preprocessOhlcvToolInput,
	ichimokuInputSchema,
);

export const AnalyzeIchimokuOutputSchema = z
	.object({
		analysis: z
			.object({
				summary: z.string(),
				interpretation: z.string(),
				conversion: z.number(),
				base: z.number(),
				cloudTop: z.number(),
				cloudBottom: z.number(),
				spanA: z.number(),
				spanB: z.number(),
				conversionPeriod: z.number().int(),
				basePeriod: z.number().int(),
				spanPeriod: z.number().int(),
				displacement: z.number().int(),
				tkState: z.enum(['bullish', 'bearish', 'flat']),
				cloudPosition: z.enum(['above', 'below', 'inside']),
				ichimokuTradeSetup: z.object({}).catchall(z.unknown()).nullable(),
				ichimokuHighlight: z.object({}).catchall(z.unknown()),
			})
			.strict(),
		meta: OhlcvAnalysisMetaSchema,
	})
	.strict();

function resolvePeriods(data: {
	conversionPeriod?: number;
	ichimokuConversionPeriod?: number;
	basePeriod?: number;
	ichimokuBasePeriod?: number;
	spanPeriod?: number;
	ichimokuSpanPeriod?: number;
	displacement?: number;
	ichimokuDisplacement?: number;
}) {
	return {
		conversionPeriod:
			data.conversionPeriod ??
			data.ichimokuConversionPeriod ??
			DEFAULT_ICHIMOKU_CONVERSION_PERIOD,
		basePeriod: data.basePeriod ?? data.ichimokuBasePeriod ?? DEFAULT_ICHIMOKU_BASE_PERIOD,
		spanPeriod: data.spanPeriod ?? data.ichimokuSpanPeriod ?? DEFAULT_ICHIMOKU_SPAN_PERIOD,
		displacement:
			data.displacement ?? data.ichimokuDisplacement ?? DEFAULT_ICHIMOKU_DISPLACEMENT,
	};
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

function alignIchimokuToBars(
	barCount: number,
	rows: unknown[],
): Array<IchimokuPoint | null> {
	const out: Array<IchimokuPoint | null> = Array.from({length: barCount}, () => null);
	if (!Array.isArray(rows) || rows.length === 0 || rows.length > barCount) {
		return out;
	}
	const offset = barCount - rows.length;
	for (let j = 0; j < rows.length; j++) {
		const row = rows[j] as Record<string, unknown> | null;
		if (!row || typeof row !== 'object') {
			continue;
		}
		const conversion = coerceFiniteNumber(row.conversion ?? row.tenkan);
		const base = coerceFiniteNumber(row.base ?? row.kijun);
		const spanA = coerceFiniteNumber(row.spanA ?? row.senkouA);
		const spanB = coerceFiniteNumber(row.spanB ?? row.senkouB);
		if (conversion == null || base == null || spanA == null || spanB == null) {
			continue;
		}
		out[offset + j] = {conversion, base, spanA, spanB};
	}
	return out;
}

export async function analyzeIchimoku(
	input: unknown,
): Promise<SdkResult<z.infer<typeof AnalyzeIchimokuOutputSchema>>> {
	const parsed = AnalyzeIchimokuInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.message};
	}

	const lineOnly = ohlcvToolRejectIfLineOnly(parsed.data);
	if (lineOnly) {
		return lineOnly;
	}

	const {conversionPeriod, basePeriod, spanPeriod, displacement} = resolvePeriods(parsed.data);
	const minBars = Math.max(conversionPeriod, basePeriod, spanPeriod, displacement) + displacement + 2;

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
			reason: `Need at least ${minBars} OHLCV bars for Ichimoku analysis (${conversionPeriod}/${basePeriod}/${spanPeriod}, displacement ${displacement}).`,
		};
	}

	const ohlc = extractOhlcSeries(bars);
	if (!ohlc || ohlc.close.length < minBars) {
		return {ok: false, reason: 'Insufficient valid OHLC prices for Ichimoku analysis.'};
	}

	const ta = calculateTechnicalIndicator({
		indicator: 'ichimokukinkouhyou',
		params: {conversionPeriod, basePeriod, spanPeriod, displacement},
		input: {high: ohlc.high, low: ohlc.low, close: ohlc.close},
		options: {maxPoints: ohlc.high.length},
	});
	if (!ta.ok) {
		return ta;
	}

	const points = alignIchimokuToBars(ohlc.close.length, ta.data.result);
	const lastIndex = ohlc.close.length - 1;
	const current = points[lastIndex];
	const cloud = currentCloudFromPoints(points, displacement);
	if (current == null || cloud == null) {
		return {
			ok: false,
			reason: 'Ichimoku has no valid Tenkan/Kijun/cloud values after warmup (need displacement history for cloud).',
		};
	}

	const atrPeriod =
		parsed.data.entryProximityAtrPeriod ?? DEFAULT_ENTRY_PROXIMITY_ATR_PERIOD;
	const atr = entryProximityAtrFromOhlcvRows(bars, atrPeriod);
	const targetAtrMultiple =
		parsed.data.ichimokuTargetAtrMultiple ?? DEFAULT_ICHIMOKU_TARGET_ATR_MULTIPLE;

	const ichimokuTradeSetup = buildIchimokuTradeSetup({
		closes: ohlc.close,
		points,
		conversionPeriod,
		basePeriod,
		spanPeriod,
		displacement,
		entryProximityPct: parsed.data.entryProximityPct,
		entryOffsetPct: parsed.data.entryOffsetPct,
		invalidationOffsetPct: parsed.data.invalidationOffsetPct,
		invalidationOffsetMode: parsed.data.invalidationOffsetMode,
		atr,
		targetAtrMultiple,
	});

	const tkState =
		current.conversion > current.base
			? 'bullish'
			: current.conversion < current.base
				? 'bearish'
				: 'flat';
	const lastClose = ohlc.close[lastIndex]!;
	const cloudPosition =
		lastClose > cloud.top ? 'above' : lastClose < cloud.bottom ? 'below' : 'inside';

	const ichimokuHighlight = buildIchimokuHighlight({
		conversion: current.conversion,
		base: current.base,
		cloudTop: cloud.top,
		cloudBottom: cloud.bottom,
		conversionPeriod,
		basePeriod,
		spanPeriod,
		displacement,
		tkState,
		cloudPosition,
		strategy: ichimokuTradeSetup?.strategy ?? 'tk_cross',
		setup: ichimokuTradeSetup,
	});

	const summary = ichimokuHighlight.summary;
	let interpretation = `Ichimoku (${conversionPeriod}/${basePeriod}/${spanPeriod}): Tenkan ${current.conversion.toFixed(2)}, Kijun ${current.base.toFixed(2)}, cloud ${cloud.bottom.toFixed(2)}–${cloud.top.toFixed(2)}. Last close ${lastClose.toFixed(2)} is ${cloudPosition} cloud; TK ${tkState}. `;
	if (
		ichimokuTradeSetup?.status === 'clear' &&
		ichimokuTradeSetup.side !== 'neutral'
	) {
		interpretation += `Trade setup (${ichimokuTradeSetup.setupPurposeCode}): ${ichimokuTradeSetup.side} at ${ichimokuTradeSetup.entryLabel ?? 'entry'} toward ${ichimokuTradeSetup.targetLabel ?? 'target'}.`;
	} else {
		interpretation +=
			ichimokuTradeSetup?.conditionalNote ??
			'No clear Ichimoku TK/cloud setup — wait for signal.';
	}

	return {
		ok: true,
		data: {
			analysis: {
				summary,
				interpretation,
				conversion: current.conversion,
				base: current.base,
				cloudTop: cloud.top,
				cloudBottom: cloud.bottom,
				spanA: cloud.spanA,
				spanB: cloud.spanB,
				conversionPeriod,
				basePeriod,
				spanPeriod,
				displacement,
				tkState,
				cloudPosition,
				ichimokuTradeSetup,
				ichimokuHighlight,
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
