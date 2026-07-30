import {calculateTechnicalIndicator} from '../ta/calculate.js';
import type {SdkResult} from '../result.js';
import {PATTERN_OVERLAY_STYLE} from '../chart-patterns/drawing-spec.js';
import type {ChartSeriesStyle, ChartTime} from './schemas.js';
import type {PrepareChartOutput} from './schemas.js';
import type {ChartOverlayInput} from './overlay-schemas.js';
import {fibLevelShowsAxisLabel} from './analysis/key-level-fib-label.js';

type NormalizedChartSeries = PrepareChartOutput['chart']['series'][number];

const DEFAULT_MA_PERIOD = 20;
const DEFAULT_BOLLINGER_PERIOD = 20;
const DEFAULT_BOLLINGER_STD_DEV = 2;
const DEFAULT_BOLLINGER_FILL_COLOR = '#6366f133';
/** Analysis/overlay desk default (aligned with TA catalog donchianchannels). */
const DEFAULT_DONCHIAN_PERIOD = 20;
const DEFAULT_DONCHIAN_FILL_COLOR = '#0ea5e933';
const DEFAULT_SUPERTREND_PERIOD = 10;
const DEFAULT_SUPERTREND_MULTIPLIER = 3;
const SUPERTREND_UP_COLOR = '#22c55e';
const SUPERTREND_DOWN_COLOR = '#ef4444';
/** Cap colored ST segments so total chart series stay under the expand limit. */
const MAX_SUPERTREND_SEGMENTS = 10;
const DEFAULT_ICHIMOKU_CONVERSION = 9;
const DEFAULT_ICHIMOKU_BASE = 26;
const DEFAULT_ICHIMOKU_SPAN = 52;
const DEFAULT_ICHIMOKU_DISPLACEMENT = 26;
const ICHIMOKU_TENKAN_COLOR = '#3b82f6';
const ICHIMOKU_KIJUN_COLOR = '#ef4444';
const ICHIMOKU_CHIKOU_COLOR = '#a855f7';
const ICHIMOKU_CLOUD_BULL_COLOR = '#22c55e33';
const ICHIMOKU_CLOUD_BEAR_COLOR = '#ef444433';
const DEFAULT_RSI_PERIOD = 14;
const DEFAULT_ZSCORE_PERIOD = 20;
const DEFAULT_ZSCORE_ENTRY = 2;
const DEFAULT_ZSCORE_EXIT = 0.5;
const MACD_HIST_UP = '#22c55e';
const MACD_HIST_DOWN = '#ef4444';
const ALL_FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

type SourceSeries = {
	times: ChartTime[];
	closes: number[];
	/** Per-bar highs/lows when source is candlestick (required for Donchian). */
	highs?: number[];
	lows?: number[];
	high: number;
	low: number;
};

function findSourceSeries(
	seriesList: NormalizedChartSeries[],
	sourceSeriesId: string,
): SdkResult<SourceSeries> {
	const source = seriesList.find(s => s.id === sourceSeriesId);
	if (!source) {
		return {ok: false, reason: `Overlay source series "${sourceSeriesId}" not found.`};
	}

	const times: ChartTime[] = [];
	const closes: number[] = [];
	const highs: number[] = [];
	const lows: number[] = [];
	let high = Number.NEGATIVE_INFINITY;
	let low = Number.POSITIVE_INFINITY;
	let hasOhlc = false;

	for (const row of source.data) {
		const time = row.time as ChartTime | undefined;
		if (time == null) {
			continue;
		}
		if (source.type === 'candlestick') {
			const close = row.close;
			const rowHigh = row.high;
			const rowLow = row.low;
			if (
				typeof close !== 'number' ||
				typeof rowHigh !== 'number' ||
				typeof rowLow !== 'number' ||
				![close, rowHigh, rowLow].every(Number.isFinite)
			) {
				continue;
			}
			times.push(time);
			closes.push(close);
			highs.push(rowHigh);
			lows.push(rowLow);
			hasOhlc = true;
			high = Math.max(high, rowHigh);
			low = Math.min(low, rowLow);
			continue;
		}
		if (source.type === 'line' || source.type === 'area') {
			const value = row.value;
			if (typeof value !== 'number' || !Number.isFinite(value)) {
				continue;
			}
			times.push(time);
			closes.push(value);
			high = Math.max(high, value);
			low = Math.min(low, value);
		}
	}

	if (times.length === 0) {
		return {
			ok: false,
			reason: `Overlay source "${sourceSeriesId}" has no usable price points (use candlestick or line).`,
		};
	}
	if (!Number.isFinite(high) || !Number.isFinite(low)) {
		return {ok: false, reason: `Overlay source "${sourceSeriesId}" has invalid high/low range.`};
	}

	return {
		ok: true,
		data: {
			times,
			closes,
			...(hasOhlc ? {highs, lows} : {}),
			high,
			low,
		},
	};
}

function primaryTimeSpan(
	seriesList: NormalizedChartSeries[],
): SdkResult<{timeStart: ChartTime; timeEnd: ChartTime}> {
	const primary = seriesList.find(s => s.type === 'candlestick' || s.type === 'line');
	if (!primary || primary.data.length === 0) {
		return {
			ok: false,
			reason: 'Chart needs a candlestick or line series to span Fibonacci horizontal lines.',
		};
	}
	const times = primary.data.map(r => r.time as ChartTime).filter(t => t != null);
	if (times.length === 0) {
		return {ok: false, reason: 'Chart has no valid times for Fibonacci lines.'};
	}
	return {ok: true, data: {timeStart: times[0]!, timeEnd: times.at(-1)!}};
}

function alignNumericIndicator(
	times: ChartTime[],
	values: unknown[],
	warmupCount: number,
): {time: ChartTime; value: number}[] {
	const out: {time: ChartTime; value: number}[] = [];
	if (values.length < times.length) {
		const offset = times.length - values.length;
		for (let j = 0; j < values.length; j++) {
			const value = values[j];
			if (typeof value !== 'number' || !Number.isFinite(value)) {
				continue;
			}
			out.push({time: times[offset + j]!, value});
		}
		return out;
	}
	const len = Math.min(times.length, values.length);
	for (let i = warmupCount; i < len; i++) {
		const value = values[i];
		if (typeof value !== 'number' || !Number.isFinite(value)) {
			continue;
		}
		out.push({time: times[i]!, value});
	}
	return out;
}

function alignObjectIndicatorRows(
	times: ChartTime[],
	rows: unknown[],
	warmupCount: number,
): {time: ChartTime; row: Record<string, unknown>}[] {
	const out: {time: ChartTime; row: Record<string, unknown>}[] = [];
	if (rows.length < times.length) {
		const offset = times.length - rows.length;
		for (let j = 0; j < rows.length; j++) {
			const row = rows[j];
			if (!row || typeof row !== 'object') {
				continue;
			}
			out.push({time: times[offset + j]!, row: row as Record<string, unknown>});
		}
		return out;
	}
	const len = Math.min(times.length, rows.length);
	for (let i = warmupCount; i < len; i++) {
		const row = rows[i];
		if (!row || typeof row !== 'object') {
			continue;
		}
		out.push({time: times[i]!, row: row as Record<string, unknown>});
	}
	return out;
}

function computeMaOverlay(
	overlay: Extract<ChartOverlayInput, {type: 'sma' | 'ema'}>,
	source: SourceSeries,
): SdkResult<NormalizedChartSeries[]> {
	const period = overlay.period ?? DEFAULT_MA_PERIOD;
	const indicator = overlay.type;
	const result = calculateTechnicalIndicator({
		indicator,
		params: {period},
		input: {values: source.closes},
		options: {maxPoints: source.closes.length},
	});
	if (!result.ok) {
		return result;
	}
	const data = alignNumericIndicator(
		source.times,
		result.data.result,
		result.data.warmupCount,
	);
	if (data.length === 0) {
		return {
			ok: false,
			reason: `Overlay ${indicator}(${period}) has no points after warmup on source series.`,
		};
	}
	const id = overlay.id ?? `${indicator}${period}_${overlay.sourceSeriesId}`;
	const label = overlay.label ?? `${indicator.toUpperCase()}(${period})`;
	return {
		ok: true,
		data: [
			{
				id,
				type: 'line',
				label,
				data,
				priceScaleId: overlay.priceScaleId ?? 'right',
				overlay: overlay.overlay ?? true,
				style: overlay.style ?? {lineStyle: 'solid', lineWidth: 2},
			},
		],
	};
}

