import {z} from 'zod';
import type {SdkResult} from '../result.js';
import {extractChartMetadataFromFetchPayload} from './fetch-metadata.js';
import {extractLiveBindingFromFetchPayload} from './live/binding-extract.js';
import {extractOhlcvBarsFromUnknown, barRowsHaveVolume, parseJsonIfString} from './fetch-result.js';
import {
	invalidStringToolResultReason,
	isUnparsedJsonString,
	sanitizeOhlcvBarRows,
	validateOhlcvBarsFromToolResult,
} from './ohlcv-window.js';
import {formatChartOhlcvSummary, summarizeOhlcvBars} from './chart-ohlcv-summary.js';
import {attachChartLoadMeta} from './chart-ohlcv-load-status.js';
import {runOhlcvIntegrityPipeline} from './ohlcv-integrity.js';
import {prepareChart} from './prepare.js';
import type {PrepareChartOutput} from './schemas.js';
import {PrepareChartInputSchema, PrepareChartOutputSchema} from './schemas.js';

const PrepareChartFromRowsOptionsSchema = z
	.object({
		maxPoints: z.number().int().min(2).max(5_000).optional(),
		/** Bucket width in seconds when `toolResult` is a price+volume series (e.g. CoinGecko marketChart). */
		bucketSec: z.number().int().min(60).max(86_400 * 7).optional(),
		skipDefaultOverlays: z.boolean().optional(),
		colorVolumeFromCandles: z.boolean().optional(),
		/** Test/synthetic data only — MCP agents must pass fetch `toolResult`. */
		allowRowsOnly: z.boolean().optional(),
	})
	.strict()
	.optional();

function applyFetchMetadata(input: Record<string, unknown>): void {
	const sources = [
		input.toolResult,
		input.executeResult,
		input.fetchResult,
		input.result,
	].filter(v => v != null);
	for (const source of sources) {
		const meta = extractChartMetadataFromFetchPayload(source);
		if (!input.title && meta.title) {
			input.title = meta.title;
		}
		if (!input.label && meta.label) {
			input.label = meta.label;
		}
		if (input.title && input.label) {
			break;
		}
	}
}

function preprocessPrepareChartFromRowsInput(raw: unknown): unknown {
	if (!raw || typeof raw !== 'object') {
		return raw;
	}
	const input = {...(raw as Record<string, unknown>)};
	if ('toolResult' in input) {
		input.toolResult = parseJsonIfString(input.toolResult);
	}
	if ('rows' in input) {
		const rows = parseJsonIfString(input.rows);
		if (Array.isArray(rows)) {
			input.rows = rows;
		}
	}
	if (
		'options' in input &&
		input.options &&
		typeof input.options === 'object' &&
		!Array.isArray(input.options)
	) {
		const options = {...(input.options as Record<string, unknown>)};
		const hasRows = Array.isArray(input.rows) && input.rows.length > 0;
		if (hasRows && 'bucketSec' in options) {
			delete options.bucketSec;
		}
		input.options = options;
	}
	applyFetchMetadata(input);
	return input;
}

const PrepareChartFromRowsInputInnerSchema = z
	.object({
		rows: z.array(z.unknown()).min(1).optional(),
		toolResult: z.unknown().optional(),
		/** Required — must describe the fetched series (asset, interval, window), not the user chat verbatim. */
		title: z.string().trim().min(1).max(256),
		label: z.string().trim().min(1).max(128).optional(),
		height: z.number().int().min(120).max(800).optional(),
		options: PrepareChartFromRowsOptionsSchema,
	})
	.strict()
	.superRefine((input, ctx) => {
		if (isUnparsedJsonString(input.toolResult)) {
			ctx.addIssue({
				code: 'custom',
				path: ['toolResult'],
				message: invalidStringToolResultReason(),
			});
			return;
		}
		const fromRows = input.rows?.length ? input.rows : null;
		const fromTool = input.toolResult != null ? extractOhlcvBarsFromUnknown(input.toolResult) : null;
		if (!fromRows && !fromTool?.length) {
			ctx.addIssue({
				code: 'custom',
				path: ['rows'],
				message:
					'Provide non-empty `rows` (OHLCV array) or `toolResult` (full prior fetch MCP JSON). Never {}.',
			});
		}
	});

