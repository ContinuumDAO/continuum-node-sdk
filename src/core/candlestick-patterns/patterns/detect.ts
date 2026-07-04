import {
	CandleSettingType,
	DEFAULT_CANDLE_SETTINGS,
	PeriodTotal,
	candleColor,
	emptySignals,
	realBody,
	upperShadow,
	lowerShadow,
} from '../candle-settings.js';
import type {OhlcSeries} from '../types.js';

const PENETRATION = 0.3;

function lookbackBodyShort(): number {
	return DEFAULT_CANDLE_SETTINGS[CandleSettingType.BodyShort].avgPeriod;
}

function lookbackBodyDoji(): number {
	return DEFAULT_CANDLE_SETTINGS[CandleSettingType.BodyDoji].avgPeriod;
}

function lookbackBodyLong(): number {
	return DEFAULT_CANDLE_SETTINGS[CandleSettingType.BodyLong].avgPeriod;
}

function lookbackNear(): number {
	return DEFAULT_CANDLE_SETTINGS[CandleSettingType.Near].avgPeriod;
}

function lookbackThreeBar(): number {
	return Math.max(lookbackBodyShort(), lookbackBodyLong()) + 2;
}

function lookbackThreeBlackCrows(): number {
	return Math.max(lookbackBodyShort(), DEFAULT_CANDLE_SETTINGS[CandleSettingType.ShadowVeryShort].avgPeriod) + 3;
}

export function detectDoji(bars: OhlcSeries): Int32Array {
	const n = bars.close.length;
	const out = emptySignals(n);
	const lookback = lookbackBodyDoji();
	const period = new PeriodTotal(CandleSettingType.BodyDoji, bars, lookback);
	const startIdx = lookback;
	period.init(startIdx);
	for (let i = startIdx; i < n; i++) {
		if (realBody(bars, i) <= period.average(i)) {
			out[i] = 100;
		}
		period.advance(i);
	}
	return out;
}

export function detectSpinningTop(bars: OhlcSeries): Int32Array {
	const n = bars.close.length;
	const out = emptySignals(n);
	const lookback = lookbackBodyShort();
	const period = new PeriodTotal(CandleSettingType.BodyShort, bars, lookback);
	const startIdx = lookback;
	period.init(startIdx);
	for (let i = startIdx; i < n; i++) {
		const body = realBody(bars, i);
		if (
			upperShadow(bars, i) > body &&
			lowerShadow(bars, i) > body &&
			body < period.average(i)
		) {
			out[i] = candleColor(bars, i) * 100;
		}
		period.advance(i);
	}
	return out;
}

export function detectHammer(bars: OhlcSeries): Int32Array {
	const n = bars.close.length;
	const out = emptySignals(n);
	const lookback = Math.max(
		lookbackBodyShort(),
		lookbackNear(),
		DEFAULT_CANDLE_SETTINGS[CandleSettingType.ShadowVeryShort].avgPeriod,
	) + 1;
	const bodyShort = new PeriodTotal(CandleSettingType.BodyShort, bars, lookbackBodyShort());
	const shadowLong = new PeriodTotal(CandleSettingType.ShadowLong, bars, 0);
	const shadowVeryShort = new PeriodTotal(
		CandleSettingType.ShadowVeryShort,
		bars,
		DEFAULT_CANDLE_SETTINGS[CandleSettingType.ShadowVeryShort].avgPeriod,
	);
	const near = new PeriodTotal(CandleSettingType.Near, bars, lookbackNear());
	const startIdx = lookback;
	bodyShort.init(startIdx);
	shadowLong.init(startIdx);
	shadowVeryShort.init(startIdx);
	near.init(startIdx - 1);
	for (let i = startIdx; i < n; i++) {
		const bodyBottom = Math.min(bars.close[i]!, bars.open[i]!);
		if (
			realBody(bars, i) < bodyShort.average(i) &&
			lowerShadow(bars, i) > shadowLong.average(i) &&
			upperShadow(bars, i) < shadowVeryShort.average(i) &&
			bodyBottom <= bars.low[i - 1]! + near.average(i - 1)
		) {
			out[i] = 100;
		}
		bodyShort.advance(i);
		shadowLong.advance(i);
		shadowVeryShort.advance(i);
		near.advanceAtOffset(i, i - 1);
	}
	return out;
}

