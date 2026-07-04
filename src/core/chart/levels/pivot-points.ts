import {calculateTechnicalIndicator} from '../../ta/calculate.js';
import type {SdkResult} from '../../result.js';
import {coerceFiniteNumber} from '../point-normalize.js';

export type PivotLevel = {
	id: string;
	price: number;
};

export type CalculatePivotPointsResult = {
	pivots: PivotLevel[];
	sourceBar: {high: number; low: number; close: number};
};

/** Classic floor pivot points from the last complete OHLC bar. */
export function calculatePivotPointsFromBars(
	bars: Record<string, unknown>[],
): SdkResult<CalculatePivotPointsResult> {
	if (!bars.length) {
		return {ok: false, reason: 'No OHLCV bars for pivot points.'};
	}
	const last = bars[bars.length - 1]!;
	const high = coerceFiniteNumber(last.high);
	const low = coerceFiniteNumber(last.low);
	const close = coerceFiniteNumber(last.close);
	if (high == null || low == null || close == null) {
		return {ok: false, reason: 'Last bar missing high/low/close for pivot points.'};
	}

	const result = calculateTechnicalIndicator({
		indicator: 'pivotpoints',
		input: {
			high: [high],
			low: [low],
			close: [close],
		},
	});
	if (!result.ok) {
		return result;
	}

	const row = (result.data.result as Array<Record<string, unknown>>)[0];
	if (!row || typeof row !== 'object') {
		return {ok: false, reason: 'pivotpoints returned no levels.'};
	}

	const pivots: PivotLevel[] = [];
	for (const [key, raw] of Object.entries(row)) {
		const price = typeof raw === 'number' ? raw : Number(raw);
		if (!Number.isFinite(price)) {
			continue;
		}
		pivots.push({id: key.toUpperCase(), price});
	}
	pivots.sort((a, b) => b.price - a.price);

	return {
		ok: true,
		data: {
			pivots,
			sourceBar: {high, low, close},
		},
	};
}