export const PrepareChartFromRowsInputSchema = z.preprocess(
	preprocessPrepareChartFromRowsInput,
	PrepareChartFromRowsInputInnerSchema,
);

export type PrepareChartFromRowsInput = z.infer<typeof PrepareChartFromRowsInputSchema>;

export const PrepareChartFromRowsOutputSchema = PrepareChartOutputSchema;

export function prepareChartFromRows(
	input: PrepareChartFromRowsInput,
): SdkResult<PrepareChartOutput> {
	const parsed = PrepareChartFromRowsInputSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			reason: parsed.error.issues.map(i => i.message).join('; '),
		};
	}

	const data = parsed.data;
	if (data.toolResult != null && typeof data.toolResult === 'string') {
		return {ok: false, reason: invalidStringToolResultReason()};
	}

	const chartOptions = {...(data.options ?? {})};
	const bucketSec = chartOptions.bucketSec;
	const allowRowsOnly = chartOptions.allowRowsOnly;
	delete chartOptions.bucketSec;
	delete chartOptions.allowRowsOnly;
	const extractOptions = {
		maxPoints: chartOptions.maxPoints ?? 400,
		...(bucketSec != null ? {bucketSec} : {}),
	};
	const barsFromTool =
		data.toolResult != null ? extractOhlcvBarsFromUnknown(data.toolResult, extractOptions) : null;
	const rawBars =
		(barsFromTool?.length ? barsFromTool : null) ??
		(data.rows?.length ? data.rows : null) ??
		[];
	const bars = sanitizeOhlcvBarRows(rawBars as Record<string, unknown>[]);

	if (!bars.length) {
		return {
			ok: false,
			reason:
				'No OHLCV bars found. Pass `rows` from your fetch tool or `toolResult` (e.g. `{ result: [...] }`, `{ prices, total_volumes }`, or `{ ohlcv: { candles: [...] } }`).',
		};
	}

	if (data.toolResult != null) {
		const windowCheck = validateOhlcvBarsFromToolResult(bars, data.toolResult);
		if (!windowCheck.ok) {
			return windowCheck;
		}
	}

	const integrity = runOhlcvIntegrityPipeline(bars, {
		toolResult: data.toolResult,
		rows: data.rows,
		allowRowsOnly: allowRowsOnly,
	});
	if (!integrity.ok) {
		return integrity;
	}

	const title = data.title.trim();
	const label = data.label?.trim() || title;

	const prepareInput = PrepareChartInputSchema.parse({
		title,
		label,
		...(data.height != null ? {height: data.height} : {}),
		bars,
		options: {
			maxPoints: 400,
			...chartOptions,
		},
	});

	const chartResult = prepareChart(prepareInput);
	if (!chartResult.ok) {
		return chartResult;
	}

	const liveSource = data.toolResult ?? data.rows;
	const live = extractLiveBindingFromFetchPayload(liveSource, {
		...(bucketSec != null ? {bucketSec} : {}),
		maxPoints: chartOptions.maxPoints ?? 400,
	});

	const summary = summarizeOhlcvBars(bars);
	const warnings: string[] = [];
	if (summary) {
		warnings.push(formatChartOhlcvSummary(summary));
	}
	if (!barRowsHaveVolume(bars)) {
		warnings.push(
			'No volume in OHLCV rows — volume pane omitted. For CoinGecko spot charts use `coins.marketChart.get` (prices + total_volumes), not `coins.ohlc.get`.',
		);
	}

	const output: PrepareChartOutput = attachChartLoadMeta(
		{
			...chartResult.data,
			...(live ? {live} : {}),
			...(summary || warnings.length > 0
				? {
						meta: {
							...(summary ? {ohlcvSummary: summary} : {}),
							warnings,
						},
					}
				: {}),
		},
		bars,
		{
			toolResult: data.toolResult,
			bucketSec: bucketSec ?? undefined,
			title,
			ohlcvFingerprint: integrity.data.fingerprint ?? undefined,
		},
	);

	return {ok: true, data: output};
}
