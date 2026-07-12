import {z} from 'zod';
import type {SdkResult} from '../../result.js';
import {calculateTechnicalIndicator} from '../../ta/calculate.js';
import {coerceFiniteNumber} from '../point-normalize.js';
import {extractOhlcvBarsFromUnknown} from '../fetch-result.js';
import {ChartLiveTickSchema} from '../live/schemas.js';
import {validateTimeSeriesPointsFromToolResult} from '../chart-data-validation.js';
import {buildOhlcvAnalysisMeta, OhlcvAnalysisMetaSchema} from './analysis-meta.js';
import {prepareOhlcvBarsForAnalysis} from './ohlcv-live-merge.js';
import {preprocessOhlcvToolInput, missingOhlcvBarsReason} from './ohlcv-input.js';
import {buildBollingerHighlight} from './bollinger-highlight.js';
import {
	buildBollingerTradeSetup,
	DEFAULT_BOLLINGER_ENTRY_PROXIMITY_PCT,
} from './trade-setups/bollinger-trade-setup.js';
import {extractTimeSeriesFromUnknown, type TimeSeriesPoint} from './time-series-input.js';

const DEFAULT_BOLLINGER_PERIOD = 20;
const DEFAULT_BOLLINGER_STD_DEV = 2;

const bollingerInputSchema = z
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
		stdDev: z.number().positive().max(10).optional(),
		entryProximityPct: z.number().min(0).max(50).optional(),
	})
	.strict();

export const AnalyzeBollingerBandsInputSchema = z.preprocess(
	preprocessOhlcvToolInput,
	bollingerInputSchema,
);

export const AnalyzeBollingerBandsOutputSchema = z
	.object({
		analysis: z
			.object({
				summary: z.string(),
				interpretation: z.string(),
				upper: z.number(),
				middle: z.number(),
				lower: z.number(),
				bandWidth: z.number(),
				percentB: z.number(),
				period: z.number().int(),
				stdDev: z.number(),
				dataKind: z.enum(['ohlcv', 'time_series']),
				bollingerTradeSetup: z.object({}).catchall(z.unknown()).nullable(),
				bollingerHighlight: z.object({}).catchall(z.unknown()),
			})
			.strict(),
		meta: z.union([OhlcvAnalysisMetaSchema, z.record(z.string(), z.unknown())]),
	})
	.strict();

function pointsFromToolInput(input: {
	toolResult?: unknown;
	rows?: unknown[];
}): TimeSeriesPoint[] {
	if (input.rows?.length) {
		return extractTimeSeriesFromUnknown(input.rows) ?? [];
	}
	if (input.toolResult != null) {
		return extractTimeSeriesFromUnknown(input.toolResult) ?? [];
	}
	return [];
}

function timeSeriesPointRows(points: TimeSeriesPoint[]): Record<string, unknown>[] {
	return points.map(point => ({time: point.timeSec, value: point.value}));
}

function lastBandValues(
	closes: number[],
	period: number,
	stdDev: number,
): SdkResult<{upper: number; middle: number; lower: number; percentB: number; bandWidth: number}> {
	const result = calculateTechnicalIndicator({
		indicator: 'bollingerbands',
		params: {period, stdDev},
		input: {values: closes},
		options: {maxPoints: closes.length},
	});
	if (!result.ok) {
		return result;
	}
	const rows = result.data.result;
	if (!Array.isArray(rows) || rows.length === 0) {
		return {ok: false, reason: 'Bollinger bands returned no data.'};
	}
	const lastRow = rows[rows.length - 1] as Record<string, unknown>;
	const upper = coerceFiniteNumber(lastRow.upper ?? lastRow.Upper);
	const middle = coerceFiniteNumber(lastRow.middle ?? lastRow.Middle);
	const lower = coerceFiniteNumber(lastRow.lower ?? lastRow.Lower);
	const lastClose = closes.at(-1);
	if (
		upper == null ||
		middle == null ||
		lower == null ||
		lastClose == null ||
		upper <= lower
	) {
		return {ok: false, reason: 'Bollinger bands have no valid last values after warmup.'};
	}
	const bandWidth = upper - lower;
	const percentB = bandWidth > 0 ? (lastClose - lower) / bandWidth : 0.5;
	return {ok: true, data: {upper, middle, lower, percentB, bandWidth}};
}

function seriesMeta(points: TimeSeriesPoint[], title?: string) {
	return {
		pointCount: points.length,
		...(title ? {title} : {}),
	};
}

function lastCloseFromBars(bars: Record<string, unknown>[]): number | null {
	for (let i = bars.length - 1; i >= 0; i--) {
		const close = coerceFiniteNumber(bars[i]!.close);
		if (close != null) {
			return close;
		}
	}
	return null;
}

