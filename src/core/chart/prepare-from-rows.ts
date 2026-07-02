import {z} from 'zod';
import type {SdkResult} from '../result.js';
import {extractOhlcvBarsFromUnknown, parseJsonIfString} from './fetch-result.js';
import {prepareChart} from './prepare.js';
import type {PrepareChartOutput} from './schemas.js';
import {PrepareChartInputSchema, PrepareChartOutputSchema} from './schemas.js';

const PrepareChartFromRowsOptionsSchema = z
	.object({
		maxPoints: z.number().int().min(2).max(5_000).optional(),
		skipDefaultOverlays: z.boolean().optional(),
		colorVolumeFromCandles: z.boolean().optional(),
	})
	.strict()
	.optional();

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
	return input;
}

const PrepareChartFromRowsInputInnerSchema = z
	.object({
		/** OHLCV rows from any fetch tool (preferred). */
		rows: z.array(z.unknown()).min(1).optional(),
		/** Full JSON from a prior MCP tool call; bars are extracted automatically. */
		toolResult: z.unknown().optional(),
		title: z.string().max(256).optional(),
		label: z.string().max(128).optional(),
		height: z.number().int().min(120).max(800).optional(),
		options: PrepareChartFromRowsOptionsSchema,
	})
	.strict()
	.superRefine((input, ctx) => {
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
	const bars =
		(data.rows?.length ? data.rows : null) ??
		extractOhlcvBarsFromUnknown(data.toolResult) ??
		[];

	if (!bars.length) {
		return {
			ok: false,
			reason:
				'No OHLCV bars found. Pass `rows` from your fetch tool or `toolResult` (e.g. `{ result: [...] }` or `{ ohlcv: { candles: [...] } }`).',
		};
	}

	const prepareInput = PrepareChartInputSchema.parse({
		...(data.title?.trim() ? {title: data.title.trim()} : {}),
		...(data.label?.trim() ? {label: data.label.trim()} : {}),
		...(data.height != null ? {height: data.height} : {}),
		bars,
		options: {
			maxPoints: 400,
			...data.options,
		},
	});

	return prepareChart(prepareInput);
}