function computeBollingerOverlay(
	overlay: Extract<ChartOverlayInput, {type: 'bollinger'}>,
	source: SourceSeries,
): SdkResult<NormalizedChartSeries[]> {
	const period = overlay.period ?? DEFAULT_BOLLINGER_PERIOD;
	const stdDev = overlay.stdDev ?? DEFAULT_BOLLINGER_STD_DEV;
	const result = calculateTechnicalIndicator({
		indicator: 'bollingerbands',
		params: {period, stdDev},
		input: {values: source.closes},
		options: {maxPoints: source.closes.length},
	});
	if (!result.ok) {
		return result;
	}
	const rows = result.data.result;
	if (!Array.isArray(rows) || rows.length === 0) {
		return {ok: false, reason: 'Overlay bollinger returned no data.'};
	}

	const upper: {time: ChartTime; value: number}[] = [];
	const middle: {time: ChartTime; value: number}[] = [];
	const lower: {time: ChartTime; value: number}[] = [];
	const bandFill: {time: ChartTime; upper: number; lower: number}[] = [];
	const aligned = alignObjectIndicatorRows(source.times, rows, result.data.warmupCount);

	for (const {time, row} of aligned) {
		const u = pickNumber(row, ['upper', 'Upper']);
		const m = pickNumber(row, ['middle', 'Middle']);
		const l = pickNumber(row, ['lower', 'Lower']);
		if (u != null) {
			upper.push({time, value: u});
		}
		if (m != null) {
			middle.push({time, value: m});
		}
		if (l != null) {
			lower.push({time, value: l});
		}
		if (u != null && l != null) {
			bandFill.push({time, upper: u, lower: l});
		}
	}

	if (middle.length === 0) {
		return {
			ok: false,
			reason: `Overlay bollinger(${period}, ${stdDev}) has no points after warmup.`,
		};
	}

	const prefix = overlay.id ?? `bb${period}_${overlay.sourceSeriesId}`;
	const baseStyle = overlay.style ?? {lineWidth: 1};
	const showFill = overlay.fill !== false;
	const fillColor = overlay.style?.color ?? DEFAULT_BOLLINGER_FILL_COLOR;
	const seriesOut: NormalizedChartSeries[] = [];
	if (showFill && bandFill.length > 0) {
		seriesOut.push({
			id: `${prefix}_fill`,
			type: 'band',
			label: `BB fill (${period})`,
			data: bandFill,
			priceScaleId: overlay.priceScaleId ?? 'right',
			overlay: overlay.overlay ?? true,
			lastValueVisible: false,
			style: {color: fillColor, lineWidth: 1},
		});
	}
	return {
		ok: true,
		data: [
			...seriesOut,
			{
				id: `${prefix}_upper`,
				type: 'line',
				label: `BB upper (${period})`,
				data: upper,
				priceScaleId: overlay.priceScaleId ?? 'right',
				overlay: overlay.overlay ?? true,
				style: {...baseStyle, lineStyle: 'dashed'},
			},
			{
				id: `${prefix}_middle`,
				type: 'line',
				label: `BB middle (${period})`,
				data: middle,
				priceScaleId: overlay.priceScaleId ?? 'right',
				overlay: overlay.overlay ?? true,
				style: {...baseStyle, lineStyle: 'solid'},
			},
			{
				id: `${prefix}_lower`,
				type: 'line',
				label: `BB lower (${period})`,
				data: lower,
				priceScaleId: overlay.priceScaleId ?? 'right',
				overlay: overlay.overlay ?? true,
				style: {...baseStyle, lineStyle: 'dashed'},
			},
		],
	};
}

function computeDonchianOverlay(
	overlay: Extract<ChartOverlayInput, {type: 'donchian'}>,
	source: SourceSeries,
): SdkResult<NormalizedChartSeries[]> {
	const period = overlay.period ?? DEFAULT_DONCHIAN_PERIOD;
	const highs = source.highs;
	const lows = source.lows;
	if (!highs?.length || !lows?.length || highs.length !== source.closes.length) {
		return {
			ok: false,
			reason: 'Donchian overlay requires a candlestick source series with high/low.',
		};
	}
	const result = calculateTechnicalIndicator({
		indicator: 'donchianchannels',
		params: {period},
		input: {high: highs, low: lows, close: source.closes},
		options: {maxPoints: highs.length},
	});
	if (!result.ok) {
		return result;
	}
	const rows = result.data.result;
	if (!Array.isArray(rows) || rows.length === 0) {
		return {ok: false, reason: 'Overlay donchian returned no data.'};
	}

	const upper: {time: ChartTime; value: number}[] = [];
	const middle: {time: ChartTime; value: number}[] = [];
	const lower: {time: ChartTime; value: number}[] = [];
	const bandFill: {time: ChartTime; upper: number; lower: number}[] = [];
	const aligned = alignObjectIndicatorRows(source.times, rows, result.data.warmupCount);

	for (const {time, row} of aligned) {
		const u = pickNumber(row, ['upper', 'Upper']);
		const m = pickNumber(row, ['middle', 'Middle']);
		const l = pickNumber(row, ['lower', 'Lower']);
		if (u != null) {
			upper.push({time, value: u});
		}
		if (m != null) {
			middle.push({time, value: m});
		}
		if (l != null) {
			lower.push({time, value: l});
		}
		if (u != null && l != null) {
			bandFill.push({time, upper: u, lower: l});
		}
	}

	if (middle.length === 0) {
		return {
			ok: false,
			reason: `Overlay donchian(${period}) has no points after warmup.`,
		};
	}

	const prefix = overlay.id ?? `dc${period}_${overlay.sourceSeriesId}`;
	const baseStyle = overlay.style ?? {lineWidth: 1};
	const showFill = overlay.fill !== false;
	const fillColor = overlay.style?.color ?? DEFAULT_DONCHIAN_FILL_COLOR;
	const seriesOut: NormalizedChartSeries[] = [];
	if (showFill && bandFill.length > 0) {
		seriesOut.push({
			id: `${prefix}_fill`,
			type: 'band',
			label: `DC fill (${period})`,
			data: bandFill,
			priceScaleId: overlay.priceScaleId ?? 'right',
			overlay: overlay.overlay ?? true,
			lastValueVisible: false,
			style: {color: fillColor, lineWidth: 1},
		});
	}
	return {
		ok: true,
		data: [
			...seriesOut,
			{
				id: `${prefix}_upper`,
				type: 'line',
				label: `DC upper (${period})`,
				data: upper,
				priceScaleId: overlay.priceScaleId ?? 'right',
				overlay: overlay.overlay ?? true,
				style: {...baseStyle, lineStyle: 'dashed'},
			},
			{
				id: `${prefix}_middle`,
				type: 'line',
				label: `DC middle (${period})`,
				data: middle,
				priceScaleId: overlay.priceScaleId ?? 'right',
				overlay: overlay.overlay ?? true,
				style: {...baseStyle, lineStyle: 'solid'},
			},
			{
				id: `${prefix}_lower`,
				type: 'line',
				label: `DC lower (${period})`,
				data: lower,
				priceScaleId: overlay.priceScaleId ?? 'right',
				overlay: overlay.overlay ?? true,
				style: {...baseStyle, lineStyle: 'dashed'},
			},
		],
	};
}

function computeSupertrendOverlay(
	overlay: Extract<ChartOverlayInput, {type: 'supertrend'}>,
	source: SourceSeries,
): SdkResult<NormalizedChartSeries[]> {
	const period = overlay.period ?? DEFAULT_SUPERTREND_PERIOD;
	const multiplier = overlay.multiplier ?? DEFAULT_SUPERTREND_MULTIPLIER;
	const highs = source.highs;
	const lows = source.lows;
	if (!highs?.length || !lows?.length || highs.length !== source.closes.length) {
		return {
			ok: false,
			reason: 'Supertrend overlay requires a candlestick source series with high/low.',
		};
	}
	const result = calculateTechnicalIndicator({
		indicator: 'supertrend',
		params: {period, multiplier},
		input: {high: highs, low: lows, close: source.closes},
		options: {maxPoints: highs.length},
	});
	if (!result.ok) {
		return result;
	}
	const rows = result.data.result;
	if (!Array.isArray(rows) || rows.length === 0) {
		return {ok: false, reason: 'Overlay supertrend returned no data.'};
	}

	const aligned = alignObjectIndicatorRows(source.times, rows, result.data.warmupCount);
	type StPoint = {time: ChartTime; value: number; direction: number};
	const points: StPoint[] = [];
	for (const {time, row} of aligned) {
		const value = pickNumber(row, ['supertrend', 'SuperTrend', 'Supertrend']);
		const direction = pickNumber(row, ['direction', 'Direction']);
		if (value == null || direction == null || !Number.isFinite(value)) {
			continue;
		}
		points.push({time, value, direction: direction >= 0 ? 1 : -1});
	}
	if (points.length === 0) {
		return {
			ok: false,
			reason: `Overlay supertrend(${period}, ${multiplier}) has no points after warmup.`,
		};
	}

	type Segment = {direction: number; data: {time: ChartTime; value: number}[]};
	const segments: Segment[] = [];
	for (const pt of points) {
		const last = segments[segments.length - 1];
		if (!last || last.direction !== pt.direction) {
			segments.push({direction: pt.direction, data: [{time: pt.time, value: pt.value}]});
		} else {
			last.data.push({time: pt.time, value: pt.value});
		}
	}
	const kept =
		segments.length > MAX_SUPERTREND_SEGMENTS
			? segments.slice(segments.length - MAX_SUPERTREND_SEGMENTS)
			: segments;

	const prefix = overlay.id ?? `st${period}x${multiplier}_${overlay.sourceSeriesId}`;
	const lineWidth = overlay.style?.lineWidth ?? 2;
	const seriesOut: NormalizedChartSeries[] = kept.map((seg, i) => ({
		id: `${prefix}_seg${i}`,
		type: 'line' as const,
		label: i === kept.length - 1 ? `Supertrend (${period}, ${multiplier})` : `ST seg ${i + 1}`,
		data: seg.data,
		priceScaleId: overlay.priceScaleId ?? 'right',
		overlay: overlay.overlay ?? true,
		lastValueVisible: i === kept.length - 1,
		style: {
			lineWidth,
			lineStyle: 'solid' as const,
			color: seg.direction >= 0 ? SUPERTREND_UP_COLOR : SUPERTREND_DOWN_COLOR,
		},
	}));
	return {ok: true, data: seriesOut};
}

