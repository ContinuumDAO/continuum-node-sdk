import {z} from 'zod';
import {
	ChartOhlcvSummarySchema,
	type ChartOhlcvSummary,
	summarizeOhlcvBars,
} from '../chart-ohlcv-summary.js';
import type {OhlcvLiveMergeMeta} from './ohlcv-live-merge.js';
import type {OhlcvFingerprint} from '../ohlcv-integrity.js';
import {OhlcvFingerprintSchema} from '../ohlcv-integrity.js';

/** Shown on every OHLCV analysis/chart tool response — agents must follow this in prose. */
export const AGENT_OHLCV_DATA_POLICY =
	'Do not invent OHLCV prices, timestamps, volumes, bar counts, highs/lows, or pattern levels. ' +
	'Quote only values from this tool JSON (meta.ohlcvSummary, meta.ohlcvFingerprint, meta.liveMerge, meta.loadStatus, analysis.*, pattern points/levels). ' +
	'Chart and analyze on the same fetch must share the same meta.ohlcvFingerprint.digest. ' +
	'For current-market analysis, meta.liveMerge.merged=true means lastClose includes a live tick; use meta.ohlcvSummary.lastClose. ' +
	'Never paste reformatted candle tables or prices from memory — re-fetch if the operator asks for raw data.';

export const OhlcvLiveMergeMetaSchema = z
	.object({
		attempted: z.boolean(),
		merged: z.boolean(),
		livePrice: z.number().optional(),
		liveTickTimeMs: z.number().optional(),
		priorLastClose: z.number().optional(),
		barRolledOver: z.boolean().optional(),
		skippedReason: z.string().optional(),
	})
	.strict();

export const OhlcvAnalysisMetaSchema = z
	.object({
		barCount: z.number().int(),
		title: z.string().optional(),
		ohlcvSummary: ChartOhlcvSummarySchema.optional(),
		ohlcvFingerprint: OhlcvFingerprintSchema.optional(),
		liveMerge: OhlcvLiveMergeMetaSchema.optional(),
		patternsScanned: z.number().int().optional(),
		dataPolicy: z.string(),
		warnings: z.array(z.string()).optional(),
	})
	.strict();

export type OhlcvAnalysisMeta = z.infer<typeof OhlcvAnalysisMetaSchema>;

export function buildOhlcvAnalysisMeta(
	bars: Record<string, unknown>[],
	options: {
		title?: string;
		patternsScanned?: number;
		liveMerge?: OhlcvLiveMergeMeta;
		ohlcvFingerprint?: OhlcvFingerprint | null;
		extraWarnings?: string[];
	} = {},
): OhlcvAnalysisMeta {
	const ohlcvSummary = summarizeOhlcvBars(bars) ?? undefined;
	const warnings = [...(options.extraWarnings ?? [])];
	if (options.liveMerge?.merged && options.liveMerge.priorLastClose != null && ohlcvSummary) {
		warnings.push(
			`Live tick merged: lastClose updated from ${options.liveMerge.priorLastClose.toFixed(2)} to ${ohlcvSummary.lastClose.toFixed(2)}.`,
		);
	} else if (options.liveMerge?.skippedReason) {
		warnings.push(`Live merge skipped: ${options.liveMerge.skippedReason}`);
	}
	return {
		barCount: bars.length,
		...(options.title ? {title: options.title} : {}),
		...(ohlcvSummary ? {ohlcvSummary} : {}),
		...(options.ohlcvFingerprint ? {ohlcvFingerprint: options.ohlcvFingerprint} : {}),
		...(options.liveMerge ? {liveMerge: options.liveMerge} : {}),
		...(options.patternsScanned != null ? {patternsScanned: options.patternsScanned} : {}),
		dataPolicy: AGENT_OHLCV_DATA_POLICY,
		...(warnings.length ? {warnings} : {}),
	};
}

export function ohlcvSummaryFromBars(bars: Record<string, unknown>[]): ChartOhlcvSummary | null {
	return summarizeOhlcvBars(bars);
}
