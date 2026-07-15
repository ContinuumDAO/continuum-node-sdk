import type {TradeIdea} from './trade-idea.js';
import type {AnalysisTradeSetupKind, TradeSetupStatus} from './shared.js';
import {bollingerTradeIdeaContextFromSetup} from './bollinger-trade-setup.js';
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
	/** Trend structure: nearer swing target when exitPrice is impulse measured move. */
	swingTargetPrice?: number;
	targetPctFromEntry?: number;
	measuredMove?: TradeIdeaMeasuredMoveSummary;
	invalidationPrice?: number;
	invalidationLabel?: string;
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
	const pct =
		entryPrice != null &&
		exitPrice != null &&
		Number.isFinite(entryPrice) &&
		Number.isFinite(exitPrice)
			? targetPctFromEntry(entryPrice, exitPrice)
			: undefined;
	const bollingerFields = bollingerFieldsFromIdea(idea);
	const movingAveragesFields = movingAveragesFieldsFromIdea(idea);
	const chartData = idea.source.chartData;
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
		...(swingTargetPrice != null && Number.isFinite(swingTargetPrice)
			? {swingTargetPrice}
			: {}),
		...(pct != null ? {targetPctFromEntry: pct} : {}),
		...(measuredMove ? {measuredMove} : {}),
		...(idea.invalidation?.price != null
			? {
					invalidationPrice: idea.invalidation.price,
					...(idea.invalidation.label ? {invalidationLabel: idea.invalidation.label} : {}),
				}
			: {}),
		completeness: idea.completeness,
		...(idea.unclearReason ? {unclearReason: idea.unclearReason} : {}),
		createdAtSec: idea.createdAtSec,
		...bollingerFields,
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