export function detectHangingMan(bars: OhlcSeries): Int32Array {
	const n = bars.close.length;
	const out = emptySignals(n);
	const lookback =
		Math.max(
			lookbackBodyShort(),
			lookbackNear(),
			DEFAULT_CANDLE_SETTINGS[CandleSettingType.ShadowVeryShort].avgPeriod,
		) + 1;
	const bodyShort = new PeriodTotal(CandleSettingType.BodyShort, bars, lookbackBodyShort());
	const shadowLong = new PeriodTotal(CandleSettingType.ShadowLong, bars, 0);
	const shadowVeryShort = new PeriodTotal(
		CandleSettingType.ShadowVeryShort,
		bars,
		DEFAULT_CANDLE_SETTINGS[CandleSettingType.ShadowVeryShort].avgPeriod,
	);
	const near = new PeriodTotal(CandleSettingType.Near, bars, lookbackNear());
	const startIdx = lookback;
	bodyShort.init(startIdx);
	shadowLong.init(startIdx);
	shadowVeryShort.init(startIdx);
	near.init(startIdx - 1);
	for (let i = startIdx; i < n; i++) {
		const bodyBottom = Math.min(bars.close[i]!, bars.open[i]!);
		if (
			realBody(bars, i) < bodyShort.average(i) &&
			lowerShadow(bars, i) > shadowLong.average(i) &&
			upperShadow(bars, i) < shadowVeryShort.average(i) &&
			bodyBottom >= bars.high[i - 1]! - near.average(i - 1)
		) {
			out[i] = -100;
		}
		bodyShort.advance(i);
		shadowLong.advance(i);
		shadowVeryShort.advance(i);
		near.advanceAtOffset(i, i - 1);
	}
	return out;
}

export function detectShootingStar(bars: OhlcSeries): Int32Array {
	const n = bars.close.length;
	const out = emptySignals(n);
	const lookback =
		Math.max(
			lookbackBodyShort(),
			DEFAULT_CANDLE_SETTINGS[CandleSettingType.ShadowVeryShort].avgPeriod,
		) + 1;
	const bodyShort = new PeriodTotal(CandleSettingType.BodyShort, bars, lookbackBodyShort());
	const shadowLong = new PeriodTotal(CandleSettingType.ShadowLong, bars, 0);
	const shadowVeryShort = new PeriodTotal(
		CandleSettingType.ShadowVeryShort,
		bars,
		DEFAULT_CANDLE_SETTINGS[CandleSettingType.ShadowVeryShort].avgPeriod,
	);
	const startIdx = lookback;
	bodyShort.init(startIdx);
	shadowLong.init(startIdx);
	shadowVeryShort.init(startIdx);
	for (let i = startIdx; i < n; i++) {
		const gapUp =
			Math.min(bars.open[i]!, bars.close[i]!) >
			Math.max(bars.open[i - 1]!, bars.close[i - 1]!);
		if (
			gapUp &&
			realBody(bars, i) < bodyShort.average(i) &&
			upperShadow(bars, i) > shadowLong.average(i) &&
			lowerShadow(bars, i) < shadowVeryShort.average(i)
		) {
			out[i] = -100;
		}
		bodyShort.advance(i);
		shadowLong.advance(i);
		shadowVeryShort.advance(i);
	}
	return out;
}

