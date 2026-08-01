import {z} from 'zod';
import type {SdkResult} from '../../result.js';
import {
	DEFAULT_DEPTH_AVERAGE_WINDOW_SEC,
	DEFAULT_DEPTH_EXCHANGE_ID,
	DEFAULT_DEPTH_LEVEL_COUNT,
	DEFAULT_DEPTH_LIMIT,
	DEFAULT_DEPTH_MIN_SAMPLES,
	DEFAULT_DEPTH_SAMPLE_INTERVAL_SEC,
	DepthExchangeIdSchema,
	ensureDepthSampler,
	fetchBinanceDepthSnapshot,
	fetchCoinbaseDepthSnapshot,
	getAveragedDepthProfile,
	getDepthSamplerSampleCount,
	ingestDepthSnapshot,
	inferDepthExchangeId,
	buildLiquidityDepthLevelMenu,
	summarizeLiquidityDepthLevels,
	resolveBinanceDepthLimit,
	resolveCoinbaseDepthLimit,
	resolveDepthSymbol,
	type AveragedDepthProfile,
} from '../depth/index.js';
import {ChartLiveTickSchema} from '../live/schemas.js';
import {buildOhlcvAnalysisMeta, OhlcvAnalysisMetaSchema} from './analysis-meta.js';
import {prepareOhlcvBarsForAnalysis} from './ohlcv-live-merge.js';
import {preprocessOhlcvToolInput, missingOhlcvBarsReason} from './ohlcv-input.js';
import {ohlcvToolRejectIfLineOnly} from './time-series-analyze-tools.js';

const liquidityDepthInputSchema = z
	.object({
		toolResult: z.unknown().optional(),
		rows: z.array(z.unknown()).min(1).optional(),
		title: z.string().trim().min(1).max(256).optional(),
		label: z.string().trim().min(1).max(128).optional(),
		ohlcvDigest: z.string().trim().min(1).max(512).optional(),
		mergeLive: z.boolean().optional(),
		liveTick: ChartLiveTickSchema.optional(),
		allowRowsOnly: z.boolean().optional(),
		/** Venue-native spot symbol (e.g. BTCUSDT). Inferred from fetch when omitted. */
		symbol: z.string().trim().min(1).max(64).optional(),
		depthExchangeId: DepthExchangeIdSchema.optional(),
		depthSampleIntervalSec: z.number().int().min(5).max(300).optional(),
		depthAverageWindowSec: z.number().int().min(30).max(3_600).optional(),
		depthLimit: z.number().int().min(5).max(5_000).optional(),
		depthLevelCount: z.number().int().min(1).max(32).optional(),
		/** When true, do not start/poll the background sampler (tests / offline). */
		skipSampler: z.boolean().optional(),
	})
	.strict();

export const AnalyzeLiquidityDepthInputSchema = z.preprocess(
	preprocessOhlcvToolInput,
	liquidityDepthInputSchema,
);

const levelMenuEntrySchema = z
	.object({
		index: z.number().int().nonnegative(),
		levelNumber: z.number().int().positive(),
		side: z.enum(['bid', 'ask']),
		price: z.number(),
		avgSize: z.number(),
		relativeStrength: z.number(),
		distancePct: z.number(),
	})
	.strict();

export const AnalyzeLiquidityDepthOutputSchema = z
	.object({
		analysis: z
			.object({
				summary: z.string(),
				interpretation: z.string(),
				market: z.literal('spot'),
				exchangeId: DepthExchangeIdSchema,
				symbol: z.string(),
				mid: z.number().nullable(),
				windowSec: z.number().int(),
				sampleCount: z.number().int(),
				warmingUp: z.boolean(),
				levelMenu: z.array(levelMenuEntrySchema),
				/** Full averaged bins for optional left-axis chart overlay. */
				profileBins: z
					.array(
						z
							.object({
								priceLo: z.number(),
								priceHi: z.number(),
								bidSize: z.number(),
								askSize: z.number(),
								totalSize: z.number(),
							})
							.strict(),
					)
					.max(2_000),
			})
			.strict(),
		meta: OhlcvAnalysisMetaSchema,
	})
	.strict();

function buildInterpretation(
	menu: z.infer<typeof levelMenuEntrySchema>[],
	warmingUp: boolean,
): string {
	if (warmingUp) {
		return (
			'Averaged spot order-book depth is still accumulating samples. ' +
			'Present the partial levelMenu table and note that relative strength will stabilize after the full window.'
		);
	}
	if (!menu.length) {
		return 'No notable bid/ask walls in the averaged book — report empty table and suggest waiting or another symbol.';
	}
	return (
		'Present analysis.levelMenu as a numbered table: #, side (bid/ask), price, avgSize, ' +
		'relativeStrength (0–1), distancePct from mid. This is spot resting liquidity — not a Trade Idea. ' +
		'Optional: apply_liquidity_depth_drawings / prepare_chart overlay for the left-axis average profile.'
	);
}

