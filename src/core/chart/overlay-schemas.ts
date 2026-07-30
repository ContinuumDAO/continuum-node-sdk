import {z} from 'zod';

const overlayStyleSchema = z
	.object({
		color: z.string().min(1).optional(),
		lineWidth: z.number().positive().optional(),
		lineStyle: z.enum(['solid', 'dashed', 'dotted']).optional(),
	})
	.strict();

export const ChartMaOverlaySchema = z
	.object({
		type: z.enum(['sma', 'ema']),
		sourceSeriesId: z.string().min(1).max(64),
		period: z.number().int().min(2).max(500).optional(),
		id: z.string().min(1).max(64).optional(),
		label: z.string().min(1).max(128).optional(),
		overlay: z.boolean().optional(),
		priceScaleId: z.enum(['left', 'right']).optional(),
		style: overlayStyleSchema.optional(),
	})
	.strict();

export const ChartBollingerOverlaySchema = z
	.object({
		type: z.literal('bollinger'),
		sourceSeriesId: z.string().min(1).max(64),
		period: z.number().int().min(2).max(500).optional(),
		stdDev: z.number().positive().max(10).optional(),
		/** Shaded fill between upper and lower bands (default true). */
		fill: z.boolean().optional(),
		id: z.string().min(1).max(64).optional(),
		overlay: z.boolean().optional(),
		priceScaleId: z.enum(['left', 'right']).optional(),
		style: overlayStyleSchema.optional(),
	})
	.strict();

export const ChartDonchianOverlaySchema = z
	.object({
		type: z.literal('donchian'),
		sourceSeriesId: z.string().min(1).max(64),
		/** Channel length; trade-desk.yaml donchianPeriod default is 20. */
		period: z.number().int().min(2).max(500).optional(),
		/** Shaded fill between upper and lower channels (default true). */
		fill: z.boolean().optional(),
		id: z.string().min(1).max(64).optional(),
		overlay: z.boolean().optional(),
		priceScaleId: z.enum(['left', 'right']).optional(),
		style: overlayStyleSchema.optional(),
	})
	.strict();

export const ChartSupertrendOverlaySchema = z
	.object({
		type: z.literal('supertrend'),
		sourceSeriesId: z.string().min(1).max(64),
		/** ATR length; trade-desk.yaml supertrendPeriod default is 10. */
		period: z.number().int().min(2).max(500).optional(),
		/** ATR multiplier; trade-desk.yaml supertrendMultiplier default is 3. */
		multiplier: z.number().positive().max(20).optional(),
		id: z.string().min(1).max(64).optional(),
		overlay: z.boolean().optional(),
		priceScaleId: z.enum(['left', 'right']).optional(),
		style: overlayStyleSchema.optional(),
	})
	.strict();

export const ChartIchimokuOverlaySchema = z
	.object({
		type: z.literal('ichimoku'),
		sourceSeriesId: z.string().min(1).max(64),
		/** Tenkan-sen length; trade-desk.yaml ichimokuConversionPeriod default is 9. */
		conversionPeriod: z.number().int().min(2).max(500).optional(),
		/** Kijun-sen length; trade-desk.yaml ichimokuBasePeriod default is 26. */
		basePeriod: z.number().int().min(2).max(500).optional(),
		/** Senkou Span B length; trade-desk.yaml ichimokuSpanPeriod default is 52. */
		spanPeriod: z.number().int().min(2).max(500).optional(),
		/** Cloud / chikou displacement; trade-desk.yaml ichimokuDisplacement default is 26. */
		displacement: z.number().int().min(1).max(200).optional(),
		/** Shaded Kumo fill between Senkou spans (default true). */
		fill: z.boolean().optional(),
		/** Plot lagging span (close displaced back); default true. */
		chikou: z.boolean().optional(),
		id: z.string().min(1).max(64).optional(),
		overlay: z.boolean().optional(),
		priceScaleId: z.enum(['left', 'right']).optional(),
		style: overlayStyleSchema.optional(),
	})
	.strict();

export const ChartFibonacciRangeSchema = z
	.object({
		high: z.number(),
		low: z.number(),
		trend: z.enum(['up', 'down']),
	})
	.strict();