export function detectInvertedHammer(bars: OhlcSeries): Int32Array {
	const n = bars.close.length;
	const out = emptySignals(n);
	const lookback =
		Math.max(
			lookbackBodyShort(),
			DEFAULT_CANDLE_SETTINGS[CandleSettingType.ShadowVeryShort].avgPeriod,
		) + 1;
	const bodyShort = new PeriodTotal(CandleSettingType.BodyShort, bars, lookbackBodyShort());
	const shadowLong = new PeriodTotal(CandleSettingType.ShadowLong, bars, 0);
	const shadowVeryShort = new PeriodTotal(
		CandleSettingType.ShadowVeryShort,
		bars,
		DEFAULT_CANDLE_SETTINGS[CandleSettingType.ShadowVeryShort].avgPeriod,
	);
	const startIdx = lookback;
	bodyShort.init(startIdx);
	shadowLong.init(startIdx);
	shadowVeryShort.init(startIdx);
	for (let i = startIdx; i < n; i++) {
		const gapDown =
			Math.max(bars.open[i]!, bars.close[i]!) <
			Math.min(bars.open[i - 1]!, bars.close[i - 1]!);
		if (
			gapDown &&
			realBody(bars, i) < bodyShort.average(i) &&
			upperShadow(bars, i) > shadowLong.average(i) &&
			lowerShadow(bars, i) < shadowVeryShort.average(i)
		) {
			out[i] = 100;
		}
		bodyShort.advance(i);
		shadowLong.advance(i);
		shadowVeryShort.advance(i);
	}
	return out;
}

export function detectMarubozu(bars: OhlcSeries): Int32Array {
	const n = bars.close.length;
	const out = emptySignals(n);
	const lookback = Math.max(
		lookbackBodyLong(),
		DEFAULT_CANDLE_SETTINGS[CandleSettingType.ShadowVeryShort].avgPeriod,
	);
	const bodyLong = new PeriodTotal(CandleSettingType.BodyLong, bars, lookbackBodyLong());
	const shadowVeryShort = new PeriodTotal(
		CandleSettingType.ShadowVeryShort,
		bars,
		DEFAULT_CANDLE_SETTINGS[CandleSettingType.ShadowVeryShort].avgPeriod,
	);
	const startIdx = lookback;
	bodyLong.init(startIdx);
	shadowVeryShort.init(startIdx);
	for (let i = startIdx; i < n; i++) {
		if (
			realBody(bars, i) > bodyLong.average(i) &&
			upperShadow(bars, i) < shadowVeryShort.average(i) &&
			lowerShadow(bars, i) < shadowVeryShort.average(i)
		) {
			out[i] = candleColor(bars, i) * 100;
		}
		bodyLong.advance(i);
		shadowVeryShort.advance(i);
	}
	return out;
}

export function detectLongLeggedDoji(bars: OhlcSeries): Int32Array {
	const n = bars.close.length;
	const out = emptySignals(n);
	const lookback = lookbackBodyDoji();
	const bodyDoji = new PeriodTotal(CandleSettingType.BodyDoji, bars, lookback);
	const shadowLong = new PeriodTotal(CandleSettingType.ShadowLong, bars, 0);
	const startIdx = lookback;
	bodyDoji.init(startIdx);
	shadowLong.init(startIdx);
	for (let i = startIdx; i < n; i++) {
		if (
			realBody(bars, i) <= bodyDoji.average(i) &&
			(lowerShadow(bars, i) > shadowLong.average(i) ||
				upperShadow(bars, i) > shadowLong.average(i))
		) {
			out[i] = 100;
		}
		bodyDoji.advance(i);
		shadowLong.advance(i);
	}
	return out;
}

export function detectDragonflyDoji(bars: OhlcSeries): Int32Array {
	const n = bars.close.length;
	const out = emptySignals(n);
	const lookback = Math.max(
		lookbackBodyDoji(),
		DEFAULT_CANDLE_SETTINGS[CandleSettingType.ShadowVeryShort].avgPeriod,
	);
	const bodyDoji = new PeriodTotal(CandleSettingType.BodyDoji, bars, lookbackBodyDoji());
	const shadowVeryShort = new PeriodTotal(
		CandleSettingType.ShadowVeryShort,
		bars,
		DEFAULT_CANDLE_SETTINGS[CandleSettingType.ShadowVeryShort].avgPeriod,
	);
	const startIdx = lookback;
	bodyDoji.init(startIdx);
	shadowVeryShort.init(startIdx);
	for (let i = startIdx; i < n; i++) {
		if (
			realBody(bars, i) <= bodyDoji.average(i) &&
			upperShadow(bars, i) < shadowVeryShort.average(i) &&
			lowerShadow(bars, i) > shadowVeryShort.average(i)
		) {
			out[i] = 100;
		}
		bodyDoji.advance(i);
		shadowVeryShort.advance(i);
	}
	return out;
}

