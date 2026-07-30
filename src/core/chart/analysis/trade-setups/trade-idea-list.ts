import type {TradeIdea} from './trade-idea.js';
import type {AnalysisTradeSetupKind, TradeSetupStatus} from './shared.js';
import {tradeLevelsLiquidationAndRatio} from './trade-ratio.js';
import {bollingerTradeIdeaContextFromSetup} from './bollinger-trade-setup.js';
import {donchianTradeIdeaContextFromSetup} from './donchian-trade-setup.js';
import {supertrendTradeIdeaContextFromSetup} from './supertrend-trade-setup.js';
import {ichimokuTradeIdeaContextFromSetup} from './ichimoku-trade-setup.js';
import {zScoreTradeIdeaContextFromSetup} from './z-score-trade-setup.js';
import {
	movingAveragesTradeIdeaContextFromSetup,
	type MovingAveragesTradeIdeaContext,
} from './moving-averages-trade-setup.js';

export type TradeIdeaMeasuredMoveSummary = {
	targetPrice: number;
	referencePrice?: number;
	direction?: 'up' | 'down';
	status?: string;
	formula?: string;
};

export type TradeIdeaListItem = {
	tradeIdeaNumber: number;
	id: string;
	analysisType: AnalysisTradeSetupKind | string;
	toolName: string;
	symbol?: string;
	status: TradeSetupStatus | string;
	side: string;
	confidence: number;
	entryPrice?: number;
	entryLabel?: string;
	exitPrice?: number;
	exitLabel?: string;
	/** One-line how the exit/target price was calculated (all ideas with a target). */
	targetBasis?: string;
	/** One-line how the invalidation/stop price was calculated (all ideas with invalidation). */
	invalidationBasis?: string;
	/** Trend structure: nearer swing target when exitPrice is impulse measured move. */
	swingTargetPrice?: number;
	targetPctFromEntry?: number;
	measuredMove?: TradeIdeaMeasuredMoveSummary;
	invalidationPrice?: number;
	invalidationLabel?: string;
	/** Analysis-time liquidation estimate (assumed leverage; perp venues only). */
	liquidationPrice?: number;
	/** Reward/risk using invalidation as risk distance. */
	tradeRatio?: number;
	assumedLeverage?: number;
	completeness?: string;
	unclearReason?: string;
	createdAtSec?: number;
	percentB?: number;
	bandWidth?: number;
	bandWidthPct?: number;
	invalidated?: boolean;
	setupPurposeCode?: string;
	entryProximityPct?: number;
	entryOffsetPct?: number;
	invalidationOffsetPct?: number;
	bollingerPeriod?: number;
	bollingerStdDev?: number;
	donchianPeriod?: number;
	donchianEntryMode?: string;
	supertrendPeriod?: number;
	supertrendMultiplier?: number;
	supertrendEntryMode?: string;
	ichimokuConversionPeriod?: number;
	ichimokuBasePeriod?: number;
	ichimokuSpanPeriod?: number;
	ichimokuDisplacement?: number;
	ichimokuStrategy?: string;
	tkState?: string;
	cloudPosition?: string;
	zScorePeriod?: number;
	zScoreEntry?: number;
	zScoreExit?: number;
	tradeSummary?: string;
	strategy?: string;
	crossoverLabel?: string;
	proximityType?: string;
	fastPeriod?: number;
	slowPeriod?: number;
	maType?: string;
	barsSinceCrossover?: number | null;
	chartDataSource?: string;
	chartInterval?: string;
	chartBarCount?: number;
};

export function targetPctFromEntry(entry: number, target: number): number | undefined {
	if (!Number.isFinite(entry) || !Number.isFinite(target) || entry === 0) {
		return undefined;
	}
	return ((target - entry) / entry) * 100;
}

function bollingerFieldsFromIdea(idea: TradeIdea): Partial<TradeIdeaListItem> {
	const ctx =
		idea.bollingerContext ??
		(idea.analysisSetup.kind === 'bollinger_bands'
			? bollingerTradeIdeaContextFromSetup(idea.analysisSetup.setup)
			: undefined);
	if (!ctx) {
		return {};
	}
	return {
		percentB: ctx.percentB,
		bandWidth: ctx.bandWidth,
		...(ctx.bandWidthPct != null ? {bandWidthPct: ctx.bandWidthPct} : {}),
		invalidated: ctx.invalidated,
		setupPurposeCode: ctx.setupPurposeCode,
		entryProximityPct: ctx.entryProximityPct,
		entryOffsetPct: ctx.entryOffsetPct,
		invalidationOffsetPct: ctx.invalidationOffsetPct,
		bollingerPeriod: ctx.period,
		bollingerStdDev: ctx.stdDev,
	};
}

