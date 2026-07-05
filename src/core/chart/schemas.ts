import {z} from 'zod';
import {PrepareChartDrawingsSchema, PrepareChartOverlaysSchema} from './overlay-schemas.js';
import {ChartLiveBindingSchema} from './live/schemas.js';
import {extractOhlcvBarsFromUnknown, looksLikeOhlcvBar} from './fetch-result.js';

export {
	ChartOverlayInputSchema,
	PrepareChartDrawingsSchema,
	PrepareChartOverlaysSchema,
} from './overlay-schemas.js';
export type {ChartOverlayInput} from './overlay-schemas.js';

export const CHART_V1_KIND = 'continuum/chart/v1' as const;

export const DEFAULT_CHART_MAX_POINTS = 5_000;
export const DEFAULT_CHART_HEIGHT = 280;
export const MAX_CHART_SERIES = 40;

export const ChartSeriesTypeSchema = z.enum(['line', 'candlestick', 'area', 'histogram']);

export const ChartLineStyleSchema = z.enum(['solid', 'dashed', 'dotted']);

export const ChartSeriesStyleSchema = z
	.object({
		color: z.string().min(1).optional(),
		lineWidth: z.number().positive().optional(),
		lineStyle: ChartLineStyleSchema.optional(),
	})
	.strict();

const ChartSeriesDataPointSchema = z.union([
	z.record(z.string(), z.unknown()),
	z.array(z.unknown()),
]);

export const ChartSeriesInputSchema = z
	.object({
		id: z.string().min(1).max(64),
		type: ChartSeriesTypeSchema,
		label: z.string().min(1).max(128),
		data: z.array(ChartSeriesDataPointSchema).min(1),
		priceScaleId: z.enum(['left', 'right']).optional(),
		paneId: z.string().min(1).max(64).optional(),
		overlay: z.boolean().optional(),
		style: ChartSeriesStyleSchema.optional(),
	})
	.strict();

function parseJsonArrayIfString(raw: unknown): unknown {
	if (typeof raw !== 'string') {
		return raw;
	}
	const trimmed = raw.trim();
	if (!trimmed.startsWith('[')) {
		return raw;
	}
	try {
		return JSON.parse(trimmed) as unknown;
	} catch {
		return raw;
	}
}

function parseJsonObjectIfString(raw: unknown): unknown {
	if (typeof raw !== 'string') {
		return raw;
	}
	const trimmed = raw.trim();
	if (!trimmed.startsWith('{')) {
		return raw;
	}
	try {
		return JSON.parse(trimmed) as unknown;
	} catch {
		return raw;
	}
}

function extractBarArray(raw: unknown): unknown[] | null {
	return extractOhlcvBarsFromUnknown(raw);
}

function looksLikeCandleRow(row: unknown): boolean {
	return looksLikeOhlcvBar(row);
}

function hasBarSource(input: Record<string, unknown>): boolean {
	if ('series' in input) {
		const series = parseJsonArrayIfString(input.series);
		if (Array.isArray(series) && series.length > 0) {
			return true;
		}
	}
	for (const key of ['bars', 'candles', 'ohlcv', 'result', 'rows', 'data', 'toolResult', 'executeResult', 'fetchResult'] as const) {
		if (!(key in input)) {
			continue;
		}
		const bars = extractBarArray(input[key]);
		if (bars && looksLikeCandleRow(bars[0])) {
			return true;
		}
	}
	return false;
}

function missingBarSeriesMessage(): string {
	return (
		'Missing OHLCV data. After coingecko__execute, call prepare_chart with ' +
		'{ title, bars: <result array> } (or result / candles / series). Never {}.'
	);
}

function buildCandlestickSeriesFromBars(
	bars: unknown[],
	input: Record<string, unknown>,
): Array<{
	id: string;
	type: 'candlestick';
	label: string;
	data: unknown[];
}> {
	const labelRaw =
		(typeof input.label === 'string' && input.label.trim()) ||
		(typeof input.title === 'string' && input.title.trim()) ||
		'Price';
	const idRaw =
		(typeof input.assetId === 'string' && input.assetId.trim()) ||
		(typeof input.symbol === 'string' && input.symbol.trim()) ||
		'candles';
	return [
		{
			id: idRaw.slice(0, 64),
			type: 'candlestick',
			label: labelRaw.slice(0, 128),
			data: bars,
		},
	];
}

const PREPARE_CHART_HELPER_KEYS = [
	'bars',
	'candles',
	'ohlcv',
	'result',
	'rows',
	'data',
	'toolResult',
	'executeResult',
	'fetchResult',
	'label',
	'symbol',
	'assetId',
] as const;