export function detectGravestoneDoji(bars: OhlcSeries): Int32Array {
	const n = bars.close.length;
	const out = emptySignals(n);
	const lookback = Math.max(
		lookbackBodyDoji(),
		DEFAULT_CANDLE_SETTINGS[CandleSettingType.ShadowVeryShort].avgPeriod,
	);
	const bodyDoji = new PeriodTotal(CandleSettingType.BodyDoji, bars, lookbackBodyDoji());
	const shadowVeryShort = new PeriodTotal(
		CandleSettingType.ShadowVeryShort,
		bars,
		DEFAULT_CANDLE_SETTINGS[CandleSettingType.ShadowVeryShort].avgPeriod,
	);
	const startIdx = lookback;
	bodyDoji.init(startIdx);
	shadowVeryShort.init(startIdx);
	for (let i = startIdx; i < n; i++) {
		if (
			realBody(bars, i) <= bodyDoji.average(i) &&
			lowerShadow(bars, i) < shadowVeryShort.average(i) &&
			upperShadow(bars, i) > shadowVeryShort.average(i)
		) {
			out[i] = 100;
		}
		bodyDoji.advance(i);
		shadowVeryShort.advance(i);
	}
	return out;
}

export function detectEngulfing(bars: OhlcSeries): Int32Array {
	const n = bars.close.length;
	const out = emptySignals(n);
	for (let i = 1; i < n; i++) {
		const curColor = candleColor(bars, i);
		const prevColor = candleColor(bars, i - 1);
		const whiteEngulfsBlack =
			curColor === 1 &&
			prevColor === -1 &&
			((bars.close[i]! >= bars.open[i - 1]! && bars.open[i]! < bars.close[i - 1]!) ||
				(bars.close[i]! > bars.open[i - 1]! && bars.open[i]! <= bars.close[i - 1]!));
		const blackEngulfsWhite =
			curColor === -1 &&
			prevColor === 1 &&
			((bars.open[i]! >= bars.close[i - 1]! && bars.close[i]! < bars.open[i - 1]!) ||
				(bars.open[i]! > bars.close[i - 1]! && bars.close[i]! <= bars.open[i - 1]!));
		if (whiteEngulfsBlack || blackEngulfsWhite) {
			if (bars.open[i] !== bars.close[i - 1] && bars.close[i] !== bars.open[i - 1]) {
				out[i] = curColor * 100;
			} else {
				out[i] = curColor * 80;
			}
		}
	}
	return out;
}

export function detectHarami(bars: OhlcSeries): Int32Array {
	const n = bars.close.length;
	const out = emptySignals(n);
	const lookback = Math.max(lookbackBodyLong(), lookbackBodyShort()) + 1;
	const bodyLong = new PeriodTotal(CandleSettingType.BodyLong, bars, lookbackBodyLong());
	const bodyShort = new PeriodTotal(CandleSettingType.BodyShort, bars, lookbackBodyShort());
	const startIdx = lookback;
	bodyLong.init(startIdx - 1);
	bodyShort.init(startIdx);
	for (let i = startIdx; i < n; i++) {
		if (realBody(bars, i - 1) > bodyLong.average(i - 1)) {
			if (realBody(bars, i) <= bodyShort.average(i)) {
				const curMax = Math.max(bars.close[i]!, bars.open[i]!);
				const curMin = Math.min(bars.close[i]!, bars.open[i]!);
				const prevMax = Math.max(bars.close[i - 1]!, bars.open[i - 1]!);
				const prevMin = Math.min(bars.close[i - 1]!, bars.open[i - 1]!);
				if (curMax < prevMax && curMin > prevMin) {
					out[i] = -candleColor(bars, i - 1) * 100;
				} else if (curMax <= prevMax && curMin >= prevMin) {
					out[i] = -candleColor(bars, i - 1) * 80;
				}
			}
		}
		bodyLong.advanceAtOffset(i, i - 1);
		bodyShort.advance(i);
	}
	return out;
}

