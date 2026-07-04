import type {OhlcBar, OhlcSeries} from './types.js';

export enum RangeType {
	RealBody = 'RealBody',
	HighLow = 'HighLow',
	Shadows = 'Shadows',
}

export enum CandleSettingType {
	BodyLong = 'BodyLong',
	BodyVeryLong = 'BodyVeryLong',
	BodyShort = 'BodyShort',
	BodyDoji = 'BodyDoji',
	ShadowLong = 'ShadowLong',
	ShadowVeryLong = 'ShadowVeryLong',
	ShadowShort = 'ShadowShort',
	ShadowVeryShort = 'ShadowVeryShort',
	Near = 'Near',
	Far = 'Far',
	Equal = 'Equal',
}

export type CandleSetting = {
	rangeType: RangeType;
	avgPeriod: number;
	factor: number;
};

/** TA-Lib default candle settings from TA_RestoreCandleDefaultSettings. */
export const DEFAULT_CANDLE_SETTINGS: Record<CandleSettingType, CandleSetting> = {
	[CandleSettingType.BodyLong]: {rangeType: RangeType.RealBody, avgPeriod: 10, factor: 1.0},
	[CandleSettingType.BodyVeryLong]: {rangeType: RangeType.RealBody, avgPeriod: 10, factor: 3.0},
	[CandleSettingType.BodyShort]: {rangeType: RangeType.RealBody, avgPeriod: 10, factor: 1.0},
	[CandleSettingType.BodyDoji]: {rangeType: RangeType.HighLow, avgPeriod: 10, factor: 0.1},
	[CandleSettingType.ShadowLong]: {rangeType: RangeType.RealBody, avgPeriod: 0, factor: 1.0},
	[CandleSettingType.ShadowVeryLong]: {rangeType: RangeType.RealBody, avgPeriod: 0, factor: 2.0},
	[CandleSettingType.ShadowShort]: {rangeType: RangeType.Shadows, avgPeriod: 10, factor: 1.0},
	[CandleSettingType.ShadowVeryShort]: {rangeType: RangeType.HighLow, avgPeriod: 10, factor: 0.1},
	[CandleSettingType.Near]: {rangeType: RangeType.HighLow, avgPeriod: 5, factor: 0.2},
	[CandleSettingType.Far]: {rangeType: RangeType.HighLow, avgPeriod: 5, factor: 0.6},
	[CandleSettingType.Equal]: {rangeType: RangeType.HighLow, avgPeriod: 5, factor: 0.05},
};

export function realBody(bars: OhlcSeries, idx: number): number {
	return Math.abs(bars.close[idx]! - bars.open[idx]!);
}

export function upperShadow(bars: OhlcSeries, idx: number): number {
	const bodyTop = bars.close[idx]! >= bars.open[idx]! ? bars.close[idx]! : bars.open[idx]!;
	return bars.high[idx]! - bodyTop;
}

export function lowerShadow(bars: OhlcSeries, idx: number): number {
	const bodyBottom = bars.close[idx]! >= bars.open[idx]! ? bars.open[idx]! : bars.close[idx]!;
	return bodyBottom - bars.low[idx]!;
}

export function highLowRange(bars: OhlcSeries, idx: number): number {
	return bars.high[idx]! - bars.low[idx]!;
}

export function candleColor(bars: OhlcSeries, idx: number): 1 | -1 {
	return bars.close[idx]! >= bars.open[idx]! ? 1 : -1;
}

export function candleRange(setting: CandleSettingType, bars: OhlcSeries, idx: number): number {
	const cfg = DEFAULT_CANDLE_SETTINGS[setting];
	switch (cfg.rangeType) {
		case RangeType.RealBody:
			return realBody(bars, idx);
		case RangeType.HighLow:
			return highLowRange(bars, idx);
		case RangeType.Shadows:
			return upperShadow(bars, idx) + lowerShadow(bars, idx);
		default:
			return 0;
	}
}

export function candleAverage(
	setting: CandleSettingType,
	periodTotal: number,
	bars: OhlcSeries,
	idx: number,
): number {
	const cfg = DEFAULT_CANDLE_SETTINGS[setting];
	const base =
		cfg.avgPeriod !== 0 ? periodTotal / cfg.avgPeriod : candleRange(setting, bars, idx);
	const divisor = cfg.rangeType === RangeType.Shadows ? 2.0 : 1.0;
	return (cfg.factor * base) / divisor;
}

/** Rolling sum for TA-Lib CDL period totals (excludes current bar from average). */
export class PeriodTotal {
	private total = 0;
	private trailingIdx = 0;

	constructor(
		private readonly setting: CandleSettingType,
		private readonly bars: OhlcSeries,
		private readonly avgPeriod: number,
	) {}

	init(startIdx: number): void {
		this.trailingIdx = startIdx - this.avgPeriod;
		this.total = 0;
		if (this.avgPeriod <= 0) {
			return;
		}
		for (let i = this.trailingIdx; i < startIdx; i++) {
			this.total += candleRange(this.setting, this.bars, i);
		}
	}

	average(idx: number): number {
		return candleAverage(this.setting, this.total, this.bars, idx);
	}

	advance(idx: number): void {
		if (this.avgPeriod <= 0) {
			return;
		}
		this.total +=
			candleRange(this.setting, this.bars, idx) -
			candleRange(this.setting, this.bars, this.trailingIdx);
		this.trailingIdx += 1;
	}

	/** For Near/Far evaluated at idx-1 while advancing at idx. */
	advanceAtOffset(idx: number, rangeIdx: number): void {
		if (this.avgPeriod <= 0) {
			return;
		}
		this.total +=
			candleRange(this.setting, this.bars, rangeIdx) -
			candleRange(this.setting, this.bars, this.trailingIdx);
		this.trailingIdx += 1;
	}
}

export function barsToSeries(bars: OhlcBar[]): OhlcSeries {
	return {
		open: bars.map(b => b.open),
		high: bars.map(b => b.high),
		low: bars.map(b => b.low),
		close: bars.map(b => b.close),
	};
}

export function emptySignals(length: number): Int32Array {
	return new Int32Array(length);
}
