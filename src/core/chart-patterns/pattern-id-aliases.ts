import type {ChartPatternId} from './types.js';

const PATTERN_ID_ALIASES: Record<string, ChartPatternId> = {
	adam_eve_double_bottom: 'double_bottom_adam_eve',
	double_bottom_adam_eve: 'double_bottom_adam_eve',
	breakout_retest_bullish: 'trendline_breakout_retest_bullish',
	breakout_retest_bearish: 'trendline_breakout_retest_bearish',
	trendline_breakout_retest: 'trendline_breakout_retest_bullish',
	head_shoulders: 'head_and_shoulders',
	inverse_head_shoulders: 'inverse_head_and_shoulders',
};

export function normalizeChartPatternId(raw: string | undefined): ChartPatternId | undefined {
	if (!raw?.trim()) {
		return undefined;
	}
	const key = raw.trim().toLowerCase();
	return (PATTERN_ID_ALIASES[key] ?? key) as ChartPatternId;
}
