import {buildPatternDrawingSpec} from './drawing-spec.js';
import {computeMeasuredMove} from './measured-move.js';
import {computeVolumeConfirmation} from './volume-confirmation.js';
import type {ChartPatternHit, EnrichedChartPatternHit, NormalizedBar} from './types.js';

export function enrichChartPatternHit(
	hit: ChartPatternHit,
	bars: NormalizedBar[],
	rawBars: Record<string, unknown>[],
): EnrichedChartPatternHit {
	const drawingSpec = buildPatternDrawingSpec(hit, bars);
	const measuredMove = computeMeasuredMove(hit, bars) ?? undefined;
	const volumeConfirmation = computeVolumeConfirmation(hit, bars, rawBars);
	const drawable = drawingSpec.elements.length > 0;
	return {
		...hit,
		drawingSpec,
		drawable,
		measuredMove,
		volumeConfirmation,
	};
}

export function enrichChartPatternHits(
	hits: ChartPatternHit[],
	bars: NormalizedBar[],
	rawBars: Record<string, unknown>[],
): EnrichedChartPatternHit[] {
	return hits.map(hit => enrichChartPatternHit(hit, bars, rawBars));
}
