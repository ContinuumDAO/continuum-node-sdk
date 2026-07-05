import type {ChartPatternCatalogEntry, ChartPatternId} from './types.js';

export const CHART_PATTERN_CATALOG: ChartPatternCatalogEntry[] = [
	{
		id: 'head_and_shoulders',
		name: 'Head & Shoulders',
		category: 'reversal',
		direction: 'bearish',
		minBars: 35,
		description: 'Three swing highs with a taller central head and a neckline through intervening lows.',
		interpretation:
			'Head & shoulders suggests distribution after an uptrend; a break below the neckline often confirms bearish reversal. Confirm with volume and broader trend context.',
	},
	{
		id: 'inverse_head_and_shoulders',
		name: 'Inverse Head & Shoulders',
		category: 'reversal',
		direction: 'bullish',
		minBars: 35,
		description: 'Three swing lows with a deeper central trough and a neckline through intervening highs.',
		interpretation:
			'Inverse head & shoulders suggests accumulation after a decline; a break above the neckline often confirms bullish reversal. Confirm with volume and trend context.',
	},
	{
		id: 'double_top',
		name: 'Double Top',
		category: 'reversal',
		direction: 'bearish',
		minBars: 25,
		description: 'Two similar swing highs separated by an intervening valley.',
		interpretation:
			'Double top indicates resistance held twice; a break below the valley neckline targets further downside. Standalone hit rate is moderate — use as a filter.',
	},
	{
		id: 'double_bottom',
		name: 'Double Bottom',
		category: 'reversal',
		direction: 'bullish',
		minBars: 25,
		description: 'Two similar swing lows separated by an intervening peak.',
		interpretation:
			'Double bottom indicates support held twice; a break above the peak neckline targets further upside. Confirm with trend and momentum.',
	},
	{
		id: 'double_bottom_adam_eve',
		name: 'Adam & Eve Double Bottom',
		category: 'reversal',
		direction: 'bullish',
		minBars: 30,
		description: 'Double bottom with a sharp first trough (Adam) and rounded second trough (Eve).',
		interpretation:
			'Adam & Eve double bottom often marks a stronger bullish reversal than a plain double bottom; Eve rounding shows absorption. Break above the peak confirms.',
	},
	{
		id: 'ascending_triangle',
		name: 'Ascending Triangle',
		category: 'continuation',
		direction: 'bullish',
		minBars: 25,
		description: 'Flat resistance with rising swing lows converging upward.',
		interpretation:
			'Ascending triangle is typically bullish continuation; a breakout above flat resistance often resumes the prior uptrend.',
	},
	{
		id: 'descending_triangle',
		name: 'Descending Triangle',
		category: 'continuation',
		direction: 'bearish',
		minBars: 25,
		description: 'Flat support with falling swing highs converging downward.',
		interpretation:
			'Descending triangle is typically bearish continuation; a breakdown below flat support often resumes the prior downtrend.',
	},
	{
		id: 'symmetrical_triangle',
		name: 'Symmetrical Triangle',
		category: 'continuation',
		direction: 'neutral',
		minBars: 25,
		description: 'Converging lower highs and higher lows with no clear horizontal boundary.',
		interpretation:
			'Symmetrical triangle shows compression; breakout direction usually follows the prior trend but can go either way — treat as neutral until confirmed.',
	},
	{
		id: 'pennant_bullish',
		name: 'Bullish Pennant',
		category: 'continuation',
		direction: 'bullish',
		minBars: 20,
		description: 'Sharp upward pole followed by a small converging consolidation.',
		interpretation:
			'Bullish pennant is a brief pause after a strong rally; continuation above the pennant often targets the pole height extension.',
	},
	{
		id: 'pennant_bearish',
		name: 'Bearish Pennant',
		category: 'continuation',
		direction: 'bearish',
		minBars: 20,
		description: 'Sharp downward pole followed by a small converging consolidation.',
		interpretation:
			'Bearish pennant is a brief pause after a sharp decline; continuation below the pennant often targets the pole depth extension.',
	},
	{
		id: 'flag_bullish',
		name: 'Bull Flag',
		category: 'continuation',
		direction: 'bullish',
		minBars: 25,
		description: 'Strong upward pole with a shallow downward or sideways channel.',
		interpretation:
			'Bull flag suggests healthy consolidation in an uptrend; breakout above the flag channel often resumes the rally.',
	},
	{
		id: 'flag_bearish',
		name: 'Bear Flag',
		category: 'continuation',
		direction: 'bearish',
		minBars: 25,
		description: 'Strong downward pole with a shallow upward or sideways channel.',
		interpretation:
			'Bear flag suggests consolidation in a downtrend; breakdown below the flag channel often resumes the decline.',
	},
	{
		id: 'rising_wedge',
		name: 'Rising Wedge',
		category: 'reversal',
		direction: 'bearish',
		minBars: 25,
		description: 'Both trend lines slope upward with narrowing range.',
		interpretation:
			'Rising wedge often appears late in an advance and can signal bearish reversal or exhaustion; watch for breakdown below support line.',
	},
	{
		id: 'falling_wedge',
		name: 'Falling Wedge',
		category: 'reversal',
		direction: 'bullish',
		minBars: 25,
		description: 'Both trend lines slope downward with narrowing range.',
		interpretation:
			'Falling wedge often appears late in a decline and can signal bullish reversal; watch for breakout above resistance line.',
	},
	{
		id: 'channel_up',
		name: 'Ascending Channel',
		category: 'continuation',
		direction: 'bullish',
		minBars: 30,
		description: 'Parallel upward-sloping support and resistance lines.',
		interpretation:
			'Ascending channel indicates orderly uptrend; bounces off support and rejections at resistance define the range until a channel break.',
	},
	{
		id: 'channel_down',
		name: 'Descending Channel',
		category: 'continuation',
		direction: 'bearish',
		minBars: 30,
		description: 'Parallel downward-sloping support and resistance lines.',
		interpretation:
			'Descending channel indicates orderly downtrend; rallies to resistance and breaks below support define continuation risk.',
	},
	{
		id: 'cup_and_handle',
		name: 'Cup and Handle',
		category: 'continuation',
		direction: 'bullish',
		minBars: 40,
		description: 'U-shaped cup between two rims with a shallow handle pullback on the right.',
		interpretation:
			'Cup and handle suggests accumulation and bullish continuation; a break above the right rim often targets the cup depth as measured move.',
	},
	{
		id: 'trendline_breakout_bullish',
		name: 'Trendline Breakout (Bullish)',
		category: 'continuation',
		direction: 'bullish',
		minBars: 20,
		description: 'Close breaks above a diagonal resistance trendline with measurable follow-through.',
		interpretation:
			'Bullish trendline breakout suggests continuation above broken resistance (now potential support). Confirm with retest hold or volume when available.',
	},
	{
		id: 'trendline_breakout_bearish',
		name: 'Trendline Breakout (Bearish)',
		category: 'continuation',
		direction: 'bearish',
		minBars: 20,
		description: 'Close breaks below a diagonal support trendline with measurable follow-through.',
		interpretation:
			'Bearish trendline breakdown suggests continuation below broken support (now potential resistance). Confirm with retest rejection when available.',
	},
	{
		id: 'trendline_breakout_retest_bullish',
		name: 'Trendline Breakout Retest (Bullish)',
		category: 'continuation',
		direction: 'bullish',
		minBars: 20,
		description:
			'Resistance trendline broken, then price revisits the line within a tolerance band of the post-breakout excursion.',
		interpretation:
			'Bullish breakout-and-retest is a classic continuation setup: broken resistance held as support on pullback. Stronger confirmation than breakout alone.',
	},
	{
		id: 'trendline_breakout_retest_bearish',
		name: 'Trendline Breakout Retest (Bearish)',
		category: 'continuation',
		direction: 'bearish',
		minBars: 20,
		description:
			'Support trendline broken, then price revisits the line within a tolerance band of the post-breakdown excursion.',
		interpretation:
			'Bearish breakdown-and-retest is a classic continuation setup: broken support held as resistance on rally. Stronger confirmation than breakdown alone.',
	},
];

const catalogById = new Map(CHART_PATTERN_CATALOG.map(entry => [entry.id, entry]));

export function getChartPatternCatalogEntry(id: ChartPatternId): ChartPatternCatalogEntry | undefined {
	return catalogById.get(id);
}

export function filterChartPatternIds(requested?: string[]): ChartPatternId[] | undefined {
	if (!requested?.length) {
		return undefined;
	}
	const allowed = new Set(CHART_PATTERN_CATALOG.map(e => e.id));
	const out: ChartPatternId[] = [];
	for (const id of requested) {
		if (allowed.has(id as ChartPatternId)) {
			out.push(id as ChartPatternId);
		}
	}
	return out.length ? out : undefined;
}

export function maxChartPatternMinBars(ids?: ChartPatternId[]): number {
	const entries = ids?.length
		? ids.map(id => getChartPatternCatalogEntry(id)).filter((e): e is ChartPatternCatalogEntry => e != null)
		: CHART_PATTERN_CATALOG;
	if (!entries.length) {
		return 40;
	}
	return Math.max(...entries.map(e => e.minBars));
}

export function chartPatternsScannedCount(ids?: ChartPatternId[]): number {
	return ids?.length ?? CHART_PATTERN_CATALOG.length;
}