function donchianFieldsFromIdea(idea: TradeIdea): Partial<TradeIdeaListItem> {
	const ctx =
		idea.donchianContext ??
		(idea.analysisSetup.kind === 'donchian_breakout'
			? donchianTradeIdeaContextFromSetup(idea.analysisSetup.setup)
			: undefined);
	if (!ctx) {
		return {};
	}
	return {
		invalidated: ctx.invalidated,
		setupPurposeCode: ctx.setupPurposeCode,
		entryProximityPct: ctx.entryProximityPct,
		entryOffsetPct: ctx.entryOffsetPct,
		invalidationOffsetPct: ctx.invalidationOffsetPct,
		donchianPeriod: ctx.period,
		donchianEntryMode: ctx.entryMode,
	};
}

function supertrendFieldsFromIdea(idea: TradeIdea): Partial<TradeIdeaListItem> {
	const ctx =
		idea.supertrendContext ??
		(idea.analysisSetup.kind === 'supertrend'
			? supertrendTradeIdeaContextFromSetup(idea.analysisSetup.setup)
			: undefined);
	if (!ctx) {
		return {};
	}
	return {
		invalidated: ctx.invalidated,
		setupPurposeCode: ctx.setupPurposeCode,
		entryProximityPct: ctx.entryProximityPct,
		entryOffsetPct: ctx.entryOffsetPct,
		invalidationOffsetPct: ctx.invalidationOffsetPct,
		supertrendPeriod: ctx.period,
		supertrendMultiplier: ctx.multiplier,
		supertrendEntryMode: ctx.entryMode,
	};
}

function ichimokuFieldsFromIdea(idea: TradeIdea): Partial<TradeIdeaListItem> {
	const ctx =
		idea.ichimokuContext ??
		(idea.analysisSetup.kind === 'ichimoku'
			? ichimokuTradeIdeaContextFromSetup(idea.analysisSetup.setup)
			: undefined);
	if (!ctx) {
		return {};
	}
	return {
		setupPurposeCode: ctx.setupPurposeCode,
		entryProximityPct: ctx.entryProximityPct,
		entryOffsetPct: ctx.entryOffsetPct,
		invalidationOffsetPct: ctx.invalidationOffsetPct,
		ichimokuConversionPeriod: ctx.conversionPeriod,
		ichimokuBasePeriod: ctx.basePeriod,
		ichimokuSpanPeriod: ctx.spanPeriod,
		ichimokuDisplacement: ctx.displacement,
		ichimokuStrategy: ctx.strategy,
		tkState: ctx.tkState,
		cloudPosition: ctx.cloudPosition,
	};
}

function zScoreFieldsFromIdea(idea: TradeIdea): Partial<TradeIdeaListItem> {
	const ctx =
		idea.zScoreContext ??
		(idea.analysisSetup.kind === 'z_score'
			? zScoreTradeIdeaContextFromSetup(idea.analysisSetup.setup)
			: undefined);
	if (!ctx) {
		return {};
	}
	return {
		invalidated: ctx.invalidated,
		setupPurposeCode: ctx.setupPurposeCode,
		entryOffsetPct: ctx.entryOffsetPct,
		invalidationOffsetPct: ctx.invalidationOffsetPct,
		zScorePeriod: ctx.period,
		zScoreEntry: ctx.entryZ,
		zScoreExit: ctx.exitZ,
	};
}

function movingAveragesFieldsFromIdea(idea: TradeIdea): Partial<TradeIdeaListItem> {
	const ctx: MovingAveragesTradeIdeaContext | undefined =
		idea.analysisSetup.kind === 'moving_averages'
			? movingAveragesTradeIdeaContextFromSetup(idea.analysisSetup.setup)
			: undefined;
	if (!ctx) {
		return {};
	}
	return {
		tradeSummary: ctx.tradeSummary,
		strategy: ctx.strategy,
		crossoverLabel: ctx.crossoverLabel,
		proximityType: ctx.proximityType,
		fastPeriod: ctx.fastPeriod,
		slowPeriod: ctx.slowPeriod,
		maType: ctx.maType,
		barsSinceCrossover: ctx.barsSinceCrossover,
		setupPurposeCode: ctx.setupPurposeCode,
	};
}

