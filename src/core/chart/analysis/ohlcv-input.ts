import {z} from 'zod';
import {extractOhlcvBarsFromUnknown, parseJsonIfString} from '../fetch-result.js';
import {sanitizeOhlcvBarRows} from '../ohlcv-window.js';

/** Shared OHLCV tool fields — agents often pass `label` and stringify `rows` / `toolResult`. */
export const OhlcvToolInputSchema = z
	.object({
		toolResult: z.unknown().optional(),
		rows: z.array(z.unknown()).min(1).optional(),
		title: z.string().trim().min(1).max(256).optional(),
		label: z.string().trim().min(1).max(128).optional(),
	})
	.strict();

export type OhlcvToolInput = z.infer<typeof OhlcvToolInputSchema>;

/** Parse stringified JSON rows/toolResult before zod validation (MCP agents often stringify arrays). */
export function preprocessOhlcvToolInput(raw: unknown): unknown {
	if (typeof raw !== 'object' || raw == null) {
		return raw;
	}
	const input = {...(raw as Record<string, unknown>)};
	for (const key of ['toolResult', 'executeResult', 'fetchResult'] as const) {
		if (key in input && input[key] != null) {
			input[key] = parseJsonIfString(input[key]);
		}
	}
	for (const key of ['rows', 'candles'] as const) {
		if (!(key in input) || input[key] == null) {
			continue;
		}
		const parsed = parseJsonIfString(input[key]);
		if (Array.isArray(parsed)) {
			input.rows = parsed;
			if (key === 'candles') {
				delete input.candles;
			}
		}
	}
	return input;
}

export function barsFromOhlcvToolInput(input: {
	toolResult?: unknown;
	rows?: unknown[];
	executeResult?: unknown;
	fetchResult?: unknown;
	maxPoints?: number;
}): Record<string, unknown>[] {
	const extractOptions = {maxPoints: input.maxPoints ?? 10_000};
	const fromTool = (() => {
		for (const source of [input.toolResult, input.executeResult, input.fetchResult]) {
			if (source == null) {
				continue;
			}
			const bars = extractOhlcvBarsFromUnknown(source, extractOptions);
			if (bars?.length) {
				return bars as Record<string, unknown>[];
			}
		}
		return [];
	})();
	const raw =
		(fromTool.length ? fromTool : null) ??
		(input.rows?.length ? (input.rows as Record<string, unknown>[]) : null) ??
		[];
	return sanitizeOhlcvBarRows(raw);
}

export function missingOhlcvBarsReason(input: {
	toolResult?: unknown;
	rows?: unknown;
}): string {
	if (typeof input.toolResult === 'string') {
		const trimmed = input.toolResult.trim();
		if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
			return (
				'Could not extract OHLCV bars from string `toolResult` (JSON may be truncated). ' +
				'Pass the full fetch MCP JSON or pass `rows` as a candle array (not a string).'
			);
		}
	}
	if (typeof input.rows === 'string') {
		return (
			'`rows` was a JSON string but did not parse to a candle array. ' +
			'Pass `rows` as an array or use full fetch JSON as `toolResult`.'
		);
	}
	return 'Provide OHLCV `rows` (candle array) or full fetch JSON as `toolResult`.';
}