export function detectPiercing(bars: OhlcSeries): Int32Array {
	const n = bars.close.length;
	const out = emptySignals(n);
	const lookback = lookbackBodyLong() + 1;
	const bodyLongPrev = new PeriodTotal(CandleSettingType.BodyLong, bars, lookbackBodyLong());
	const bodyLongCur = new PeriodTotal(CandleSettingType.BodyLong, bars, lookbackBodyLong());
	const startIdx = lookback;
	bodyLongPrev.init(startIdx - 1);
	bodyLongCur.init(startIdx);
	for (let i = startIdx; i < n; i++) {
		const prevBody = realBody(bars, i - 1);
		if (
			candleColor(bars, i - 1) === -1 &&
			prevBody > bodyLongPrev.average(i - 1) &&
			candleColor(bars, i) === 1 &&
			realBody(bars, i) > bodyLongCur.average(i) &&
			bars.open[i]! < bars.low[i - 1]! &&
			bars.close[i]! < bars.open[i - 1]! &&
			bars.close[i]! > bars.close[i - 1]! + prevBody * 0.5
		) {
			out[i] = 100;
		}
		bodyLongPrev.advanceAtOffset(i, i - 1);
		bodyLongCur.advance(i);
	}
	return out;
}

export function detectDarkCloudCover(bars: OhlcSeries): Int32Array {
	const n = bars.close.length;
	const out = emptySignals(n);
	const lookback = lookbackBodyLong() + 1;
	const bodyLong = new PeriodTotal(CandleSettingType.BodyLong, bars, lookbackBodyLong());
	const startIdx = lookback;
	bodyLong.init(startIdx - 1);
	for (let i = startIdx; i < n; i++) {
		const prevBody = realBody(bars, i - 1);
		if (
			candleColor(bars, i - 1) === 1 &&
			prevBody > bodyLong.average(i - 1) &&
			candleColor(bars, i) === -1 &&
			bars.open[i]! > bars.high[i - 1]! &&
			bars.close[i]! > bars.open[i - 1]! &&
			bars.close[i]! < bars.close[i - 1]! - prevBody * PENETRATION
		) {
			out[i] = -100;
		}
		bodyLong.advanceAtOffset(i, i - 1);
	}
	return out;
}

export function detectMorningStar(bars: OhlcSeries): Int32Array {
	const n = bars.close.length;
	const out = emptySignals(n);
	const lookback = lookbackThreeBar();
	const bodyLong = new PeriodTotal(CandleSettingType.BodyLong, bars, lookbackBodyLong());
	const bodyShortMid = new PeriodTotal(CandleSettingType.BodyShort, bars, lookbackBodyShort());
	const bodyShortLast = new PeriodTotal(CandleSettingType.BodyShort, bars, lookbackBodyShort());
	const startIdx = lookback;
	bodyLong.init(startIdx - 2);
	bodyShortMid.init(startIdx - 1);
	bodyShortLast.init(startIdx);
	for (let i = startIdx; i < n; i++) {
		const firstBody = realBody(bars, i - 2);
		if (
			candleColor(bars, i - 2) === -1 &&
			candleColor(bars, i) === 1 &&
			Math.max(bars.open[i - 1]!, bars.close[i - 1]!) <
				Math.min(bars.open[i - 2]!, bars.close[i - 2]!) &&
			bars.close[i]! > bars.close[i - 2]! + firstBody * PENETRATION &&
			firstBody > bodyLong.average(i - 2) &&
			realBody(bars, i - 1) <= bodyShortMid.average(i - 1) &&
			realBody(bars, i) > bodyShortLast.average(i)
		) {
			out[i] = 100;
		}
		bodyLong.advanceAtOffset(i, i - 2);
		bodyShortMid.advanceAtOffset(i, i - 1);
		bodyShortLast.advance(i);
	}
	return out;
}