/** Agents sometimes stringify `series` / `overlays`; coerce before strict validation. */
export function preprocessPrepareChartInput(raw: unknown): unknown {
	if (!raw || typeof raw !== 'object') {
		return raw;
	}
	const input = {...(raw as Record<string, unknown>)};
	if ('series' in input) {
		input.series = parseJsonArrayIfString(input.series);
	}
	if ('overlays' in input) {
		input.overlays = parseJsonArrayIfString(input.overlays);
	}
	if ('options' in input) {
		input.options = parseJsonObjectIfString(input.options);
	}

	for (const key of ['bars', 'candles', 'ohlcv'] as const) {
		const bars = extractBarArray(input[key]);
		if (bars && looksLikeCandleRow(bars[0])) {
			input.series = buildCandlestickSeriesFromBars(bars, input);
			break;
		}
	}

	for (const key of ['result', 'rows', 'data', 'toolResult', 'executeResult', 'fetchResult'] as const) {
		if (input.series || !(key in input)) {
			continue;
		}
		const bars = extractBarArray(input[key]);
		if (bars && looksLikeCandleRow(bars[0])) {
			input.series = buildCandlestickSeriesFromBars(bars, input);
			break;
		}
	}

	if (!input.series && !hasBarSource(input)) {
		input.series = [];
	}

	for (const key of PREPARE_CHART_HELPER_KEYS) {
		delete input[key];
	}

	return input;
}

const PrepareChartInputInnerSchema = z
	.object({
		title: z.string().max(256).optional(),
		height: z.number().int().min(120).max(800).optional(),
		series: z
			.array(ChartSeriesInputSchema)
			.min(1, {message: missingBarSeriesMessage()})
			.max(16),
		overlays: PrepareChartOverlaysSchema.optional(),
		drawings: PrepareChartDrawingsSchema.optional(),
		options: z
			.object({
				maxPoints: z.number().int().min(2).max(DEFAULT_CHART_MAX_POINTS).optional(),
				/** Match histogram bars to candlestick open/close at the same time (any bar period). Default true. */
				colorVolumeFromCandles: z.boolean().optional(),
				/** When true, omit default EMA(50) + RSI(14) overlays on candlestick charts. */
				skipDefaultOverlays: z.boolean().optional(),
			})
			.strict()
			.optional(),
	})
	.strict();

export const PrepareChartInputSchema = z.preprocess(
	preprocessPrepareChartInput,
	PrepareChartInputInnerSchema,
);

export const ChartTimeSchema = z.union([
	z.number().int().nonnegative(),
	z
		.object({
			year: z.number().int(),
			month: z.number().int().min(1).max(12),
			day: z.number().int().min(1).max(31),
		})
		.strict(),
]);

export const ChartPaneSchema = z
	.object({
		id: z.string().min(1).max(64),
		heightRatio: z.number().positive().max(1),
	})
	.strict();

export const ChartSeriesOutputSchema = z
	.object({
		id: z.string(),
		type: ChartSeriesTypeSchema,
		label: z.string(),
		data: z.array(z.record(z.string(), z.unknown())),
		priceScaleId: z.enum(['left', 'right']).optional(),
		paneId: z.string().min(1).max(64).optional(),
		overlay: z.boolean().optional(),
		style: ChartSeriesStyleSchema.optional(),
	})
	.strict();

export const ChartV1PayloadSchema = z
	.object({
		title: z.string().optional(),
		height: z.number().int().optional(),
		panes: z.array(ChartPaneSchema).min(1).max(12).optional(),
		series: z.array(ChartSeriesOutputSchema).min(1).max(MAX_CHART_SERIES),
	})
	.strict();

export const ChartPrepareReplaySchema = z
	.object({
		overlays: PrepareChartOverlaysSchema.optional(),
		skipDefaultOverlays: z.boolean().optional(),
		usedDefaultOverlays: z.boolean().optional(),
	})
	.strict();

export const PrepareChartOutputSchema = z
	.object({
		kind: z.literal(CHART_V1_KIND),
		chart: ChartV1PayloadSchema,
		live: ChartLiveBindingSchema.optional(),
		prepareReplay: ChartPrepareReplaySchema.optional(),
		meta: z
			.object({
				warnings: z.array(z.string()).optional(),
				loadStatus: z
					.object({
						dataComplete: z.boolean(),
						liveReady: z.boolean(),
						barCount: z.number().int(),
						expectedBarCount: z.number().int().nullable().optional(),
						windowExpectedBarCount: z.number().int().nullable().optional(),
						requestedLookbackDaysFromTitle: z.number().int().nullable().optional(),
						actualSpanDays: z.number().nullable().optional(),
						skippedBarCount: z.number().int().optional(),
						hasTimestampGaps: z.boolean().optional(),
						liveBindingAttached: z.boolean(),
						liveBindingExpected: z.boolean(),
						dataIssues: z.array(z.string()),
						liveIssues: z.array(z.string()),
						issues: z.array(z.string()),
					})
					.strict()
					.optional(),
			})
			.strict()
			.optional(),
	})
	.strict();

export type ChartSeriesType = z.infer<typeof ChartSeriesTypeSchema>;
export type ChartSeriesStyle = z.infer<typeof ChartSeriesStyleSchema>;
export type PrepareChartInput = z.infer<typeof PrepareChartInputSchema>;
export type ChartPrepareReplay = z.infer<typeof ChartPrepareReplaySchema>;
export type PrepareChartOutput = z.infer<typeof PrepareChartOutputSchema>;
export type ChartV1Payload = z.infer<typeof ChartV1PayloadSchema>;
export type ChartTime = z.infer<typeof ChartTimeSchema>;
