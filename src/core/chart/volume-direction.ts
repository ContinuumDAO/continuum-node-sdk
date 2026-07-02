import type {ChartTime} from './schemas.js';

export type VolumeBarDirection = 'up' | 'down';

export function chartTimeKey(time: ChartTime): string {
	if (typeof time === 'number') {
		return `u:${time}`;
	}
	return `d:${time.year}-${time.month}-${time.day}`;
}

export function candleDirection(open: number, close: number): VolumeBarDirection {
	return close >= open ? 'up' : 'down';
}

type CandlestickSeriesLike = {
	type: string;
	data: Record<string, unknown>[];
};

export function buildCandleDirectionMap(
	seriesList: CandlestickSeriesLike[],
): Map<string, VolumeBarDirection> {
	const map = new Map<string, VolumeBarDirection>();
	for (const series of seriesList) {
		if (series.type !== 'candlestick') {
			continue;
		}
		for (const row of series.data) {
			const open = row.open;
			const close = row.close;
			const time = row.time;
			if (
				typeof open !== 'number' ||
				typeof close !== 'number' ||
				!Number.isFinite(open) ||
				!Number.isFinite(close) ||
				time == null
			) {
				continue;
			}
			map.set(chartTimeKey(time as ChartTime), candleDirection(open, close));
		}
	}
	return map;
}

export function applyVolumeDirectionFromCandles<
	TSeries extends {type: string; data: Record<string, unknown>[]},
>(seriesList: TSeries[], enabled = true): TSeries[] {
	if (!enabled) {
		return seriesList;
	}
	const directions = buildCandleDirectionMap(seriesList);
	if (directions.size === 0) {
		return seriesList;
	}

	return seriesList.map(series => {
		if (series.type !== 'histogram') {
			return series;
		}
		return {
			...series,
			data: series.data.map(row => {
				if (typeof row.color === 'string' && row.color.trim()) {
					return row;
				}
				const time = row.time;
				if (time == null) {
					return row;
				}
				const direction = directions.get(chartTimeKey(time as ChartTime));
				if (!direction) {
					return row;
				}
				return {...row, direction};
			}),
		};
	});
}