export const ChartFibonacciOverlaySchema = z
	.object({
		type: z.literal('fibonacci'),
		sourceSeriesId: z.string().min(1).max(64).optional(),
		range: ChartFibonacciRangeSchema.optional(),
		/** Subset of retracement ratios; default all standard levels (0 … 1). */
		levels: z.array(z.number().min(0).max(1)).min(1).max(12).optional(),
		trend: z.enum(['up', 'down']).optional(),
		id: z.string().min(1).max(64).optional(),
		overlay: z.boolean().optional(),
		priceScaleId: z.enum(['left', 'right']).optional(),
		style: overlayStyleSchema.optional(),
		/** Per-ratio line styles; keys like "0.618". */
		levelStyles: z.record(z.string(), overlayStyleSchema).optional(),
		/** Ratios to emphasize; default [0.618] when omitted. */
		highlightLevels: z.array(z.number().min(0).max(1)).max(12).optional(),
	})
	.strict()
	.refine(o => o.sourceSeriesId != null || o.range != null, {
		message: 'Fibonacci overlay requires sourceSeriesId and/or range.',
	});

const horizontalLevelRowSchema = z
	.object({
		price: z.number(),
		label: z.string().min(1).max(64).optional(),
		kind: z.enum(['support', 'resistance', 'level']).optional(),
	})
	.strict();

export const ChartHorizontalLevelsOverlaySchema = z
	.object({
		type: z.literal('horizontal_levels'),
		levels: z.array(horizontalLevelRowSchema).min(1).max(12),
		id: z.string().min(1).max(64).optional(),
		style: overlayStyleSchema.optional(),
	})
	.strict();

const trendLinePointSchema = z
	.object({
		time: z.union([
			z.number(),
			z
				.object({
					year: z.number().int(),
					month: z.number().int(),
					day: z.number().int(),
				})
				.strict(),
		]),
		price: z.number(),
	})
	.strict();

const trendLineRowSchema = z
	.object({
		pointA: trendLinePointSchema,
		pointB: trendLinePointSchema,
		label: z.string().min(1).max(64).optional(),
		kind: z.enum(['support', 'resistance']).optional(),
	})
	.strict();

export const ChartTrendLinesOverlaySchema = z
	.object({
		type: z.literal('trend_lines'),
		lines: z.array(trendLineRowSchema).min(1).max(8),
		id: z.string().min(1).max(64).optional(),
		style: overlayStyleSchema.optional(),
	})
	.strict();

const chartPatternPointSchema = z
	.object({
		time: z.union([
			z.number(),
			z
				.object({
					year: z.number().int(),
					month: z.number().int(),
					day: z.number().int(),
				})
				.strict(),
		]),
		price: z.number(),
		label: z.string().min(1).max(16).optional(),
		role: z.string().min(1).max(32).optional(),
	})
	.strict();

const chartPatternLineSchema = z
	.object({
		pointA: chartPatternPointSchema,
		pointB: chartPatternPointSchema,
		label: z.string().min(1).max(64).optional(),
		kind: z.enum(['support', 'resistance', 'neckline', 'boundary', 'flagpole']).optional(),
	})
	.strict();

export const ChartPatternOverlaySchema = z
	.object({
		type: z.literal('chart_pattern'),
		patternName: z.string().min(1).max(128),
		patternId: z.string().min(1).max(64).optional(),
		points: z.array(chartPatternPointSchema).max(12),
		lines: z.array(chartPatternLineSchema).max(8),
		levels: z
			.array(
				z
					.object({
						price: z.number(),
						label: z.string().min(1).max(64).optional(),
						kind: z.enum(['support', 'resistance', 'neckline', 'level']).optional(),
						role: z.string().min(1).max(32).optional(),
					})
					.strict(),
			)
			.max(8)
			.optional(),
		polylines: z
			.array(
				z
					.object({
						points: z.array(chartPatternPointSchema).min(2).max(16),
						label: z.string().min(1).max(64).optional(),
						role: z.string().min(1).max(32).optional(),
						style: overlayStyleSchema.optional(),
					})
					.strict(),
			)
			.max(4)
			.optional(),
		markers: z
			.array(
				z
					.object({
						time: chartPatternPointSchema.shape.time,
						price: z.number(),
						label: z.string().min(1).max(64).optional(),
						role: z.string().min(1).max(32).optional(),
					})
					.strict(),
			)
			.max(8)
			.optional(),
		clipToBarSpan: z
			.object({
				fromTimeSec: z.number(),
				toTimeSec: z.number(),
			})
			.strict()
			.optional(),
		barHighlights: z
			.array(
				z
					.object({
						fromTimeSec: z.number(),
						toTimeSec: z.number(),
						verdict: z.enum(['confirming', 'neutral', 'weak']),
						role: z.string().min(1).max(32).optional(),
						label: z.string().min(1).max(64).optional(),
					})
					.strict(),
			)
			.max(12)
			.optional(),
		volumeProfile: z
			.object({
				barSpan: z
					.object({
						fromIndex: z.number().int(),
						toIndex: z.number().int(),
						fromTimeSec: z.number(),
						toTimeSec: z.number(),
					})
					.strict(),
				bins: z
					.array(
						z
							.object({
								priceLo: z.number(),
								priceHi: z.number(),
								volume: z.number(),
							})
							.strict(),
					)
					.min(1)
					.max(16),
				pocPrice: z.number(),
			})
			.strict()
			.optional(),
		id: z.string().min(1).max(64).optional(),
		style: overlayStyleSchema.optional(),
		pointStyle: overlayStyleSchema.optional(),
	})
	.strict();

