import type {ChartOverlayInput} from './overlay-schemas.js';
import type {PrepareChartInput} from './schemas.js';

/** Default EMA on candlestick charts when the caller omits `overlays`. */
export const DEFAULT_CHART_EMA_PERIOD = 50;
/** Default RSI oscillator pane when the caller omits `overlays`. */
export const DEFAULT_CHART_RSI_PERIOD = 14;

export function primaryCandlestickSeriesId(
	series: PrepareChartInput['series'],
): string | null {
	const candle = series.find(s => s.type === 'candlestick');
	return candle?.id ?? null;
}

export function hasHistogramVolumeSeries(series: PrepareChartInput['series']): boolean {
	return series.some(s => s.type === 'histogram');
}

/** Promote per-bar `volume` on candlestick rows into a histogram series when none exists. */
export function ensureVolumeHistogramSeries(
	input: PrepareChartInput,
): PrepareChartInput {
	if (hasHistogramVolumeSeries(input.series)) {
		return input;
	}

	const candle = input.series.find(s => s.type === 'candlestick');
	if (!candle) {
		return input;
	}

	const volumeData: Record<string, unknown>[] = [];
	for (const row of candle.data) {
		const time = row.time;
		const volume = row.volume;
		if (
			time == null ||
			typeof volume !== 'number' ||
			!Number.isFinite(volume) ||
			volume < 0
		) {
			continue;
		}
		volumeData.push({time, value: volume});
	}

	if (volumeData.length === 0) {
		return input;
	}

	return {
		...input,
		series: [
			...input.series,
			{
				id: 'volume',
				type: 'histogram',
				label: 'Volume',
				priceScaleId: 'left',
				data: volumeData,
			},
		],
	};
}

export function buildDefaultCandlestickOverlays(
	sourceSeriesId: string,
	barCount: number,
): ChartOverlayInput[] {
	const overlays: ChartOverlayInput[] = [];
	if (barCount >= DEFAULT_CHART_EMA_PERIOD) {
		overlays.push({
			type: 'ema',
			sourceSeriesId,
			period: DEFAULT_CHART_EMA_PERIOD,
			label: `EMA(${DEFAULT_CHART_EMA_PERIOD})`,
			overlay: true,
		});
	}
	if (barCount > DEFAULT_CHART_RSI_PERIOD) {
		overlays.push({
			type: 'rsi',
			sourceSeriesId,
			period: DEFAULT_CHART_RSI_PERIOD,
			label: `RSI(${DEFAULT_CHART_RSI_PERIOD})`,
		});
	}
	return overlays;
}

export function shouldApplyDefaultCandlestickOverlays(
	series: PrepareChartInput['series'],
): boolean {
	if (!series.some(s => s.type === 'candlestick')) {
		return false;
	}
	// Hand-built overlay lines or extra price series → caller controls indicators.
	if (series.some(s => s.type === 'line' || s.type === 'area')) {
		return false;
	}
	return true;
}

export function resolvePrepareChartOverlays(
	input: PrepareChartInput,
): ChartOverlayInput[] | undefined {
	if (input.overlays?.length) {
		return input.overlays;
	}
	if (input.options?.skipDefaultOverlays) {
		return undefined;
	}
	if (!shouldApplyDefaultCandlestickOverlays(input.series)) {
		return undefined;
	}
	const sourceId = primaryCandlestickSeriesId(input.series);
	if (!sourceId) {
		return undefined;
	}
	const candle = input.series.find(s => s.id === sourceId);
	const barCount = candle?.data.length ?? 0;
	const defaults = buildDefaultCandlestickOverlays(sourceId, barCount);
	return defaults.length > 0 ? defaults : undefined;
}