function measuredMoveFromSetup(idea: TradeIdea): TradeIdeaMeasuredMoveSummary | undefined {
	const setup = idea.analysisSetup?.setup;
	if (!setup || typeof setup !== 'object') {
		return undefined;
	}
	const raw = setup as Record<string, unknown>;
	const nested = raw.measuredMove;
	if (nested && typeof nested === 'object') {
		const mm = nested as Record<string, unknown>;
		const targetPrice =
			typeof mm.targetPrice === 'number' && Number.isFinite(mm.targetPrice)
				? mm.targetPrice
				: undefined;
		if (targetPrice == null) {
			return undefined;
		}
		return {
			targetPrice,
			referencePrice:
				typeof mm.referencePrice === 'number' && Number.isFinite(mm.referencePrice)
					? mm.referencePrice
					: idea.entry?.price,
			direction:
				mm.direction === 'up' || mm.direction === 'down' ? mm.direction : undefined,
			status: typeof mm.status === 'string' ? mm.status : undefined,
			formula: typeof mm.formula === 'string' ? mm.formula : undefined,
		};
	}
	if (idea.analysisSetup.kind === 'trend_structure') {
		return undefined;
	}
	const targetPrice =
		typeof raw.targetPrice === 'number' && Number.isFinite(raw.targetPrice)
			? raw.targetPrice
			: idea.target?.price;
	if (targetPrice == null || !Number.isFinite(targetPrice)) {
		return undefined;
	}
	const referencePrice =
		typeof raw.referencePrice === 'number' && Number.isFinite(raw.referencePrice)
			? raw.referencePrice
			: idea.entry?.price;
	return {
		targetPrice,
		referencePrice,
		direction:
			raw.targetDirection === 'up' || raw.targetDirection === 'down'
				? raw.targetDirection
				: undefined,
		status: typeof raw.targetStatus === 'string' ? raw.targetStatus : undefined,
		formula: typeof raw.targetFormula === 'string' ? raw.targetFormula : undefined,
	};
}

const DEFAULT_TARGET_BASIS_BY_KIND: Partial<Record<AnalysisTradeSetupKind, string>> = {
	chart_pattern: 'measured move (pattern height from break side)',
	candlestick: 'pattern-implied follow-through',
	key_levels: 'next key level in trade direction',
	key_level_fibonacci: 'Fib retrace / range-leg target',
	momentum: 'momentum continuation target',
	divergence: 'measured move (swing size from entry)',
	trend_structure: 'impulse measured move (entry ± prior swing)',
	elliott_waves: 'Elliott wave Fibonacci projection',
	range_volatility: 'range midpoint (~50% of range)',
	bollinger_bands: 'opposite Bollinger band',
	donchian_breakout: 'entry ± N× ATR',
	supertrend: 'entry ± N× ATR',
	ichimoku: 'entry ± N× ATR',
	z_score: 'mean-reversion to exit Z on the SMA band',
	moving_averages: 'fast MA level',
	time_series_trend: 'time-series trend target',
	time_series_momentum: 'time-series momentum target',
	time_series_stats: 'time-series stats target',
};

const DEFAULT_INVALIDATION_BASIS_BY_KIND: Partial<Record<AnalysisTradeSetupKind, string>> = {
	chart_pattern: 'opposite pattern boundary (pattern fail)',
	candlestick: 'candlestick signal failure',
	key_levels: 'protective key level / level break',
	key_level_fibonacci: 'Fib range extreme break',
	momentum: 'momentum thesis failure',
	divergence: 'beyond divergence swing extreme',
	trend_structure: 'recent swing against the trade',
	elliott_waves: 'wave invalidation level',
	range_volatility: 'range bound break (high/low)',
	bollinger_bands: 'breach of entry-side Bollinger band',
	donchian_breakout: 'Donchian mid-channel',
	supertrend: 'Supertrend trail cross',
	ichimoku: 'cloud / kijun boundary',
	z_score: 'N× ATR stop from entry',
	moving_averages: 'slow MA breach',
	time_series_trend: 'time-series trend invalidation',
	time_series_momentum: 'time-series momentum invalidation',
	time_series_stats: 'time-series stats invalidation',
};