function medianBarIntervalSec(times: ChartTime[]): number | null {
	const secs: number[] = [];
	for (const t of times) {
		const s = chartTimeSec(t);
		if (s != null) {
			secs.push(s);
		}
	}
	if (secs.length < 2) {
		return null;
	}
	const deltas: number[] = [];
	for (let i = 1; i < secs.length; i++) {
		const d = secs[i]! - secs[i - 1]!;
		if (d > 0) {
			deltas.push(d);
		}
	}
	if (deltas.length === 0) {
		return null;
	}
	deltas.sort((a, b) => a - b);
	return deltas[Math.floor(deltas.length / 2)]!;
}

function extendChartTime(last: ChartTime, intervalSec: number, steps: number): ChartTime {
	const sec = chartTimeSec(last);
	if (sec == null || typeof last !== 'number') {
		// Business-day charts: fall back to unix seconds from last if possible.
		if (sec == null) {
			return last;
		}
		return sec + intervalSec * steps;
	}
	return last + intervalSec * steps;
}

function computeIchimokuOverlay(
	overlay: Extract<ChartOverlayInput, {type: 'ichimoku'}>,
	source: SourceSeries,
): SdkResult<NormalizedChartSeries[]> {
	const conversionPeriod = overlay.conversionPeriod ?? DEFAULT_ICHIMOKU_CONVERSION;
	const basePeriod = overlay.basePeriod ?? DEFAULT_ICHIMOKU_BASE;
	const spanPeriod = overlay.spanPeriod ?? DEFAULT_ICHIMOKU_SPAN;
	const displacement = overlay.displacement ?? DEFAULT_ICHIMOKU_DISPLACEMENT;
	const highs = source.highs;
	const lows = source.lows;
	if (!highs?.length || !lows?.length || highs.length !== source.closes.length) {
		return {
			ok: false,
			reason: 'Ichimoku overlay requires a candlestick source series with high/low.',
		};
	}
	const result = calculateTechnicalIndicator({
		indicator: 'ichimokukinkouhyou',
		params: {conversionPeriod, basePeriod, spanPeriod, displacement},
		input: {high: highs, low: lows, close: source.closes},
		options: {maxPoints: highs.length},
	});
	if (!result.ok) {
		return result;
	}
	const rows = result.data.result;
	if (!Array.isArray(rows) || rows.length === 0) {
		return {ok: false, reason: 'Overlay ichimoku returned no data.'};
	}

	const aligned = alignObjectIndicatorRows(source.times, rows, result.data.warmupCount);
	const tenkan: {time: ChartTime; value: number}[] = [];
	const kijun: {time: ChartTime; value: number}[] = [];
	const spanPoints: {time: ChartTime; spanA: number; spanB: number}[] = [];
	const intervalSec = medianBarIntervalSec(source.times) ?? 3600;
	const alignOffset =
		rows.length < source.times.length ? source.times.length - rows.length : 0;

	for (let i = 0; i < aligned.length; i++) {
		const {time, row} = aligned[i]!;
		const conversion = pickNumber(row, ['conversion', 'Conversion', 'tenkan', 'Tenkan']);
		const base = pickNumber(row, ['base', 'Base', 'kijun', 'Kijun']);
		const spanA = pickNumber(row, ['spanA', 'SpanA', 'senkouA', 'SenkouA']);
		const spanB = pickNumber(row, ['spanB', 'SpanB', 'senkouB', 'SenkouB']);
		if (conversion != null) {
			tenkan.push({time, value: conversion});
		}
		if (base != null) {
			kijun.push({time, value: base});
		}
		if (spanA != null && spanB != null) {
			const sourceIndex = alignOffset + i;
			const targetIndex = sourceIndex + displacement;
			let cloudTime: ChartTime;
			if (targetIndex >= 0 && targetIndex < source.times.length) {
				cloudTime = source.times[targetIndex]!;
			} else if (source.times.length > 0 && targetIndex >= source.times.length) {
				const last = source.times[source.times.length - 1]!;
				const stepsBeyond = targetIndex - (source.times.length - 1);
				cloudTime = extendChartTime(last, intervalSec, stepsBeyond);
			} else {
				continue;
			}
			spanPoints.push({time: cloudTime, spanA, spanB});
		}
	}

	if (tenkan.length === 0 && kijun.length === 0) {
		return {
			ok: false,
			reason: `Overlay ichimoku(${conversionPeriod}/${basePeriod}/${spanPeriod}) has no points after warmup.`,
		};
	}

	const prefix = overlay.id ?? `ichi_${overlay.sourceSeriesId}`;
	const priceScaleId = overlay.priceScaleId ?? 'right';
	const isOverlay = overlay.overlay ?? true;
	const showFill = overlay.fill !== false;
	const showChikou = overlay.chikou !== false;
	const seriesOut: NormalizedChartSeries[] = [];

	if (showFill && spanPoints.length > 0) {
		type BandPt = {time: ChartTime; upper: number; lower: number};
		const bullBands: BandPt[] = [];
		const bearBands: BandPt[] = [];
		for (const pt of spanPoints) {
			const upper = Math.max(pt.spanA, pt.spanB);
			const lower = Math.min(pt.spanA, pt.spanB);
			const bandPt = {time: pt.time, upper, lower};
			if (pt.spanA >= pt.spanB) {
				bullBands.push(bandPt);
			} else {
				bearBands.push(bandPt);
			}
		}
		if (bullBands.length > 0) {
			seriesOut.push({
				id: `${prefix}_cloud_bull`,
				type: 'band',
				label: 'Ichimoku cloud (bull)',
				data: bullBands,
				priceScaleId,
				overlay: isOverlay,
				lastValueVisible: false,
				style: {color: ICHIMOKU_CLOUD_BULL_COLOR, lineWidth: 1},
			});
		}
		if (bearBands.length > 0) {
			seriesOut.push({
				id: `${prefix}_cloud_bear`,
				type: 'band',
				label: 'Ichimoku cloud (bear)',
				data: bearBands,
				priceScaleId,
				overlay: isOverlay,
				lastValueVisible: false,
				style: {color: ICHIMOKU_CLOUD_BEAR_COLOR, lineWidth: 1},
			});
		}
	}

	if (tenkan.length > 0) {
		seriesOut.push({
			id: `${prefix}_tenkan`,
			type: 'line',
			label: `Tenkan (${conversionPeriod})`,
			data: tenkan,
			priceScaleId,
			overlay: isOverlay,
			style: {color: ICHIMOKU_TENKAN_COLOR, lineWidth: 1, lineStyle: 'solid'},
		});
	}
	if (kijun.length > 0) {
		seriesOut.push({
			id: `${prefix}_kijun`,
			type: 'line',
			label: `Kijun (${basePeriod})`,
			data: kijun,
			priceScaleId,
			overlay: isOverlay,
			style: {color: ICHIMOKU_KIJUN_COLOR, lineWidth: 1, lineStyle: 'solid'},
		});
	}

	// Senkou outline lines (forward-displaced).
	const spanALine: {time: ChartTime; value: number}[] = [];
	const spanBLine: {time: ChartTime; value: number}[] = [];
	for (const pt of spanPoints) {
		spanALine.push({time: pt.time, value: pt.spanA});
		spanBLine.push({time: pt.time, value: pt.spanB});
	}
	if (spanALine.length > 0) {
		seriesOut.push({
			id: `${prefix}_spanA`,
			type: 'line',
			label: 'Senkou A',
			data: spanALine,
			priceScaleId,
			overlay: isOverlay,
			lastValueVisible: false,
			style: {color: '#22c55e', lineWidth: 1, lineStyle: 'dashed'},
		});
	}
	if (spanBLine.length > 0) {
		seriesOut.push({
			id: `${prefix}_spanB`,
			type: 'line',
			label: 'Senkou B',
			data: spanBLine,
			priceScaleId,
			overlay: isOverlay,
			lastValueVisible: false,
			style: {color: '#ef4444', lineWidth: 1, lineStyle: 'dashed'},
		});
	}

	if (showChikou && displacement > 0 && source.closes.length > displacement) {
		const chikou: {time: ChartTime; value: number}[] = [];
		for (let i = displacement; i < source.closes.length; i++) {
			const close = source.closes[i]!;
			const time = source.times[i - displacement];
			if (time == null || !Number.isFinite(close)) {
				continue;
			}
			chikou.push({time, value: close});
		}
		if (chikou.length > 0) {
			seriesOut.push({
				id: `${prefix}_chikou`,
				type: 'line',
				label: `Chikou (${displacement})`,
				data: chikou,
				priceScaleId,
				overlay: isOverlay,
				lastValueVisible: false,
				style: {color: ICHIMOKU_CHIKOU_COLOR, lineWidth: 1, lineStyle: 'dotted'},
			});
		}
	}

	return {ok: true, data: seriesOut};
}