const elliottWavePointSchema = z
	.object({
		time: z.union([
			z.number(),
			z
				.object({
					year: z.number().int(),
					month: z.number().int(),
					day: z.number().int(),
				})
				.strict(),
		]),
		price: z.number(),
	})
	.strict();

const elliottWaveLegSchema = z
	.object({
		label: z.string().min(1).max(16),
		pointA: elliottWavePointSchema,
		pointB: elliottWavePointSchema,
		kind: z.enum(['motive', 'corrective']).optional(),
		isInProgress: z.boolean().optional(),
	})
	.strict();

export const ChartElliottWavesOverlaySchema = z
	.object({
		type: z.literal('elliott_waves'),
		patternName: z.string().min(1).max(128),
		waves: z.array(elliottWaveLegSchema).max(8),
		markers: z
			.array(
				z
					.object({
						time: elliottWavePointSchema.shape.time,
						price: z.number(),
						label: z.string().min(1).max(16).optional(),
					})
					.strict(),
			)
			.max(16)
			.optional(),
		levels: z
			.array(
				z
					.object({
						price: z.number(),
						label: z.string().min(1).max(64).optional(),
						kind: z.enum(['support', 'resistance', 'level']).optional(),
						role: z.string().min(1).max(32).optional(),
					})
					.strict(),
			)
			.max(8)
			.optional(),
		clipToBarSpan: z
			.object({
				fromTimeSec: z.number(),
				toTimeSec: z.number(),
			})
			.strict()
			.optional(),
		id: z.string().min(1).max(64).optional(),
		style: overlayStyleSchema.optional(),
	})
	.strict();

export const ChartPivotLevelsOverlaySchema = z
	.object({
		type: z.literal('pivot_levels'),
		levels: z
			.array(
				z
					.object({
						id: z.string().min(1).max(8),
						price: z.number(),
					})
					.strict(),
			)
			.min(1)
			.max(8),
		pivotStyle: overlayStyleSchema.optional(),
		style: overlayStyleSchema.optional(),
		id: z.string().min(1).max(64).optional(),
	})
	.strict();

export const ChartRsiOverlaySchema = z
	.object({
		type: z.literal('rsi'),
		sourceSeriesId: z.string().min(1).max(64),
		period: z.number().int().min(2).max(500).optional(),
		id: z.string().min(1).max(64).optional(),
		label: z.string().min(1).max(128).optional(),
		style: overlayStyleSchema.optional(),
	})
	.strict();

export const ChartZScoreOverlaySchema = z
	.object({
		type: z.literal('zscore'),
		sourceSeriesId: z.string().min(1).max(64),
		/** SMA/SD lookback; trade-desk.yaml zScorePeriod default is 20. */
		period: z.number().int().min(2).max(500).optional(),
		/** Horizontal guide at ±entryZ (default 2). */
		entryZ: z.number().positive().max(20).optional(),
		/** Horizontal guide at ±exitZ (default 0.5). */
		exitZ: z.number().min(0).max(10).optional(),
		id: z.string().min(1).max(64).optional(),
		label: z.string().min(1).max(128).optional(),
		style: overlayStyleSchema.optional(),
	})
	.strict();

export const ChartMacdOverlaySchema = z
	.object({
		type: z.literal('macd'),
		sourceSeriesId: z.string().min(1).max(64),
		fastPeriod: z.number().int().min(2).max(500).optional(),
		slowPeriod: z.number().int().min(2).max(500).optional(),
		signalPeriod: z.number().int().min(2).max(500).optional(),
		id: z.string().min(1).max(64).optional(),
		style: overlayStyleSchema.optional(),
	})
	.strict();

export const ChartStochasticRsiOverlaySchema = z
	.object({
		type: z.literal('stochasticrsi'),
		sourceSeriesId: z.string().min(1).max(64),
		rsiPeriod: z.number().int().min(2).max(500).optional(),
		stochasticPeriod: z.number().int().min(2).max(500).optional(),
		kPeriod: z.number().int().min(1).max(500).optional(),
		dPeriod: z.number().int().min(1).max(500).optional(),
		id: z.string().min(1).max(64).optional(),
		style: overlayStyleSchema.optional(),
	})
	.strict();

export const ChartObvOverlaySchema = z
	.object({
		type: z.literal('obv'),
		sourceSeriesId: z.string().min(1).max(64),
		id: z.string().min(1).max(64).optional(),
		label: z.string().min(1).max(128).optional(),
		style: overlayStyleSchema.optional(),
	})
	.strict();