export async function analyzeBollingerBands(
	input: unknown,
): Promise<SdkResult<z.infer<typeof AnalyzeBollingerBandsOutputSchema>>> {
	const parsed = AnalyzeBollingerBandsInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.message};
	}

	const period = parsed.data.period ?? DEFAULT_BOLLINGER_PERIOD;
	const stdDev = parsed.data.stdDev ?? DEFAULT_BOLLINGER_STD_DEV;
	const entryProximityPct = parsed.data.entryProximityPct ?? DEFAULT_BOLLINGER_ENTRY_PROXIMITY_PCT;
	const minPoints = period + 1;

	const ohlcvBars = parsed.data.rows?.length
		? (extractOhlcvBarsFromUnknown(parsed.data.rows) as Record<string, unknown>[] | null)
		: parsed.data.toolResult != null
			? (extractOhlcvBarsFromUnknown(parsed.data.toolResult) as Record<string, unknown>[] | null)
			: null;

	if (ohlcvBars?.length) {
		const prepared = await prepareOhlcvBarsForAnalysis(parsed.data);
		if (!prepared.ok) {
			return prepared;
		}
		const {bars, liveMerge, fingerprint} = prepared.data;
		if (bars.length < minPoints) {
			return {
				ok: false,
				reason: `Need at least ${minPoints} OHLCV bars for Bollinger analysis (period ${period}).`,
			};
		}
		const closes: number[] = [];
		for (const bar of bars) {
			const close = coerceFiniteNumber(bar.close);
			if (close != null) {
				closes.push(close);
			}
		}
		if (closes.length < minPoints) {
			return {ok: false, reason: 'Insufficient valid close prices for Bollinger analysis.'};
		}
		const bands = lastBandValues(closes, period, stdDev);
		if (!bands.ok) {
			return bands;
		}
		const lastClose = lastCloseFromBars(bars) ?? closes.at(-1)!;
		const {upper, middle, lower, percentB, bandWidth} = bands.data;
		const bollingerTradeSetup = buildBollingerTradeSetup({
			lastClose,
			upper,
			middle,
			lower,
			period,
			stdDev,
			entryProximityPct,
		});
		const bollingerHighlight = buildBollingerHighlight({
			upper,
			middle,
			lower,
			bandWidth,
			percentB,
			period,
			stdDev,
			setup: bollingerTradeSetup,
		});
		const summary = bollingerHighlight.summary;
		const interpretation = (() => {
			let msg = `Bollinger bands (${period}, ${stdDev}σ): upper ${upper.toFixed(2)}, middle ${middle.toFixed(2)}, lower ${lower.toFixed(2)}. Last close ${lastClose.toFixed(2)} (%B ${(percentB * 100).toFixed(1)}). `;
			if (bollingerTradeSetup?.invalidated) {
				msg += bollingerTradeSetup.unclearReason ?? 'Setup invalidated by band breach.';
			} else if (bollingerTradeSetup?.status === 'clear' && bollingerTradeSetup.side !== 'neutral') {
				msg += `Trade setup: ${bollingerTradeSetup.side} fade at ${bollingerTradeSetup.entryLabel} toward ${bollingerTradeSetup.targetLabel}.`;
			} else {
				msg += bollingerTradeSetup?.conditionalNote ?? 'No clear band fade — wait for proximity to outer band.';
			}
			return msg;
		})();

		return {
			ok: true,
			data: {
				analysis: {
					summary,
					interpretation,
					upper,
					middle,
					lower,
					bandWidth,
					percentB,
					period,
					stdDev,
					dataKind: 'ohlcv',
					bollingerTradeSetup,
					bollingerHighlight,
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

	const points = pointsFromToolInput(parsed.data);
	if (points.length === 0) {
		return {ok: false, reason: missingOhlcvBarsReason(parsed.data)};
	}
	const sorted = [...points].sort((a, b) => a.timeSec - b.timeSec);
	const pointRows = timeSeriesPointRows(sorted);
	if (parsed.data.toolResult != null) {
		const check = validateTimeSeriesPointsFromToolResult(
			pointRows,
			parsed.data.toolResult,
			parsed.data.title,
		);
		if (!check.ok) {
			return {ok: false, reason: check.reason};
		}
	}
	if (sorted.length < minPoints) {
		return {
			ok: false,
			reason: `Need at least ${minPoints} time-series points for Bollinger analysis (period ${period}).`,
		};
	}
	const closes = sorted.map(p => p.value);
	const bands = lastBandValues(closes, period, stdDev);
	if (!bands.ok) {
		return bands;
	}
	const lastClose = closes.at(-1)!;
	const {upper, middle, lower, percentB, bandWidth} = bands.data;
	const bollingerTradeSetup = buildBollingerTradeSetup({
		lastClose,
		upper,
		middle,
		lower,
		period,
		stdDev,
		entryProximityPct,
	});
	const bollingerHighlight = buildBollingerHighlight({
		upper,
		middle,
		lower,
		bandWidth,
		percentB,
		period,
		stdDev,
		setup: bollingerTradeSetup,
	});
	const summary = bollingerHighlight.summary;
	const interpretation = (() => {
		let msg = `Bollinger bands on time series (${period}, ${stdDev}σ): upper ${upper.toFixed(2)}, middle ${middle.toFixed(2)}, lower ${lower.toFixed(2)}. Last value ${lastClose.toFixed(2)} (%B ${(percentB * 100).toFixed(1)}). `;
		if (bollingerTradeSetup?.invalidated) {
			msg += bollingerTradeSetup.unclearReason ?? 'Setup invalidated by band breach.';
		} else if (bollingerTradeSetup?.status === 'clear' && bollingerTradeSetup.side !== 'neutral') {
			msg += `Trade setup: ${bollingerTradeSetup.side} fade at ${bollingerTradeSetup.entryLabel} toward ${bollingerTradeSetup.targetLabel}.`;
		} else {
			msg += bollingerTradeSetup?.conditionalNote ?? 'No clear band fade — wait for proximity to outer band.';
		}
		return msg;
	})();

	return {
		ok: true,
		data: {
			analysis: {
				summary,
				interpretation,
				upper,
				middle,
				lower,
				bandWidth,
				percentB,
				period,
				stdDev,
				dataKind: 'time_series',
				bollingerTradeSetup,
				bollingerHighlight,
			},
			meta: seriesMeta(sorted, parsed.data.title),
		},
	};
}