function horizontalLineData(
	timeStart: ChartTime,
	timeEnd: ChartTime,
	value: number,
): {time: ChartTime; value: number}[] {
	return [
		{time: timeStart, value},
		{time: timeEnd, value},
	];
}

function chartTimeSec(time: ChartTime): number | null {
	if (typeof time === 'number') {
		return time;
	}
	if (
		typeof time === 'object' &&
		time != null &&
		typeof time.year === 'number' &&
		typeof time.month === 'number' &&
		typeof time.day === 'number'
	) {
		return Math.floor(Date.UTC(time.year, time.month - 1, time.day) / 1000);
	}
	return null;
}

function extendTrendLineData(
	pointA: {time: ChartTime; price: number},
	pointB: {time: ChartTime; price: number},
	timeStart: ChartTime,
	timeEnd: ChartTime,
): SdkResult<{time: ChartTime; value: number}[]> {
	const secA = chartTimeSec(pointA.time);
	const secB = chartTimeSec(pointB.time);
	const secStart = chartTimeSec(timeStart);
	const secEnd = chartTimeSec(timeEnd);
	if (secA == null || secB == null || secStart == null || secEnd == null) {
		return {ok: false, reason: 'Trend line points need valid chart times.'};
	}
	if (secA === secB) {
		if (Math.abs(pointA.price - pointB.price) < 1e-9) {
			return {
				ok: true,
				data: horizontalLineData(timeStart, timeEnd, pointA.price),
			};
		}
		return {ok: false, reason: 'Trend line anchor points must have different times.'};
	}
	const slope = (pointB.price - pointA.price) / (secB - secA);
	const valueStart = pointA.price + slope * (secStart - secA);
	const valueEnd = pointA.price + slope * (secEnd - secA);
	return {
		ok: true,
		data: [
			{time: timeStart, value: valueStart},
			{time: timeEnd, value: valueEnd},
		],
	};
}

function trendLineOverlayStyle(kind: 'support' | 'resistance' | undefined): ChartSeriesStyle {
	switch (kind) {
		case 'support':
			return {
				...PATTERN_OVERLAY_STYLE.neckline,
				lineStyle: 'solid',
				lineWidth: 3,
			};
		case 'resistance':
			return {...PATTERN_OVERLAY_STYLE.structure};
		default:
			return {...PATTERN_OVERLAY_STYLE.structure};
	}
}

function computeTrendLinesOverlay(
	overlay: Extract<ChartOverlayInput, {type: 'trend_lines'}>,
	timeStart: ChartTime,
	timeEnd: ChartTime,
): SdkResult<NormalizedChartSeries[]> {
	const prefix = overlay.id ?? 'trend';
	const seriesOut: NormalizedChartSeries[] = [];
	for (let i = 0; i < overlay.lines.length; i++) {
		const row = overlay.lines[i]!;
		const extended = extendTrendLineData(row.pointA, row.pointB, timeStart, timeEnd);
		if (!extended.ok) {
			return extended;
		}
		const label =
			row.label?.trim() ||
			(row.kind === 'support'
				? `Support trend ${i + 1}`
				: row.kind === 'resistance'
					? `Resistance trend ${i + 1}`
					: `Trend ${i + 1}`);
		const kindStyle = overlay.style ?? trendLineOverlayStyle(row.kind);
		seriesOut.push({
			id: `${prefix}_${i}`,
			type: 'line',
			label,
			data: extended.data,
			priceScaleId: 'right',
			overlay: true,
			style: kindStyle,
		});
	}
	if (!seriesOut.length) {
		return {ok: false, reason: 'trend_lines produced no lines.'};
	}
	return {ok: true, data: seriesOut};
}

function clipTrendLineToSpan(
	pointA: {time: ChartTime; price: number},
	pointB: {time: ChartTime; price: number},
	clipFromSec: number,
	clipToSec: number,
): SdkResult<{time: ChartTime; value: number}[]> {
	const secA = chartTimeSec(pointA.time);
	const secB = chartTimeSec(pointB.time);
	if (secA == null || secB == null) {
		return {ok: false, reason: 'Trend line points need valid chart times.'};
	}
	if (secA === secB) {
		return {
			ok: true,
			data: [
				{time: clipFromSec, value: pointA.price},
				{time: clipToSec, value: pointA.price},
			],
		};
	}
	const slope = (pointB.price - pointA.price) / (secB - secA);
	const priceAt = (t: number) => pointA.price + slope * (t - secA);
	const fromSec = Math.max(clipFromSec, Math.min(secA, secB));
	const toSec = Math.min(clipToSec, Math.max(secA, secB));
	if (fromSec >= toSec) {
		return {ok: false, reason: 'Pattern line does not intersect clip span.'};
	}
	return {
		ok: true,
		data: [
			{time: fromSec, value: priceAt(fromSec)},
			{time: toSec, value: priceAt(toSec)},
		],
	};
}

function horizontalLineDataBetween(
	fromTime: ChartTime,
	toTime: ChartTime,
	price: number,
): {time: ChartTime; value: number}[] {
	return [
		{time: fromTime, value: price},
		{time: toTime, value: price},
	];
}