function setupStringField(setup: unknown, key: string): string | undefined {
	if (!setup || typeof setup !== 'object') {
		return undefined;
	}
	const value = (setup as Record<string, unknown>)[key];
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function formatBasis(
	prefix: 'Target' | 'Invalidation',
	detail: string | undefined,
	fallback: string | undefined,
): string {
	const text = detail?.trim() || fallback?.trim() || 'analysis-derived level';
	return `${prefix}: ${text}`;
}

/** Brief one-line explanation of how the trade idea target was calculated. */
export function targetBasisFromIdea(
	idea: TradeIdea,
	options?: {
		exitPrice?: number;
		exitLabel?: string;
		measuredMove?: TradeIdeaMeasuredMoveSummary;
	},
): string | undefined {
	const exitPrice =
		options?.exitPrice ?? idea.target?.price ?? options?.measuredMove?.targetPrice;
	if (exitPrice == null || !Number.isFinite(exitPrice)) {
		return undefined;
	}
	const measuredMove = options?.measuredMove;
	const formula =
		measuredMove?.formula?.trim() ||
		setupStringField(idea.analysisSetup?.setup, 'targetFormula');
	if (formula) {
		return formatBasis('Target', formula, undefined);
	}
	const targetLabel = setupStringField(idea.analysisSetup?.setup, 'targetLabel');
	const targetSource = setupStringField(idea.analysisSetup?.setup, 'targetSource');
	if (targetLabel && targetSource) {
		return formatBasis(
			'Target',
			`${targetLabel} (${targetSource.replace(/_/g, ' ')})`,
			undefined,
		);
	}
	if (targetLabel) {
		return formatBasis('Target', targetLabel, undefined);
	}
	const label = (options?.exitLabel ?? idea.target?.label)?.trim();
	if (label && label.toLowerCase() !== 'target') {
		return formatBasis('Target', label, undefined);
	}
	return formatBasis(
		'Target',
		undefined,
		DEFAULT_TARGET_BASIS_BY_KIND[idea.source.analysisType],
	);
}

/** Brief one-line explanation of how the trade idea invalidation was calculated. */
export function invalidationBasisFromIdea(idea: TradeIdea): string | undefined {
	const invalidationPrice = idea.invalidation?.price;
	if (invalidationPrice == null || !Number.isFinite(invalidationPrice)) {
		return undefined;
	}
	const invalidationLabel =
		setupStringField(idea.analysisSetup?.setup, 'invalidationLabel') ||
		idea.invalidation?.label?.trim();
	if (invalidationLabel && invalidationLabel.toLowerCase() !== 'invalidation') {
		return formatBasis('Invalidation', invalidationLabel, undefined);
	}
	return formatBasis(
		'Invalidation',
		undefined,
		DEFAULT_INVALIDATION_BASIS_BY_KIND[idea.source.analysisType],
	);
}

export function tradeIdeaToListItem(idea: TradeIdea, tradeIdeaNumber: number): TradeIdeaListItem {
	const entryPrice = idea.entry?.price;
	const measuredMove = measuredMoveFromSetup(idea);
	const swingTargetPrice =
		idea.source.analysisType === 'trend_structure' ? idea.target?.price : undefined;
	const exitPrice =
		idea.source.analysisType === 'trend_structure' &&
		measuredMove?.targetPrice != null &&
		Number.isFinite(measuredMove.targetPrice)
			? measuredMove.targetPrice
			: idea.target?.price;
	const exitLabel =
		idea.source.analysisType === 'trend_structure' &&
		measuredMove?.targetPrice != null &&
		Number.isFinite(measuredMove.targetPrice)
			? 'impulse measured move'
			: idea.target?.label ?? 'target';
	const targetBasis = targetBasisFromIdea(idea, {
		exitPrice,
		exitLabel,
		measuredMove,
	});
	const invalidationBasis = invalidationBasisFromIdea(idea);
	const pct =
		entryPrice != null &&
		exitPrice != null &&
		Number.isFinite(entryPrice) &&
		Number.isFinite(exitPrice)
			? targetPctFromEntry(entryPrice, exitPrice)
			: undefined;
	const bollingerFields = bollingerFieldsFromIdea(idea);
	const donchianFields = donchianFieldsFromIdea(idea);
	const supertrendFields = supertrendFieldsFromIdea(idea);
	const ichimokuFields = ichimokuFieldsFromIdea(idea);
	const zScoreFields = zScoreFieldsFromIdea(idea);
	const movingAveragesFields = movingAveragesFieldsFromIdea(idea);
	const chartData = idea.source.chartData;
	const invalidationPriceForRatio =
		idea.invalidation?.price != null && Number.isFinite(idea.invalidation.price)
			? idea.invalidation.price
			: undefined;
	const ratioFields =
		(idea.side === 'long' || idea.side === 'short') &&
		entryPrice != null &&
		exitPrice != null &&
		invalidationPriceForRatio != null &&
		Number.isFinite(entryPrice) &&
		Number.isFinite(exitPrice)
			? tradeLevelsLiquidationAndRatio({
					side: idea.side,
					entry: entryPrice,
					target: exitPrice,
					invalidation: invalidationPriceForRatio,
					leverage: idea.assumedLeverage,
					protocolId: idea.protocolId,
					chartDataSource: idea.source.chartData?.dataSource,
				})
			: undefined;
	return {
		tradeIdeaNumber,
		id: idea.id,
		analysisType: idea.source.analysisType,
		toolName: idea.source.toolName,
		...(idea.symbol ? {symbol: idea.symbol} : {}),
		status: idea.status,
		side: idea.side,
		confidence: idea.confidence,
		...(entryPrice != null ? {entryPrice} : {}),
		...(idea.entry?.label ? {entryLabel: idea.entry.label} : {}),
		...(exitPrice != null ? {exitPrice, exitLabel} : {}),
		...(targetBasis ? {targetBasis} : {}),
		...(swingTargetPrice != null && Number.isFinite(swingTargetPrice)
			? {swingTargetPrice}
			: {}),
		...(pct != null ? {targetPctFromEntry: pct} : {}),
		...(measuredMove ? {measuredMove} : {}),
		...(idea.invalidation?.price != null
			? {
					invalidationPrice: idea.invalidation.price,
					...(idea.invalidation.label ? {invalidationLabel: idea.invalidation.label} : {}),
					...(invalidationBasis ? {invalidationBasis} : {}),
				}
			: {}),
		...(ratioFields?.liquidationPrice != null
			? {liquidationPrice: ratioFields.liquidationPrice}
			: idea.liquidationPrice != null && Number.isFinite(idea.liquidationPrice)
				? {liquidationPrice: idea.liquidationPrice}
				: {}),
		...(ratioFields?.tradeRatio != null
			? {tradeRatio: ratioFields.tradeRatio}
			: idea.tradeRatio != null && Number.isFinite(idea.tradeRatio)
				? {tradeRatio: idea.tradeRatio}
				: {}),
		...(ratioFields?.assumedLeverage != null
			? {assumedLeverage: ratioFields.assumedLeverage}
			: idea.assumedLeverage != null && Number.isFinite(idea.assumedLeverage)
				? {assumedLeverage: idea.assumedLeverage}
				: {}),
		completeness: idea.completeness,
		...(idea.unclearReason ? {unclearReason: idea.unclearReason} : {}),
		createdAtSec: idea.createdAtSec,
		...bollingerFields,
		...donchianFields,
		...supertrendFields,
		...ichimokuFields,
		...zScoreFields,
		...movingAveragesFields,
		...(chartData?.dataSource ? {chartDataSource: chartData.dataSource} : {}),
		...(chartData?.interval ? {chartInterval: chartData.interval} : {}),
		...(chartData?.barCount != null && chartData.barCount > 0
			? {chartBarCount: chartData.barCount}
			: {}),
	};
}

export function sortTradeIdeasForMenu(ideas: TradeIdea[]): TradeIdea[] {
	return [...ideas].sort((a, b) => {
		const dt = (b.createdAtSec ?? 0) - (a.createdAtSec ?? 0);
		if (dt !== 0) {
			return dt;
		}
		return a.source.analysisType.localeCompare(b.source.analysisType);
	});
}

export type ListTradeIdeasInput = {
	tradeIdeas?: TradeIdea[];
	status?: TradeSetupStatus;
	analysisType?: AnalysisTradeSetupKind;
};

export type ListTradeIdeasOutput = {
	title: string;
	summary: string;
	items: TradeIdeaListItem[];
	count: number;
};

export function listTradeIdeasFromRegistry(input: ListTradeIdeasInput): ListTradeIdeasOutput {
	const raw = input.tradeIdeas ?? [];
	let filtered = raw;
	if (input.status) {
		filtered = filtered.filter(item => item.status === input.status);
	}
	if (input.analysisType) {
		filtered = filtered.filter(item => item.source.analysisType === input.analysisType);
	}
	const sorted = sortTradeIdeasForMenu(filtered);
	const items = sorted.map((idea, index) => tradeIdeaToListItem(idea, index + 1));
	const clearCount = items.filter(item => item.status === 'clear').length;
	const summary =
		items.length === 0
			? 'No trade ideas on this chart dataset yet — run analyze_* tools first.'
			: `${items.length} trade idea(s) from current analyses (${clearCount} clear). Pick #N in the UI or pass tradeIdeaId to build_trade_from_* tools.`;
	return {
		title: 'Trade ideas',
		summary,
		items,
		count: items.length,
	};
}
