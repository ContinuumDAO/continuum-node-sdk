import {parseChartTimeFromRow} from '../point-normalize.js';

export function barTimeSecFromRow(row: Record<string, unknown>): number | null {
	const time = parseChartTimeFromRow(row);
	if (time == null) {
		return null;
	}
	if (typeof time === 'number') {
		return time;
	}
	return Math.floor(Date.UTC(time.year, time.month - 1, time.day) / 1000);
}

/** Union bars by timestamp; incoming rows replace existing at the same time. */
export function mergeBarsByTimestamp(
	existing: Record<string, unknown>[],
	incoming: Record<string, unknown>[],
): Record<string, unknown>[] {
	const byTime = new Map<number, Record<string, unknown>>();
	for (const bar of existing) {
		const timeSec = barTimeSecFromRow(bar);
		if (timeSec != null) {
			byTime.set(timeSec, bar);
		}
	}
	for (const bar of incoming) {
		const timeSec = barTimeSecFromRow(bar);
		if (timeSec != null) {
			byTime.set(timeSec, {...bar});
		}
	}
	return [...byTime.entries()]
		.sort((a, b) => a[0] - b[0])
		.map(([, bar]) => bar);
}

/** True when adjacent bars in the checked tail are not spaced by expectedPeriodSec. */
export function seriesHasTimestampGaps(
	bars: Record<string, unknown>[],
	expectedPeriodSec: number,
	options: {tailBarCount?: number} = {},
): boolean {
	if (bars.length < 2 || expectedPeriodSec <= 0) {
		return false;
	}
	const tailBarCount = Math.min(
		options.tailBarCount ?? bars.length - 1,
		bars.length - 1,
	);
	if (tailBarCount <= 0) {
		return false;
	}
	for (let i = bars.length - tailBarCount; i < bars.length; i++) {
		const prevSec = barTimeSecFromRow(bars[i - 1]!);
		const curSec = barTimeSecFromRow(bars[i]!);
		if (prevSec == null || curSec == null) {
			continue;
		}
		if (curSec - prevSec !== expectedPeriodSec) {
			return true;
		}
	}
	return false;
}
