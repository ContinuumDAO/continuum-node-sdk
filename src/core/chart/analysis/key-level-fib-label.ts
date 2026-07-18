const FIB_AXIS_LABEL_LEVELS = new Set([0, 0.618, 1]);

/** Whether a Fibonacci level should show an axis price label on the chart. */
export function fibLevelShowsAxisLabel(level: number, isHighlight: boolean): boolean {
	return isHighlight && FIB_AXIS_LABEL_LEVELS.has(level);
}