function computeChartPatternOverlay(
	overlay: Extract<ChartOverlayInput, {type: 'chart_pattern'}>,
	timeStart: ChartTime,
	timeEnd: ChartTime,
): SdkResult<NormalizedChartSeries[]> {
	const prefix = overlay.id ?? 'pattern';
	const structureStyle: ChartSeriesStyle = overlay.style ?? {
		lineStyle: 'solid',
		lineWidth: 3,
		color: '#42A5F5',
	};
	const pointStyle: ChartSeriesStyle = overlay.pointStyle ?? {
		lineStyle: 'solid',
		lineWidth: 3,
		color: '#FFA726',
	};
	const clip = overlay.clipToBarSpan;
	const clipFrom = clip?.fromTimeSec ?? chartTimeSec(timeStart)!;
	const clipTo = clip?.toTimeSec ?? chartTimeSec(timeEnd)!;
	const seriesOut: NormalizedChartSeries[] = [];
	const seenLevelPrices = new Set<string>();

	for (let i = 0; i < overlay.lines.length; i++) {
		const row = overlay.lines[i]!;
		const lineData = clip
			? clipTrendLineToSpan(row.pointA, row.pointB, clipFrom, clipTo)
			: extendTrendLineData(row.pointA, row.pointB, timeStart, timeEnd);
		if (!lineData.ok) {
			continue;
		}
		const kindStyle =
			row.kind === 'neckline'
				? {...structureStyle, lineWidth: 2.5, color: '#66BB6A'}
				: row.kind === 'flagpole'
					? structureStyle
					: structureStyle;
		seriesOut.push({
			id: `${prefix}_line_${i}`,
			type: 'line',
			label: row.label?.trim() || `${overlay.patternName} line ${i + 1}`,
			data: lineData.data,
			priceScaleId: 'right',
			overlay: true,
			style: kindStyle,
		});
	}

	for (const poly of overlay.polylines ?? []) {
		if (poly.points.length < 2) {
			continue;
		}
		const data = poly.points
			.map(pt => {
				const sec = chartTimeSec(pt.time);
				if (sec == null || !Number.isFinite(pt.price)) {
					return null;
				}
				return {time: sec, value: pt.price};
			})
			.filter((p): p is {time: number; value: number} => p != null);
		if (data.length < 2) {
			continue;
		}
		seriesOut.push({
			id: `${prefix}_poly_${poly.label ?? seriesOut.length}`,
			type: 'line',
			label: poly.label?.trim() || `${overlay.patternName} curve`,
			data,
			priceScaleId: 'right',
			overlay: true,
			style: poly.style ?? structureStyle,
		});
	}

	for (const level of overlay.levels ?? []) {
		if (!Number.isFinite(level.price)) {
			continue;
		}
		const levelKey = level.role === 'measured_move' ? `target_${level.price}` : `lvl_${level.price}`;
		if (seenLevelPrices.has(levelKey)) {
			continue;
		}
		seenLevelPrices.add(levelKey);
		const isTarget =
			level.role === 'measured_move' || level.label?.toLowerCase().includes('target');
		const levelFrom = isTarget ? timeStart : clip ? clipFrom : timeStart;
		const levelTo = isTarget ? timeEnd : clip ? clipTo : timeEnd;
		seriesOut.push({
			id: `${prefix}_${levelKey}`,
			type: 'line',
			label: level.label?.trim() || level.price.toFixed(2),
			data: horizontalLineDataBetween(levelFrom, levelTo, level.price),
			priceScaleId: 'right',
			overlay: true,
			style: isTarget
				? {lineStyle: 'dashed', lineWidth: 2, color: '#FFB300'}
				: {...structureStyle, lineStyle: 'solid', lineWidth: 2.5, color: '#66BB6A'},
		});
	}

	for (let i = 0; i < (overlay.markers ?? []).length; i++) {
		const pt = overlay.markers![i]!;
		const tSec = chartTimeSec(pt.time);
		if (tSec == null || !Number.isFinite(pt.price)) {
			continue;
		}
		const tickSec = Math.max(1, Math.floor((clipTo - clipFrom) / 40));
		const tickStart = Math.max(clipFrom, tSec - tickSec);
		const tickEnd = Math.min(clipTo, tSec + tickSec);
		seriesOut.push({
			id: `${prefix}_mk_${i}`,
			type: 'line',
			label: pt.label?.trim() || pt.role || `Marker ${i + 1}`,
			data: [
				{time: tickStart, value: pt.price},
				{time: tickEnd, value: pt.price},
			],
			priceScaleId: 'right',
			overlay: true,
			style: pointStyle,
		});
	}

	for (let i = 0; i < overlay.points.length; i++) {
		const pt = overlay.points[i]!;
		const tSec = chartTimeSec(pt.time);
		if (tSec == null || !Number.isFinite(pt.price)) {
			continue;
		}
		const tickSec = Math.max(1, Math.floor((clipTo - clipFrom) / 40));
		const tickStart = Math.max(clipFrom, tSec - tickSec);
		const tickEnd = Math.min(clipTo, tSec + tickSec);
		seriesOut.push({
			id: `${prefix}_pt_${i}`,
			type: 'line',
			label: pt.label?.trim() || `Point ${i + 1}`,
			data: [
				{time: tickStart, value: pt.price},
				{time: tickEnd, value: pt.price},
			],
			priceScaleId: 'right',
			overlay: true,
			style: pointStyle,
		});
	}

	for (let i = 0; i < (overlay.barHighlights ?? []).length; i++) {
		const hi = overlay.barHighlights![i]!;
		if (hi.verdict === 'neutral') {
			continue;
		}
		const color =
			hi.verdict === 'confirming' ? '#00C85333' : '#FF6F0033';
		const bandSec = Math.max(1, Math.floor((clipTo - clipFrom) / 80));
		const t0 = hi.fromTimeSec - bandSec;
		const t1 = hi.toTimeSec + bandSec;
		seriesOut.push({
			id: `${prefix}_vol_hi_${i}`,
			type: 'area',
			label: hi.label?.trim() || `Volume ${hi.verdict}`,
			data: [
				{time: t0, value: 0},
				{time: t0, value: 1},
				{time: t1, value: 1},
				{time: t1, value: 0},
			],
			priceScaleId: 'right',
			overlay: true,
			style: {color, lineWidth: 1, lineStyle: 'solid'},
		});
	}

	const profile = overlay.volumeProfile;
	if (profile?.bins.length) {
		const maxVol = Math.max(...profile.bins.map(b => b.volume), 1);
		const spanSec = profile.barSpan.toTimeSec - profile.barSpan.fromTimeSec;
		const barWidth = Math.max(1, Math.floor(spanSec / 20));
		for (let i = 0; i < profile.bins.length; i++) {
			const bin = profile.bins[i]!;
			if (bin.volume <= 0) {
				continue;
			}
			const mid = (bin.priceLo + bin.priceHi) / 2;
			const len = (bin.volume / maxVol) * barWidth;
			const tEnd = profile.barSpan.toTimeSec;
			const tStart = tEnd - len;
			seriesOut.push({
				id: `${prefix}_vp_${i}`,
				type: 'line',
				label: `VP ${mid.toFixed(0)}`,
				data: [
					{time: tStart, value: mid},
					{time: tEnd, value: mid},
				],
				priceScaleId: 'right',
				overlay: true,
				style: {lineStyle: 'solid', lineWidth: 1, color: '#78909C55'},
			});
		}
		seriesOut.push({
			id: `${prefix}_vp_poc`,
			type: 'line',
			label: 'POC',
			data: horizontalLineDataBetween(
				profile.barSpan.fromTimeSec,
				profile.barSpan.toTimeSec,
				profile.pocPrice,
			),
			priceScaleId: 'right',
			overlay: true,
			style: {lineStyle: 'dotted', lineWidth: 1, color: '#78909C'},
		});
	}

	if (!seriesOut.length) {
		return {ok: false, reason: 'chart_pattern produced no drawable geometry.'};
	}
	return {ok: true, data: seriesOut};
}

function computeElliottWavesOverlay(
	overlay: Extract<ChartOverlayInput, {type: 'elliott_waves'}>,
	timeStart: ChartTime,
	timeEnd: ChartTime,
): SdkResult<NormalizedChartSeries[]> {
	const prefix = overlay.id ?? 'elliott_waves';
	const motiveStyle: ChartSeriesStyle = overlay.style ?? {
		lineStyle: 'solid',
		lineWidth: 2.5,
		color: '#42A5F5',
	};
	const correctiveStyle: ChartSeriesStyle = {
		lineStyle: 'solid',
		lineWidth: 2,
		color: '#AB47BC',
	};
	const clip = overlay.clipToBarSpan;
	const clipFrom = clip?.fromTimeSec ?? chartTimeSec(timeStart)!;
	const clipTo = clip?.toTimeSec ?? chartTimeSec(timeEnd)!;
	const seriesOut: NormalizedChartSeries[] = [];

	for (let i = 0; i < overlay.waves.length; i++) {
		const wave = overlay.waves[i]!;
		if (wave.isInProgress) {
			continue;
		}
		let lineData = clip
			? clipTrendLineToSpan(wave.pointA, wave.pointB, clipFrom, clipTo)
			: extendTrendLineData(wave.pointA, wave.pointB, timeStart, timeEnd);
		if (!lineData.ok) {
			lineData = extendTrendLineData(wave.pointA, wave.pointB, timeStart, timeEnd);
		}
		if (!lineData.ok) {
			continue;
		}
		seriesOut.push({
			id: `${prefix}_wave_${i}`,
			type: 'line',
			label: wave.label,
			data: lineData.data,
			priceScaleId: 'right',
			overlay: true,
			lastValueVisible: true,
			style: wave.kind === 'corrective' ? correctiveStyle : motiveStyle,
		});
	}

	for (const level of overlay.levels ?? []) {
		if (!Number.isFinite(level.price)) {
			continue;
		}
		const isTarget = level.role === 'target' || level.label?.toLowerCase().includes('target');
		const isInvalidation =
			level.role === 'invalidation' || level.label?.toLowerCase().includes('invalidation');
		seriesOut.push({
			id: `${prefix}_lvl_${level.price}`,
			type: 'line',
			label: level.label?.trim() || level.price.toFixed(2),
			data: horizontalLineDataBetween(timeStart, timeEnd, level.price),
			priceScaleId: 'right',
			overlay: true,
			lastValueVisible: isInvalidation,
			style: isTarget
				? {lineStyle: 'dashed', lineWidth: 2, color: '#FFB300'}
				: isInvalidation
					? {lineStyle: 'solid', lineWidth: 2, color: '#EF5350'}
					: {lineStyle: 'dotted', lineWidth: 1.5, color: '#66BB6A'},
		});
	}

	if (!seriesOut.length) {
		return {ok: false, reason: 'elliott_waves produced no drawable geometry.'};
	}
	return {ok: true, data: seriesOut};
}