export const ChartAdOverlaySchema = z
	.object({
		type: z.literal('ad'),
		sourceSeriesId: z.string().min(1).max(64),
		id: z.string().min(1).max(64).optional(),
		label: z.string().min(1).max(128).optional(),
		style: overlayStyleSchema.optional(),
	})
	.strict();

export const ChartAdoscOverlaySchema = z
	.object({
		type: z.literal('adosc'),
		sourceSeriesId: z.string().min(1).max(64),
		fastPeriod: z.number().int().min(2).max(500).optional(),
		slowPeriod: z.number().int().min(2).max(500).optional(),
		id: z.string().min(1).max(64).optional(),
		label: z.string().min(1).max(128).optional(),
		style: overlayStyleSchema.optional(),
	})
	.strict();

const divergencePointSchema = z
	.object({
		time: z.union([
			z.number(),
			z
				.object({
					year: z.number().int(),
					month: z.number().int(),
					day: z.number().int(),
				})
				.strict(),
		]),
		price: z.number(),
	})
	.strict();

const divergenceOscPointSchema = z
	.object({
		time: z.union([
			z.number(),
			z
				.object({
					year: z.number().int(),
					month: z.number().int(),
					day: z.number().int(),
				})
				.strict(),
		]),
		value: z.number(),
	})
	.strict();

export const ChartTradePositionOverlaySchema = z
	.object({
		type: z.literal('trade_position'),
		side: z.enum(['long', 'short']),
		entry: z.number(),
		target: z.number(),
		invalidation: z.number(),
		liquidation: z.number().optional(),
		tradeRatio: z.number().optional(),
		/** Default true — when false, clients hide ratio annotation. */
		showTradeRatio: z.boolean().optional(),
		id: z.string().min(1).max(64).optional(),
	})
	.strict();

export const ChartDivergenceOverlaySchema = z
	.object({
		type: z.literal('divergence'),
		segments: z
			.array(
				z
					.object({
						kind: z.enum([
							'regular_bullish',
							'regular_bearish',
							'hidden_bullish',
							'hidden_bearish',
						]),
						oscillator: z.enum(['rsi', 'stochasticrsi']),
						/** Resolved at apply time to match the indicator pane id. */
						oscillatorPaneId: z.string().min(1).max(64).optional(),
						price: z
							.object({
								pointA: divergencePointSchema,
								pointB: divergencePointSchema,
							})
							.strict(),
						oscillatorLine: z
							.object({
								pointA: divergenceOscPointSchema,
								pointB: divergenceOscPointSchema,
							})
							.strict(),
						label: z.string().min(1).max(64).optional(),
					})
					.strict(),
			)
			.min(1)
			.max(4),
		id: z.string().min(1).max(64).optional(),
		style: overlayStyleSchema.optional(),
	})
	.strict();

export const ChartOverlayInputSchema = z.discriminatedUnion('type', [
	ChartMaOverlaySchema,
	ChartBollingerOverlaySchema,
	ChartDonchianOverlaySchema,
	ChartSupertrendOverlaySchema,
	ChartIchimokuOverlaySchema,
	ChartFibonacciOverlaySchema,
	ChartHorizontalLevelsOverlaySchema,
	ChartPivotLevelsOverlaySchema,
	ChartTrendLinesOverlaySchema,
	ChartPatternOverlaySchema,
	ChartElliottWavesOverlaySchema,
	ChartDivergenceOverlaySchema,
	ChartTradePositionOverlaySchema,
	ChartRsiOverlaySchema,
	ChartZScoreOverlaySchema,
	ChartMacdOverlaySchema,
	ChartStochasticRsiOverlaySchema,
	ChartObvOverlaySchema,
	ChartAdOverlaySchema,
	ChartAdoscOverlaySchema,
]);

export const PrepareChartOverlaysSchema = z.array(ChartOverlayInputSchema).max(16);

export const PrepareChartDrawingsSchema = z
	.array(
		z.discriminatedUnion('type', [
			ChartHorizontalLevelsOverlaySchema,
			ChartPivotLevelsOverlaySchema,
			ChartFibonacciOverlaySchema,
			ChartTrendLinesOverlaySchema,
			ChartPatternOverlaySchema,
			ChartElliottWavesOverlaySchema,
			ChartDivergenceOverlaySchema,
			ChartTradePositionOverlaySchema,
		]),
	)
	.max(8);

export type ChartTradePositionOverlay = z.infer<typeof ChartTradePositionOverlaySchema>;
export type ChartOverlayInput = z.infer<typeof ChartOverlayInputSchema>;