export function detectEveningStar(bars: OhlcSeries): Int32Array {
	const n = bars.close.length;
	const out = emptySignals(n);
	const lookback = lookbackThreeBar();
	const bodyLong = new PeriodTotal(CandleSettingType.BodyLong, bars, lookbackBodyLong());
	const bodyShortMid = new PeriodTotal(CandleSettingType.BodyShort, bars, lookbackBodyShort());
	const bodyShortLast = new PeriodTotal(CandleSettingType.BodyShort, bars, lookbackBodyShort());
	const startIdx = lookback;
	bodyLong.init(startIdx - 2);
	bodyShortMid.init(startIdx - 1);
	bodyShortLast.init(startIdx);
	for (let i = startIdx; i < n; i++) {
		const firstBody = realBody(bars, i - 2);
		if (
			candleColor(bars, i - 2) === 1 &&
			candleColor(bars, i) === -1 &&
			Math.min(bars.open[i - 1]!, bars.close[i - 1]!) >
				Math.max(bars.open[i - 2]!, bars.close[i - 2]!) &&
			bars.close[i]! < bars.close[i - 2]! - firstBody * PENETRATION &&
			firstBody > bodyLong.average(i - 2) &&
			realBody(bars, i - 1) <= bodyShortMid.average(i - 1) &&
			realBody(bars, i) > bodyShortLast.average(i)
		) {
			out[i] = -100;
		}
		bodyLong.advanceAtOffset(i, i - 2);
		bodyShortMid.advanceAtOffset(i, i - 1);
		bodyShortLast.advance(i);
	}
	return out;
}

export function detectThreeWhiteSoldiers(bars: OhlcSeries): Int32Array {
	const n = bars.close.length;
	const out = emptySignals(n);
	const shadowPeriod = DEFAULT_CANDLE_SETTINGS[CandleSettingType.ShadowVeryShort].avgPeriod;
	const lookback = Math.max(lookbackBodyShort(), lookbackNear(), shadowPeriod) + 2;
	const shadowTotals = [
		new PeriodTotal(CandleSettingType.ShadowVeryShort, bars, shadowPeriod),
		new PeriodTotal(CandleSettingType.ShadowVeryShort, bars, shadowPeriod),
		new PeriodTotal(CandleSettingType.ShadowVeryShort, bars, shadowPeriod),
	];
	const nearTotals = [
		new PeriodTotal(CandleSettingType.Near, bars, lookbackNear()),
		new PeriodTotal(CandleSettingType.Near, bars, lookbackNear()),
	];
	const farTotals = [
		new PeriodTotal(CandleSettingType.Far, bars, DEFAULT_CANDLE_SETTINGS[CandleSettingType.Far].avgPeriod),
		new PeriodTotal(CandleSettingType.Far, bars, DEFAULT_CANDLE_SETTINGS[CandleSettingType.Far].avgPeriod),
	];
	const bodyShort = new PeriodTotal(CandleSettingType.BodyShort, bars, lookbackBodyShort());
	const startIdx = lookback;
	for (let t = 0; t < 3; t++) {
		shadowTotals[t]!.init(startIdx - t);
	}
	for (let t = 0; t < 2; t++) {
		nearTotals[t]!.init(startIdx - 2 + t);
		farTotals[t]!.init(startIdx - 2 + t);
	}
	bodyShort.init(startIdx);
	for (let i = startIdx; i < n; i++) {
		if (
			candleColor(bars, i - 2) === 1 &&
			upperShadow(bars, i - 2) < shadowTotals[2]!.average(i - 2) &&
			candleColor(bars, i - 1) === 1 &&
			upperShadow(bars, i - 1) < shadowTotals[1]!.average(i - 1) &&
			candleColor(bars, i) === 1 &&
			upperShadow(bars, i) < shadowTotals[0]!.average(i) &&
			bars.close[i]! > bars.close[i - 1]! &&
			bars.close[i - 1]! > bars.close[i - 2]! &&
			bars.open[i - 1]! > bars.open[i - 2]! &&
			bars.open[i - 1]! <= bars.close[i - 2]! + nearTotals[0]!.average(i - 2) &&
			bars.open[i]! > bars.open[i - 1]! &&
			bars.open[i]! <= bars.close[i - 1]! + nearTotals[1]!.average(i - 1) &&
			realBody(bars, i - 1) >
				realBody(bars, i - 2) - farTotals[0]!.average(i - 2) &&
			realBody(bars, i) > realBody(bars, i - 1) - farTotals[1]!.average(i - 1) &&
			realBody(bars, i) > bodyShort.average(i)
		) {
			out[i] = 100;
		}
		for (let t = 0; t < 3; t++) {
			shadowTotals[t]!.advanceAtOffset(i, i - t);
		}
		for (let t = 0; t < 2; t++) {
			nearTotals[t]!.advanceAtOffset(i, i - 2 + t);
			farTotals[t]!.advanceAtOffset(i, i - 2 + t);
		}
		bodyShort.advance(i);
	}
	return out;
}