function computeFibonacciOverlay(
	overlay: Extract<ChartOverlayInput, {type: 'fibonacci'}>,
	timeStart: ChartTime,
	timeEnd: ChartTime,
	range: {high: number; low: number; trend: 'up' | 'down'},
): SdkResult<NormalizedChartSeries[]> {
	const {high, low, trend} = range;
	if (!Number.isFinite(high) || !Number.isFinite(low) || high === low) {
		return {ok: false, reason: 'Fibonacci overlay requires distinct finite high and low.'};
	}

	const result = calculateTechnicalIndicator({
		indicator: 'fibonacci',
		input: {range: {high, low, trend}},
	});
	if (!result.ok) {
		return result;
	}

	const levelRows = result.data.result as Array<Record<string, unknown>>;
	const allowed = overlay.levels?.length
		? new Set(overlay.levels)
		: new Set<number>(ALL_FIB_LEVELS);

	const prefix =
		overlay.id ?? `fib_${overlay.sourceSeriesId ?? `${high}_${low}`}`;
	const mutedStyle: ChartSeriesStyle = overlay.style ?? {
		lineStyle: 'dashed',
		lineWidth: 2,
		color: '#E040FB',
	};
	const highlightSet = new Set(
		overlay.highlightLevels?.length ? overlay.highlightLevels : [0.618],
	);
	const defaultHighlightStyle: ChartSeriesStyle = {
		lineStyle: 'solid',
		lineWidth: 2,
		color: '#FFA726',
	};

	const seriesOut: NormalizedChartSeries[] = [];
	for (const row of levelRows) {
		const level = row.level;
		const value = row.value;
		const percentage = row.percentage;
		if (typeof level !== 'number' || typeof value !== 'number' || !Number.isFinite(value)) {
			continue;
		}
		if (!allowed.has(level)) {
			continue;
		}
		const levelKey = String(level);
		const perLevel = overlay.levelStyles?.[levelKey];
		const isHighlight = highlightSet.has(level);
		const lineStyle: ChartSeriesStyle = perLevel
			? {...mutedStyle, ...perLevel}
			: isHighlight
				? {...mutedStyle, ...defaultHighlightStyle}
				: mutedStyle;
		const pctLabel =
			typeof percentage === 'string' && percentage.trim()
				? percentage.trim()
				: `${level * 100}%`;
		seriesOut.push({
			id: `${prefix}_${levelKey.replace('.', '_')}`,
			type: 'line',
			label: `Fib ${pctLabel}`,
			data: horizontalLineData(timeStart, timeEnd, value),
			priceScaleId: overlay.priceScaleId ?? 'right',
			overlay: overlay.overlay ?? true,
			lastValueVisible: fibLevelShowsAxisLabel(level, isHighlight),
			style: lineStyle,
		});
	}

	if (seriesOut.length === 0) {
		return {ok: false, reason: 'Fibonacci overlay produced no level lines.'};
	}

	return {ok: true, data: seriesOut};
}

function computeHorizontalLevelsOverlay(
	overlay: Extract<ChartOverlayInput, {type: 'horizontal_levels'}>,
	timeStart: ChartTime,
	timeEnd: ChartTime,
): SdkResult<NormalizedChartSeries[]> {
	const prefix = overlay.id ?? 'hlvl';
	const baseStyle: ChartSeriesStyle = overlay.style ?? {
		lineStyle: 'dotted',
		lineWidth: 1,
		color: '#88888888',
	};
	const seriesOut: NormalizedChartSeries[] = [];
	for (let i = 0; i < overlay.levels.length; i++) {
		const row = overlay.levels[i]!;
		if (!Number.isFinite(row.price)) {
			continue;
		}
		const label =
			row.label?.trim() ||
			(row.kind === 'support'
				? `S ${row.price.toFixed(2)}`
				: row.kind === 'resistance'
					? `R ${row.price.toFixed(2)}`
					: `Level ${row.price.toFixed(2)}`);
		const isKeyLevel = row.label?.startsWith('Level #') ?? false;
		const isFibExtension = row.label?.startsWith('Fib 1.618 ext #') ?? false;
		const rowStyle: ChartSeriesStyle =
			isKeyLevel && row.kind === 'support'
				? {lineStyle: 'solid', lineWidth: 3, color: '#66BB6A'}
				: isKeyLevel && row.kind === 'resistance'
					? {lineStyle: 'solid', lineWidth: 3, color: '#42A5F5'}
					: isFibExtension
						? {lineStyle: 'solid', lineWidth: 3, color: '#FFA726'}
						: baseStyle;
		seriesOut.push({
			id: `${prefix}_${i}`,
			type: 'line',
			label,
			data: horizontalLineData(timeStart, timeEnd, row.price),
			priceScaleId: 'right',
			overlay: true,
			...(isKeyLevel ? {lastValueVisible: false} : {}),
			...(isFibExtension ? {lastValueVisible: true} : {}),
			style: rowStyle,
		});
	}
	if (!seriesOut.length) {
		return {ok: false, reason: 'horizontal_levels produced no lines.'};
	}
	return {ok: true, data: seriesOut};
}

function computePivotLevelsOverlay(
	overlay: Extract<ChartOverlayInput, {type: 'pivot_levels'}>,
	timeStart: ChartTime,
	timeEnd: ChartTime,
): SdkResult<NormalizedChartSeries[]> {
	const prefix = overlay.id ?? 'pivot';
	const faint: ChartSeriesStyle = overlay.style ?? {
		lineStyle: 'dotted',
		lineWidth: 1,
		color: '#88888888',
	};
	const ppStyle: ChartSeriesStyle = overlay.pivotStyle ?? {
		lineStyle: 'dashed',
		lineWidth: 1,
		color: '#aaaaaa',
	};
	const seriesOut: NormalizedChartSeries[] = [];
	for (const row of overlay.levels) {
		if (!Number.isFinite(row.price)) {
			continue;
		}
		const isPp = row.id.toUpperCase() === 'PP';
		seriesOut.push({
			id: `${prefix}_${row.id}`,
			type: 'line',
			label: row.id,
			data: horizontalLineData(timeStart, timeEnd, row.price),
			priceScaleId: 'right',
			overlay: true,
			style: isPp ? ppStyle : faint,
		});
	}
	if (!seriesOut.length) {
		return {ok: false, reason: 'pivot_levels produced no lines.'};
	}
	return {ok: true, data: seriesOut};
}