export async function analyzeLiquidityDepth(
	input: unknown,
): Promise<SdkResult<z.infer<typeof AnalyzeLiquidityDepthOutputSchema>>> {
	const parsed = AnalyzeLiquidityDepthInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.issues.map(i => i.message).join('; ')};
	}
	const data = parsed.data;

	const lineOnly = ohlcvToolRejectIfLineOnly(data);
	if (lineOnly) {
		return lineOnly;
	}

	const prepared = await prepareOhlcvBarsForAnalysis(data);
	if (!prepared.ok) {
		return prepared;
	}
	const {bars, liveMerge, fingerprint} = prepared.data;
	if (!bars.length) {
		return {ok: false, reason: missingOhlcvBarsReason(data)};
	}

	// Prefer venue inferred from the OHLCV fetch over trade-desk defaults (yaml often says binance).
	const exchangeId =
		inferDepthExchangeId(data.toolResult) ??
		data.depthExchangeId ??
		DEFAULT_DEPTH_EXCHANGE_ID;
	if (exchangeId !== 'binance' && exchangeId !== 'coinbase') {
		return {
			ok: false,
			reason:
				`Depth exchange "${exchangeId}" is not implemented. Use depthExchangeId: "binance" or "coinbase" (spot).`,
		};
	}

	const symbol = resolveDepthSymbol({
		symbol: data.symbol,
		toolResult: data.toolResult,
		title: data.title,
		label: data.label,
		exchangeId,
	});
	if (!symbol) {
		return {
			ok: false,
			reason:
				exchangeId === 'coinbase'
					? 'Could not resolve a Coinbase product id. Pass symbol (e.g. BTC-USD) or a coinbase_candles toolResult with productId.'
					: 'Could not resolve a spot symbol for depth sampling. Pass symbol (e.g. BTCUSDT) or use a Binance klines toolResult with symbol.',
		};
	}

	const sampleIntervalSec = data.depthSampleIntervalSec ?? DEFAULT_DEPTH_SAMPLE_INTERVAL_SEC;
	const windowSec = data.depthAverageWindowSec ?? DEFAULT_DEPTH_AVERAGE_WINDOW_SEC;
	const limit =
		exchangeId === 'coinbase'
			? resolveCoinbaseDepthLimit(data.depthLimit ?? DEFAULT_DEPTH_LIMIT)
			: resolveBinanceDepthLimit(data.depthLimit ?? DEFAULT_DEPTH_LIMIT);
	const levelCount = data.depthLevelCount ?? DEFAULT_DEPTH_LEVEL_COUNT;
	const samplerKey = {exchangeId, symbol};

	if (!data.skipSampler) {
		ensureDepthSampler(samplerKey, {sampleIntervalSec, windowSec, limit});
		const fresh =
			exchangeId === 'coinbase'
				? await fetchCoinbaseDepthSnapshot({productId: symbol, limit})
				: await fetchBinanceDepthSnapshot({symbol, limit});
		if (fresh) {
			ingestDepthSnapshot(samplerKey, fresh, {sampleIntervalSec, windowSec, limit});
		}
	}

	const profile: AveragedDepthProfile | null = getAveragedDepthProfile(samplerKey);
	const sampleCount = getDepthSamplerSampleCount(samplerKey);
	const warmingUp = sampleCount < DEFAULT_DEPTH_MIN_SAMPLES;

	if (!profile) {
		return {
			ok: false,
			reason:
				`No spot depth samples for ${symbol} yet. Check network access to the ${exchangeId} public depth API, then retry.`,
		};
	}

	const levelMenu = buildLiquidityDepthLevelMenu(profile, {levelCount});
	const summary = summarizeLiquidityDepthLevels(levelMenu, {
		symbol,
		warmingUp,
		sampleCount,
		windowSec,
	});

	const meta = buildOhlcvAnalysisMeta(bars, {
		title: data.title,
		toolResult: data.toolResult,
		liveMerge,
		ohlcvFingerprint: fingerprint,
	});

	return {
		ok: true,
		data: {
			analysis: {
				summary,
				interpretation: buildInterpretation(levelMenu, warmingUp),
				market: 'spot',
				exchangeId,
				symbol,
				mid: profile.mid ?? null,
				windowSec: profile.windowSec,
				sampleCount,
				warmingUp,
				levelMenu,
				profileBins: profile.bins,
			},
			meta,
		},
	};
}
