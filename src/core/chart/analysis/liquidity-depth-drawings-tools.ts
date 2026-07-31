import {z} from 'zod';
import type {SdkResult} from '../../result.js';
import {
	DEFAULT_DEPTH_AVERAGE_WINDOW_SEC,
	DEFAULT_DEPTH_EXCHANGE_ID,
	DEFAULT_DEPTH_LIMIT,
	DEFAULT_DEPTH_SAMPLE_INTERVAL_SEC,
	DepthExchangeIdSchema,
	ensureDepthSampler,
	fetchBinanceDepthSnapshot,
	fetchCoinbaseDepthSnapshot,
	getAveragedDepthProfile,
	ingestDepthSnapshot,
	inferDepthExchangeId,
	resolveBinanceDepthLimit,
	resolveCoinbaseDepthLimit,
	resolveDepthSymbol,
} from '../depth/index.js';
import {
	mergeLiquidityDepthProfileIntoOverlays,
	stripLiquidityDepthProfileFromOverlays,
} from '../liquidity-depth-profile-replay.js';
import type {ChartLiquidityDepthProfileOverlay} from '../overlay-schemas.js';
import {prepareChart} from '../prepare.js';
import {ChartPrepareReplaySchema, PrepareChartOutputSchema} from '../schemas.js';
import {ChartLiveBindingSchema} from '../live/schemas.js';
import {preprocessOhlcvToolInput} from './ohlcv-input.js';
import {prepareOhlcvBarsForAnalysis} from './ohlcv-live-merge.js';

const applyInputSchema = z
	.object({
		toolResult: z.unknown().optional(),
		rows: z.array(z.unknown()).min(1).optional(),
		title: z.string().trim().min(1).max(256).optional(),
		label: z.string().trim().min(1).max(128).optional(),
		ohlcvDigest: z.string().trim().min(1).max(512).optional(),
		symbol: z.string().trim().min(1).max(64).optional(),
		depthExchangeId: DepthExchangeIdSchema.optional(),
		depthSampleIntervalSec: z.number().int().min(5).max(300).optional(),
		depthAverageWindowSec: z.number().int().min(30).max(3_600).optional(),
		depthLimit: z.number().int().min(5).max(5_000).optional(),
		/** Bins from a prior analyze_liquidity_depth call (preferred when warm). */
		profileBins: z
			.array(
				z
					.object({
						priceLo: z.number(),
						priceHi: z.number(),
						bidSize: z.number().nonnegative(),
						askSize: z.number().nonnegative(),
						totalSize: z.number().nonnegative(),
					})
					.strict(),
			)
			.min(1)
			.max(2_000)
			.optional(),
		/** Strip left-axis depth profile from prepareReplay overlays and re-prepare. */
		removeDrawings: z.boolean().optional(),
		prepareReplay: ChartPrepareReplaySchema.optional(),
		live: ChartLiveBindingSchema.optional(),
		height: z.number().int().min(120).max(800).optional(),
		allowRowsOnly: z.boolean().optional(),
	})
	.strict();

export const ApplyLiquidityDepthDrawingsInputSchema = z.preprocess(
	preprocessOhlcvToolInput,
	applyInputSchema,
);

export const ApplyLiquidityDepthDrawingsOutputSchema = PrepareChartOutputSchema;

export async function applyLiquidityDepthDrawings(
	input: unknown,
): Promise<SdkResult<z.infer<typeof ApplyLiquidityDepthDrawingsOutputSchema>>> {
	const parsed = ApplyLiquidityDepthDrawingsInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.issues.map(i => i.message).join('; ')};
	}
	const data = parsed.data;
	const prepared = await prepareOhlcvBarsForAnalysis({
		...data,
		allowRowsOnly: Boolean(data.prepareReplay) || data.allowRowsOnly,
		mergeLive: false,
	});
	if (!prepared.ok) {
		return prepared;
	}
	const bars = prepared.data.bars;

	if (data.removeDrawings) {
		const overlays = stripLiquidityDepthProfileFromOverlays(data.prepareReplay?.overlays ?? []);
		return prepareChart({
			title: data.title?.trim() || 'Chart',
			...(data.label ? {label: data.label} : {}),
			...(data.height != null ? {height: data.height} : {}),
			bars,
			overlays,
			options: {
				...(data.prepareReplay?.skipDefaultOverlays ? {skipDefaultOverlays: true} : {}),
			},
		});
	}

	const exchangeId =
		data.depthExchangeId ??
		inferDepthExchangeId(data.toolResult) ??
		DEFAULT_DEPTH_EXCHANGE_ID;
	if (exchangeId !== 'binance' && exchangeId !== 'coinbase') {
		return {
			ok: false,
			reason: `Depth exchange "${exchangeId}" is not implemented. Use binance or coinbase.`,
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
			reason: 'Could not resolve spot symbol for liquidity depth profile overlay.',
		};
	}

	const sampleIntervalSec = data.depthSampleIntervalSec ?? DEFAULT_DEPTH_SAMPLE_INTERVAL_SEC;
	const windowSec = data.depthAverageWindowSec ?? DEFAULT_DEPTH_AVERAGE_WINDOW_SEC;
	const limit =
		exchangeId === 'coinbase'
			? resolveCoinbaseDepthLimit(data.depthLimit ?? DEFAULT_DEPTH_LIMIT)
			: resolveBinanceDepthLimit(data.depthLimit ?? DEFAULT_DEPTH_LIMIT);

	let bins = data.profileBins;
	let sampleCount: number | undefined;
	if (!bins?.length) {
		ensureDepthSampler({exchangeId, symbol}, {sampleIntervalSec, windowSec, limit});
		const fresh =
			exchangeId === 'coinbase'
				? await fetchCoinbaseDepthSnapshot({productId: symbol, limit})
				: await fetchBinanceDepthSnapshot({symbol, limit});
		if (fresh) {
			ingestDepthSnapshot({exchangeId, symbol}, fresh, {
				sampleIntervalSec,
				windowSec,
				limit,
			});
		}
		const profile = getAveragedDepthProfile({exchangeId, symbol});
		if (!profile?.bins.length) {
			return {
				ok: false,
				reason: `No averaged depth bins for ${symbol}. Run analyze_liquidity_depth first or wait for sampler warm-up.`,
			};
		}
		bins = profile.bins;
		sampleCount = profile.sampleCount;
	}

	const depthOverlay: ChartLiquidityDepthProfileOverlay = {
		type: 'liquidity_depth_profile',
		placement: 'left',
		exchangeId,
		symbol,
		windowSec,
		...(sampleCount != null ? {sampleCount} : {}),
		bins,
	};

	const overlays = mergeLiquidityDepthProfileIntoOverlays(
		data.prepareReplay?.overlays ?? [],
		depthOverlay,
	);

	const title =
		data.title?.trim() ||
		`${symbol} spot depth (${windowSec}s avg)`;

	return prepareChart({
		title,
		...(data.label ? {label: data.label} : {}),
		...(data.height != null ? {height: data.height} : {}),
		bars,
		overlays,
		options: {
			...(data.prepareReplay?.skipDefaultOverlays
				? {skipDefaultOverlays: true}
				: {}),
		},
	});
}
