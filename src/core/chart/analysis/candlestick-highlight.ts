export type CandlestickPreviewBar = {
	index: number;
	open: number;
	high: number;
	low: number;
	close: number;
	isFocus: boolean;
};

export type CandlestickPatternFound = {
	id: string;
	name: string;
	direction: 'bullish' | 'bearish' | 'neutral';
	confidence: number;
};

export type CandlestickHighlight = {
	summary: string;
	recommendation: 'buy' | 'sell' | 'hold';
	recommendationConfidence: number;
	primaryPattern: {
		id: string;
		name: string;
		description: string;
		direction?: 'bullish' | 'bearish' | 'neutral';
	} | null;
	patternsFound: CandlestickPatternFound[];
	focusBarIndex: number;
	previewBars: CandlestickPreviewBar[];
	previewBarCount: number;
};

const PREVIEW_BAR_COUNT = 5;

type OhlcBar = {
	open: number;
	high: number;
	low: number;
	close: number;
};

function recommendationLabel(recommendation: 'buy' | 'sell' | 'hold'): string {
	if (recommendation === 'buy') {
		return 'bullish';
	}
	if (recommendation === 'sell') {
		return 'bearish';
	}
	return 'neutral';
}

function buildHighlightSummary(input: {
	primaryPattern: CandlestickHighlight['primaryPattern'];
	recommendation: 'buy' | 'sell' | 'hold';
	patternsFound: CandlestickPatternFound[];
}): string {
	if (!input.primaryPattern) {
		return 'No candlestick pattern detected on the focus bar — neutral / indecision.';
	}
	const bias = recommendationLabel(input.recommendation);
	const extra =
		input.patternsFound.length > 1
			? ` (${input.patternsFound.length} patterns on focus bar)`
			: '';
	return `${input.primaryPattern.name} — ${bias} signal${extra}.`;
}

export function buildCandlestickHighlight(input: {
	bars: OhlcBar[];
	focusBarIndex: number;
	primaryPattern: {
		id: string;
		name: string;
		description: string;
	} | null;
	patterns: Array<{
		id: string;
		name: string;
		direction: 'bullish' | 'bearish' | 'neutral';
		confidence: number;
	}>;
	recommendation: 'buy' | 'sell' | 'hold';
	recommendationConfidence: number;
	previewCount?: number;
}): CandlestickHighlight {
	const previewCount = Math.max(1, Math.min(input.previewCount ?? PREVIEW_BAR_COUNT, 8));
	const startIndex = Math.max(0, input.focusBarIndex - previewCount + 1);
	const previewBars: CandlestickPreviewBar[] = [];
	for (let i = startIndex; i <= input.focusBarIndex; i++) {
		const bar = input.bars[i];
		if (!bar) {
			continue;
		}
		previewBars.push({
			index: i,
			open: bar.open,
			high: bar.high,
			low: bar.low,
			close: bar.close,
			isFocus: i === input.focusBarIndex,
		});
	}
	const patternsFound = input.patterns.map(hit => ({
		id: hit.id,
		name: hit.name,
		direction: hit.direction,
		confidence: hit.confidence,
	}));
	const primaryHit = input.primaryPattern
		? input.patterns.find(p => p.id === input.primaryPattern!.id)
		: undefined;
	const primaryPattern = input.primaryPattern
		? {
				id: input.primaryPattern.id,
				name: input.primaryPattern.name,
				description: input.primaryPattern.description,
				...(primaryHit ? {direction: primaryHit.direction} : {}),
			}
		: null;
	return {
		summary: buildHighlightSummary({
			primaryPattern,
			recommendation: input.recommendation,
			patternsFound,
		}),
		recommendation: input.recommendation,
		recommendationConfidence: input.recommendationConfidence,
		primaryPattern,
		patternsFound,
		focusBarIndex: input.focusBarIndex,
		previewBars,
		previewBarCount: previewBars.length,
	};
}
