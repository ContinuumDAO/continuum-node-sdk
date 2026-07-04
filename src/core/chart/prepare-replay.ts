import {
	buildDefaultCandlestickOverlays,
	primaryCandlestickSeriesId,
} from './chart-defaults.js';
import type {ChartOverlayInput} from './overlay-schemas.js';
import type {ChartPrepareReplay, PrepareChartInput} from './schemas.js';

/** Capture overlay/drawing config for live tick re-prepare. */
export function buildPrepareReplay(
	input: PrepareChartInput,
): ChartPrepareReplay | undefined {
	const replay: ChartPrepareReplay = {};
	const hasSkip = input.options?.skipDefaultOverlays === true;
	if (hasSkip) {
		replay.skipDefaultOverlays = true;
	}

	const drawings = input.drawings?.length ? [...input.drawings] : [];
	let indicatorOverlays: ChartOverlayInput[] | undefined;

	if (input.overlays !== undefined) {
		indicatorOverlays = [...input.overlays];
	} else if (!hasSkip) {
		const sourceId = primaryCandlestickSeriesId(input.series);
		const candle = sourceId
			? input.series.find(s => s.id === sourceId)
			: undefined;
		const barCount = candle?.data.length ?? 0;
		if (sourceId && barCount > 0) {
			const defaults = buildDefaultCandlestickOverlays(sourceId, barCount);
			if (defaults.length > 0) {
				indicatorOverlays = defaults;
				replay.usedDefaultOverlays = true;
			}
		}
	}

	const merged = [...(indicatorOverlays ?? []), ...drawings];
	if (merged.length > 0) {
		replay.overlays = merged;
	} else if (input.overlays !== undefined) {
		replay.overlays = [];
	} else if (hasSkip) {
		replay.overlays = drawings.length ? drawings : [];
	}

	if (
		replay.overlays === undefined &&
		!replay.skipDefaultOverlays &&
		!replay.usedDefaultOverlays
	) {
		return undefined;
	}
	return replay;
}

/** Apply stored replay config onto a minimal candlestick-only prepare input. */
export function applyPrepareReplayToInput(
	base: PrepareChartInput,
	replay?: ChartPrepareReplay,
): PrepareChartInput {
	if (!replay) {
		return base;
	}
	const options = {...(base.options ?? {})};
	if (replay.skipDefaultOverlays) {
		options.skipDefaultOverlays = true;
	}
	const out: PrepareChartInput = {...base, options};
	if (replay.overlays !== undefined) {
		out.overlays = replay.overlays;
	}
	return out;
}