export function detectThreeBlackCrows(bars: OhlcSeries): Int32Array {
	const n = bars.close.length;
	const out = emptySignals(n);
	const shadowPeriod = DEFAULT_CANDLE_SETTINGS[CandleSettingType.ShadowVeryShort].avgPeriod;
	const lookback = lookbackThreeBlackCrows();
	const shadowTotals = [
		new PeriodTotal(CandleSettingType.ShadowVeryShort, bars, shadowPeriod),
		new PeriodTotal(CandleSettingType.ShadowVeryShort, bars, shadowPeriod),
		new PeriodTotal(CandleSettingType.ShadowVeryShort, bars, shadowPeriod),
	];
	const startIdx = lookback;
	for (let t = 0; t < 3; t++) {
		shadowTotals[t]!.init(startIdx - t);
	}
	for (let i = startIdx; i < n; i++) {
		if (
			candleColor(bars, i - 3) === 1 &&
			candleColor(bars, i - 2) === -1 &&
			candleColor(bars, i - 1) === -1 &&
			candleColor(bars, i) === -1 &&
			bars.open[i - 1]! < bars.open[i - 2]! &&
			bars.open[i - 1]! > bars.close[i - 2]! &&
			bars.open[i]! < bars.open[i - 1]! &&
			bars.open[i]! > bars.close[i - 1]! &&
			bars.high[i - 3]! > bars.close[i - 2]! &&
			bars.close[i - 2]! > bars.close[i - 1]! &&
			bars.close[i - 1]! > bars.close[i]! &&
			lowerShadow(bars, i - 2) < shadowTotals[2]!.average(i - 2) &&
			lowerShadow(bars, i - 1) < shadowTotals[1]!.average(i - 1) &&
			lowerShadow(bars, i) < shadowTotals[0]!.average(i)
		) {
			out[i] = -100;
		}
		for (let t = 0; t < 3; t++) {
			shadowTotals[t]!.advanceAtOffset(i, i - t);
		}
	}
	return out;
}

export const DETECTORS: Record<
	string,
	(bars: OhlcSeries) => Int32Array
> = {
	doji: detectDoji,
	spinning_top: detectSpinningTop,
	hammer: detectHammer,
	hanging_man: detectHangingMan,
	shooting_star: detectShootingStar,
	inverted_hammer: detectInvertedHammer,
	marubozu: detectMarubozu,
	long_legged_doji: detectLongLeggedDoji,
	dragonfly_doji: detectDragonflyDoji,
	gravestone_doji: detectGravestoneDoji,
	engulfing: detectEngulfing,
	harami: detectHarami,
	piercing: detectPiercing,
	dark_cloud_cover: detectDarkCloudCover,
	morning_star: detectMorningStar,
	evening_star: detectEveningStar,
	three_white_soldiers: detectThreeWhiteSoldiers,
	three_black_crows: detectThreeBlackCrows,
};
