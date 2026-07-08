import type {ChartTime} from './schemas.js';

type TimedRow = {time: ChartTime; [key: string]: unknown};

function timeSortKey(time: ChartTime): number {
	if (typeof time === 'number') {
		return time;
	}
	return time.year * 10_000 + time.month * 100 + time.day;
}

function coerceNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === 'string' && value.trim() !== '') {
		const n = Number(value);
		return Number.isFinite(n) ? n : null;
	}
	return null;
}

/** Reduce series length to maxPoints while keeping the full time span (OHLCV-aware). */
export function downsampleSeriesRowsForDisplay<
	T extends TimedRow,
>(
	rows: T[],
	maxPoints: number,
	seriesType: 'candlestick' | 'histogram' | 'line' | 'area',
): T[] {
	if (maxPoints <= 0 || rows.length <= maxPoints) {
		return rows;
	}

	const sorted = [...rows].sort((a, b) => timeSortKey(a.time) - timeSortKey(b.time));
	const bucketCount = maxPoints;
	const bucketSize = sorted.length / bucketCount;
	const out: T[] = [];

	for (let i = 0; i < bucketCount; i++) {
		const start = Math.floor(i * bucketSize);
		const end = Math.min(sorted.length, Math.floor((i + 1) * bucketSize));
		if (start >= end) {
			continue;
		}
		const slice = sorted.slice(start, end);
		const first = slice[0]!;
		const last = slice[slice.length - 1]!;

		if (seriesType === 'candlestick') {
			let high = -Infinity;
			let low = Infinity;
			for (const row of slice) {
				const h = coerceNumber(row.high);
				const l = coerceNumber(row.low);
				if (h != null) {
					high = Math.max(high, h);
				}
				if (l != null) {
					low = Math.min(low, l);
				}
			}
			out.push({
				...first,
				time: first.time,
				open: coerceNumber(first.open) ?? coerceNumber(first.close) ?? 0,
				high: Number.isFinite(high) ? high : coerceNumber(first.high) ?? 0,
				low: Number.isFinite(low) ? low : coerceNumber(first.low) ?? 0,
				close: coerceNumber(last.close) ?? coerceNumber(last.open) ?? 0,
			} as T);
			continue;
		}

		if (seriesType === 'histogram') {
			let sum = 0;
			for (const row of slice) {
				sum += coerceNumber(row.value) ?? 0;
			}
			out.push({
				...first,
				time: first.time,
				value: sum,
			} as T);
			continue;
		}

		// line / area — last value in bucket
		out.push({
			...last,
			time: first.time,
			value: coerceNumber(last.value) ?? coerceNumber(first.value) ?? 0,
		} as T);
	}

	return out;
}
