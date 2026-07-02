import type {SdkResult} from '../result.js';
import {prepareChart} from './prepare.js';
import type {PrepareChartInput, PrepareChartOutput} from './schemas.js';

export type OhlcvRow = {
	timeMs?: number;
	timeSec?: number;
	time?: string | number;
	open: number;
	high: number;
	low: number;
	close: number;
	volume?: number;
};

export type OhlcvToPrepareChartInputOptions = {
	title?: string;
	height?: number;
	maxPoints?: number;
	includeVolume?: boolean;
	label?: string;
};

function rowTime(raw: OhlcvRow): unknown {
	if (raw.time != null) {
		return raw.time;
	}
	if (raw.timeSec != null && Number.isFinite(raw.timeSec)) {
		return raw.timeSec;
	}
	if (raw.timeMs != null && Number.isFinite(raw.timeMs)) {
		return raw.timeMs;
	}
	return null;
}

/** Map a single external OHLCV row (Hyperliquid, GMX, Binance kline, etc.) to prepareChart candle fields. */
export function normalizeOhlcvRow(raw: Record<string, unknown>): Record<string, unknown> | null {
	const time = rowTime(raw as OhlcvRow) ?? raw.timestampMs ?? raw.openTime ?? raw.timestamp;
	const open = raw.open;
	const high = raw.high;
	const low = raw.low;
	const close = raw.close;
	if (time == null || open == null || high == null || low == null || close == null) {
		return null;
	}
	const out: Record<string, unknown> = {time, open, high, low, close};
	if (raw.volume != null) {
		out.volume = raw.volume;
	}
	return out;
}

/** Map generic OHLCV rows to prepareChart input (candlestick + optional volume histogram). */
export function ohlcvToPrepareChartInput(
	rows: OhlcvRow[],
	options: OhlcvToPrepareChartInputOptions,
): PrepareChartInput {
	const includeVolume = options.includeVolume !== false;
	const candles = rows
		.map((row) => {
			const time = rowTime(row);
			if (time == null) {
				return null;
			}
			return {
				time,
				open: row.open,
				high: row.high,
				low: row.low,
				close: row.close,
			};
		})
		.filter((row): row is NonNullable<typeof row> => row != null);

	const label = options.label ?? 'Price';
	const input: PrepareChartInput = {
		...(options.title?.trim() ? {title: options.title.trim()} : {}),
		height: options.height,
		...(options.maxPoints != null ? {options: {maxPoints: options.maxPoints}} : {}),
		series: [{id: 'candles', type: 'candlestick', label, data: candles}],
	};

	if (includeVolume) {
		const volume = rows
			.map((row) => {
				const time = rowTime(row);
				if (time == null || row.volume == null || !Number.isFinite(row.volume)) {
					return null;
				}
				return {time, value: row.volume};
			})
			.filter((row): row is NonNullable<typeof row> => row != null);
		if (volume.length > 0) {
			input.series.push({id: 'volume', type: 'histogram', label: 'Volume', data: volume});
		}
	}

	return input;
}

/** Map OHLCV rows to a full chart envelope (DeFi UIs, scripts, KeyGen attachments). */
export function ohlcvRowsToChartOutput(
	rows: OhlcvRow[],
	options: OhlcvToPrepareChartInputOptions = {},
): SdkResult<PrepareChartOutput> {
	if (!rows.length) {
		return {ok: false, reason: 'At least one OHLCV row is required.'};
	}
	return prepareChart(ohlcvToPrepareChartInput(rows, options));
}