function oscillatorPaneId(overlay: ChartOverlayInput, index: number): string {
	const base = overlay.id ?? `${overlay.type}_${index}`;
	return `osc_${base.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

/** Resolve pane ids for rsi / stochasticrsi overlays in the same order expandChartOverlays uses. */
export function resolveOscillatorPaneIds(
	overlays: ChartOverlayInput[] | undefined,
): Partial<Record<'rsi' | 'stochasticrsi' | 'macd' | 'zscore', string>> {
	const out: Partial<Record<'rsi' | 'stochasticrsi' | 'macd' | 'zscore', string>> = {};
	if (!overlays?.length) {
		return out;
	}
	let oscillatorIndex = 0;
	for (const overlay of overlays) {
		if (
			overlay.type === 'rsi' ||
			overlay.type === 'zscore' ||
			overlay.type === 'macd' ||
			overlay.type === 'stochasticrsi'
		) {
			const paneId = oscillatorPaneId(overlay, oscillatorIndex++);
			if (out[overlay.type] == null) {
				out[overlay.type] = paneId;
			}
		}
	}
	return out;
}

function divergenceSegmentStyle(
	kind: 'regular_bullish' | 'regular_bearish' | 'hidden_bullish' | 'hidden_bearish',
	base?: ChartSeriesStyle,
): ChartSeriesStyle {
	const bullish = kind === 'regular_bullish' || kind === 'hidden_bullish';
	const hidden = kind === 'hidden_bullish' || kind === 'hidden_bearish';
	return {
		color: bullish ? '#3b82f6' : '#ef4444',
		lineWidth: 2,
		lineStyle: hidden ? 'dashed' : 'solid',
		...base,
	};
}

function chartTimeToUnix(time: ChartTime): number | null {
	if (typeof time === 'number' && Number.isFinite(time)) {
		return time;
	}
	if (time && typeof time === 'object' && 'year' in time) {
		return Math.floor(Date.UTC(time.year, time.month - 1, time.day) / 1000);
	}
	return null;
}

function computeDivergenceOverlay(
	overlay: Extract<ChartOverlayInput, {type: 'divergence'}>,
	paneByOsc: Partial<Record<'rsi' | 'stochasticrsi', string>>,
): SdkResult<NormalizedChartSeries[]> {
	const prefix = overlay.id ?? 'divergence';
	const seriesOut: NormalizedChartSeries[] = [];
	for (let i = 0; i < overlay.segments.length; i++) {
		const seg = overlay.segments[i]!;
		const paneId = seg.oscillatorPaneId ?? paneByOsc[seg.oscillator];
		if (!paneId) {
			return {
				ok: false,
				reason: `Divergence segment needs ${seg.oscillator} pane — ensure that oscillator overlay is present.`,
			};
		}
		const style = divergenceSegmentStyle(seg.kind, overlay.style);
		const pA = chartTimeToUnix(seg.price.pointA.time as ChartTime);
		const pB = chartTimeToUnix(seg.price.pointB.time as ChartTime);
		const oA = chartTimeToUnix(seg.oscillatorLine.pointA.time as ChartTime);
		const oB = chartTimeToUnix(seg.oscillatorLine.pointB.time as ChartTime);
		if (pA == null || pB == null || oA == null || oB == null) {
			return {ok: false, reason: 'Divergence segment has invalid times.'};
		}
		const label = seg.label?.trim() || seg.kind.replace(/_/g, ' ');
		seriesOut.push({
			id: `${prefix}_price_${i}`,
			type: 'line',
			label: `${label} (price)`,
			data: [
				{time: pA, value: seg.price.pointA.price},
				{time: pB, value: seg.price.pointB.price},
			],
			priceScaleId: 'right',
			overlay: true,
			style,
		});
		seriesOut.push({
			id: `${prefix}_osc_${i}`,
			type: 'line',
			label: `${label} (${seg.oscillator})`,
			data: [
				{time: oA, value: seg.oscillatorLine.pointA.value},
				{time: oB, value: seg.oscillatorLine.pointB.value},
			],
			priceScaleId: 'right',
			overlay: true,
			paneId,
			style,
		});
	}
	if (!seriesOut.length) {
		return {ok: false, reason: 'divergence produced no drawable geometry.'};
	}
	return {ok: true, data: seriesOut};
}

function tagSeriesPane(
	series: NormalizedChartSeries[],
	paneId: string,
): NormalizedChartSeries[] {
	return series.map(s => ({...s, paneId}));
}

function pickNumber(row: Record<string, unknown>, keys: string[]): number | null {
	for (const key of keys) {
		const direct = row[key];
		if (typeof direct === 'number' && Number.isFinite(direct)) {
			return direct;
		}
		const lowerKey = key.toLowerCase();
		for (const [k, v] of Object.entries(row)) {
			if (k.toLowerCase() === lowerKey && typeof v === 'number' && Number.isFinite(v)) {
				return v;
			}
		}
	}
	return null;
}

function computeRsiOverlay(
	overlay: Extract<ChartOverlayInput, {type: 'rsi'}>,
	source: SourceSeries,
	paneId: string,
): SdkResult<NormalizedChartSeries[]> {
	const period = overlay.period ?? DEFAULT_RSI_PERIOD;
	const result = calculateTechnicalIndicator({
		indicator: 'rsi',
		params: {period},
		input: {values: source.closes},
		options: {maxPoints: source.closes.length},
	});
	if (!result.ok) {
		return result;
	}
	const data = alignNumericIndicator(source.times, result.data.result, result.data.warmupCount);
	if (data.length === 0) {
		return {ok: false, reason: `Overlay rsi(${period}) has no points after warmup.`};
	}
	const id = overlay.id ?? `rsi${period}_${overlay.sourceSeriesId}`;
	return {
		ok: true,
		data: tagSeriesPane(
			[
				{
					id,
					type: 'line',
					label: overlay.label ?? `RSI(${period})`,
					data,
					priceScaleId: 'right',
					overlay: true,
					style: overlay.style ?? {lineStyle: 'solid', lineWidth: 2},
				},
			],
			paneId,
		),
	};
}

function computeZScoreOverlay(
	overlay: Extract<ChartOverlayInput, {type: 'zscore'}>,
	source: SourceSeries,
	paneId: string,
): SdkResult<NormalizedChartSeries[]> {
	const period = overlay.period ?? DEFAULT_ZSCORE_PERIOD;
	const entryZ = overlay.entryZ ?? DEFAULT_ZSCORE_ENTRY;
	const exitZ = overlay.exitZ ?? DEFAULT_ZSCORE_EXIT;
	const smaResult = calculateTechnicalIndicator({
		indicator: 'sma',
		params: {period},
		input: {values: source.closes},
		options: {maxPoints: source.closes.length},
	});
	if (!smaResult.ok) {
		return smaResult;
	}
	const sdResult = calculateTechnicalIndicator({
		indicator: 'sd',
		params: {period},
		input: {values: source.closes},
		options: {maxPoints: source.closes.length},
	});
	if (!sdResult.ok) {
		return sdResult;
	}
	const smaAligned = alignNumericIndicator(
		source.times,
		smaResult.data.result,
		smaResult.data.warmupCount,
	);
	const sdAligned = alignNumericIndicator(
		source.times,
		sdResult.data.result,
		sdResult.data.warmupCount,
	);
	const sdByTime = new Map(sdAligned.map(p => [String(p.time), p.value]));
	const zLine: {time: ChartTime; value: number}[] = [];
	for (let i = 0; i < source.closes.length; i++) {
		const time = source.times[i]!;
		const close = source.closes[i]!;
		const smaPoint = smaAligned.find(p => p.time === time);
		const sd = sdByTime.get(String(time));
		if (smaPoint == null || sd == null || !Number.isFinite(sd) || sd <= 0) {
			continue;
		}
		zLine.push({time, value: (close - smaPoint.value) / sd});
	}
	if (zLine.length === 0) {
		return {ok: false, reason: `Overlay zscore(${period}) has no points after warmup.`};
	}
	const prefix = overlay.id ?? `zscore${period}_${overlay.sourceSeriesId}`;
	const guide = (level: number, idSuffix: string, label: string, dashed = true) => ({
		id: `${prefix}_${idSuffix}`,
		type: 'line' as const,
		label,
		data: zLine.map(p => ({time: p.time, value: level})),
		priceScaleId: 'right' as const,
		overlay: true,
		lastValueVisible: false,
		style: {
			lineStyle: dashed ? ('dashed' as const) : ('dotted' as const),
			lineWidth: 1,
			color: '#94a3b8',
		},
	});
	const seriesOut: NormalizedChartSeries[] = [
		{
			id: `${prefix}_z`,
			type: 'line',
			label: overlay.label ?? `Z(${period})`,
			data: zLine,
			priceScaleId: 'right',
			overlay: true,
			style: overlay.style ?? {lineStyle: 'solid', lineWidth: 2, color: '#7c3aed'},
		},
		guide(0, 'zero', 'Z=0', false),
		guide(entryZ, 'entry_pos', `+${entryZ}`),
		guide(-entryZ, 'entry_neg', `−${entryZ}`),
	];
	if (exitZ > 0) {
		seriesOut.push(guide(exitZ, 'exit_pos', `+${exitZ}`));
		seriesOut.push(guide(-exitZ, 'exit_neg', `−${exitZ}`));
	}
	return {ok: true, data: tagSeriesPane(seriesOut, paneId)};
}

function computeMacdOverlay(
	overlay: Extract<ChartOverlayInput, {type: 'macd'}>,
	source: SourceSeries,
	paneId: string,
): SdkResult<NormalizedChartSeries[]> {
	const params = {
		...(overlay.fastPeriod != null ? {fastPeriod: overlay.fastPeriod} : {}),
		...(overlay.slowPeriod != null ? {slowPeriod: overlay.slowPeriod} : {}),
		...(overlay.signalPeriod != null ? {signalPeriod: overlay.signalPeriod} : {}),
	};
	const result = calculateTechnicalIndicator({
		indicator: 'macd',
		params,
		input: {values: source.closes},
		options: {maxPoints: source.closes.length},
	});
	if (!result.ok) {
		return result;
	}
	const rows = result.data.result;
	if (!Array.isArray(rows) || rows.length === 0) {
		return {ok: false, reason: 'Overlay macd returned no data.'};
	}

	const macdLine: {time: ChartTime; value: number}[] = [];
	const signalLine: {time: ChartTime; value: number}[] = [];
	const histogram: {time: ChartTime; value: number; color?: string}[] = [];
	const aligned = alignObjectIndicatorRows(source.times, rows, result.data.warmupCount);

	for (const {time, row} of aligned) {
		const macd = pickNumber(row, ['MACD', 'macd']);
		const signal = pickNumber(row, ['signal', 'Signal']);
		const hist = pickNumber(row, ['histogram', 'Histogram']);
		if (macd != null) {
			macdLine.push({time, value: macd});
		}
		if (signal != null) {
			signalLine.push({time, value: signal});
		}
		if (hist != null) {
			histogram.push({
				time,
				value: hist,
				color: hist >= 0 ? MACD_HIST_UP : MACD_HIST_DOWN,
			});
		}
	}

	if (macdLine.length === 0 && histogram.length === 0) {
		return {ok: false, reason: 'Overlay macd has no points after warmup (need more price history).'};
	}

	const prefix = overlay.id ?? `macd_${overlay.sourceSeriesId}`;
	const baseStyle = overlay.style ?? {lineWidth: 1};
	return {
		ok: true,
		data: tagSeriesPane(
			[
				{
					id: `${prefix}_line`,
					type: 'line',
					label: 'MACD',
					data: macdLine,
					priceScaleId: 'right',
					overlay: true,
					style: {...baseStyle, lineStyle: 'solid', color: '#2962FF'},
				},
				{
					id: `${prefix}_signal`,
					type: 'line',
					label: 'Signal',
					data: signalLine,
					priceScaleId: 'right',
					overlay: true,
					style: {...baseStyle, lineStyle: 'dashed', color: '#FF6D00'},
				},
				{
					id: `${prefix}_hist`,
					type: 'histogram',
					label: 'MACD hist',
					data: histogram,
					priceScaleId: 'right',
					overlay: true,
				},
			],
			paneId,
		),
	};
}

function computeStochasticRsiOverlay(
	overlay: Extract<ChartOverlayInput, {type: 'stochasticrsi'}>,
	source: SourceSeries,
	paneId: string,
): SdkResult<NormalizedChartSeries[]> {
	const params = {
		...(overlay.rsiPeriod != null ? {rsiPeriod: overlay.rsiPeriod} : {}),
		...(overlay.stochasticPeriod != null
			? {stochasticPeriod: overlay.stochasticPeriod}
			: {}),
		...(overlay.kPeriod != null ? {kPeriod: overlay.kPeriod} : {}),
		...(overlay.dPeriod != null ? {dPeriod: overlay.dPeriod} : {}),
	};
	const result = calculateTechnicalIndicator({
		indicator: 'stochasticrsi',
		params,
		input: {values: source.closes},
		options: {maxPoints: source.closes.length},
	});
	if (!result.ok) {
		return result;
	}
	const rows = result.data.result;
	if (!Array.isArray(rows) || rows.length === 0) {
		return {ok: false, reason: 'Overlay stochasticrsi returned no data.'};
	}

	const kLine: {time: ChartTime; value: number}[] = [];
	const dLine: {time: ChartTime; value: number}[] = [];
	const aligned = alignObjectIndicatorRows(source.times, rows, result.data.warmupCount);

	for (const {time, row} of aligned) {
		const k = pickNumber(row, ['k', 'K']);
		const d = pickNumber(row, ['d', 'D']);
		if (k != null) {
			kLine.push({time, value: k});
		}
		if (d != null) {
			dLine.push({time, value: d});
		}
	}

	if (kLine.length === 0) {
		return {
			ok: false,
			reason: 'Overlay stochasticrsi has no points after warmup (need more price history).',
		};
	}

	const prefix = overlay.id ?? `stochrsi_${overlay.sourceSeriesId}`;
	const baseStyle = overlay.style ?? {lineWidth: 1};
	return {
		ok: true,
		data: tagSeriesPane(
			[
				{
					id: `${prefix}_k`,
					type: 'line',
					label: 'Stoch RSI %K',
					data: kLine,
					priceScaleId: 'right',
					overlay: true,
					style: {...baseStyle, lineStyle: 'solid', color: '#2962FF'},
				},
				{
					id: `${prefix}_d`,
					type: 'line',
					label: 'Stoch RSI %D',
					data: dLine,
					priceScaleId: 'right',
					overlay: true,
					style: {...baseStyle, lineStyle: 'dashed', color: '#FF6D00'},
				},
			],
			paneId,
		),
	};
}

function assertUniqueSeriesIds(seriesList: NormalizedChartSeries[]): SdkResult<void> {
	const seen = new Set<string>();
	for (const series of seriesList) {
		if (seen.has(series.id)) {
			return {ok: false, reason: `Duplicate chart series id "${series.id}".`};
		}
		seen.add(series.id);
	}
	return {ok: true, data: undefined};
}

export function expandChartOverlays(
	baseSeries: NormalizedChartSeries[],
	overlays: ChartOverlayInput[] | undefined,
): SdkResult<NormalizedChartSeries[]> {
	if (!overlays?.length) {
		return {ok: true, data: baseSeries};
	}

	const expanded = [...baseSeries];
	let oscillatorIndex = 0;
	const paneByOsc = resolveOscillatorPaneIds(overlays);

	for (const overlay of overlays) {
		if (overlay.type === 'trade_position') {
			continue;
		}
		let overlaySeries: SdkResult<NormalizedChartSeries[]>;

		if (
			overlay.type === 'horizontal_levels' ||
			overlay.type === 'pivot_levels' ||
			overlay.type === 'trend_lines' ||
			overlay.type === 'chart_pattern' ||
			overlay.type === 'elliott_waves' ||
			overlay.type === 'divergence'
		) {
			const span = primaryTimeSpan(baseSeries);
			if (!span.ok) {
				return span;
			}
			if (overlay.type === 'horizontal_levels') {
				overlaySeries = computeHorizontalLevelsOverlay(
					overlay,
					span.data.timeStart,
					span.data.timeEnd,
				);
			} else if (overlay.type === 'pivot_levels') {
				overlaySeries = computePivotLevelsOverlay(
					overlay,
					span.data.timeStart,
					span.data.timeEnd,
				);
			} else if (overlay.type === 'chart_pattern') {
				overlaySeries = computeChartPatternOverlay(
					overlay,
					span.data.timeStart,
					span.data.timeEnd,
				);
			} else if (overlay.type === 'elliott_waves') {
				overlaySeries = computeElliottWavesOverlay(
					overlay,
					span.data.timeStart,
					span.data.timeEnd,
				);
			} else if (overlay.type === 'divergence') {
				overlaySeries = computeDivergenceOverlay(overlay, paneByOsc);
			} else {
				overlaySeries = computeTrendLinesOverlay(
					overlay,
					span.data.timeStart,
					span.data.timeEnd,
				);
			}
		} else if (overlay.type === 'fibonacci') {
			const span = primaryTimeSpan(baseSeries);
			if (!span.ok) {
				return span;
			}
			let range: {high: number; low: number; trend: 'up' | 'down'};
			if (overlay.range) {
				range = overlay.range;
			} else {
				const sourceResult = findSourceSeries(baseSeries, overlay.sourceSeriesId!);
				if (!sourceResult.ok) {
					return sourceResult;
				}
				range = {
					high: sourceResult.data.high,
					low: sourceResult.data.low,
					trend: overlay.trend ?? 'up',
				};
			}
			overlaySeries = computeFibonacciOverlay(
				overlay,
				span.data.timeStart,
				span.data.timeEnd,
				range,
			);
		} else if (
			overlay.type === 'rsi' ||
			overlay.type === 'zscore' ||
			overlay.type === 'macd' ||
			overlay.type === 'stochasticrsi'
		) {
			const sourceResult = findSourceSeries(baseSeries, overlay.sourceSeriesId);
			if (!sourceResult.ok) {
				return sourceResult;
			}
			const paneId = oscillatorPaneId(overlay, oscillatorIndex++);
			if (overlay.type === 'rsi') {
				overlaySeries = computeRsiOverlay(overlay, sourceResult.data, paneId);
			} else if (overlay.type === 'zscore') {
				overlaySeries = computeZScoreOverlay(overlay, sourceResult.data, paneId);
			} else if (overlay.type === 'macd') {
				overlaySeries = computeMacdOverlay(overlay, sourceResult.data, paneId);
			} else if (overlay.type === 'stochasticrsi') {
				overlaySeries = computeStochasticRsiOverlay(
					overlay,
					sourceResult.data,
					paneId,
				);
			} else {
				return {ok: false, reason: `Unsupported oscillator overlay type.`};
			}
		} else {
			const sourceResult = findSourceSeries(baseSeries, overlay.sourceSeriesId);
			if (!sourceResult.ok) {
				return sourceResult;
			}
			if (overlay.type === 'sma' || overlay.type === 'ema') {
				overlaySeries = computeMaOverlay(overlay, sourceResult.data);
			} else if (overlay.type === 'bollinger') {
				overlaySeries = computeBollingerOverlay(overlay, sourceResult.data);
			} else if (overlay.type === 'donchian') {
				overlaySeries = computeDonchianOverlay(overlay, sourceResult.data);
			} else if (overlay.type === 'supertrend') {
				overlaySeries = computeSupertrendOverlay(overlay, sourceResult.data);
			} else if (overlay.type === 'ichimoku') {
				overlaySeries = computeIchimokuOverlay(overlay, sourceResult.data);
			} else {
				return {ok: false, reason: `Unsupported overlay type.`};
			}
		}

		if (!overlaySeries.ok) {
			return overlaySeries;
		}
		expanded.push(...overlaySeries.data);
	}

	if (expanded.length > 40) {
		return {
			ok: false,
			reason: `Chart would have ${expanded.length} series after overlays (max 40).`,
		};
	}

	const unique = assertUniqueSeriesIds(expanded);
	if (!unique.ok) {
		return unique;
	}

	return {ok: true, data: expanded};
}
