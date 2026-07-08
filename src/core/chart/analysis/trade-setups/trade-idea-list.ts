import type {TradeIdea} from './trade-idea.js';
import type {AnalysisTradeSetupKind, TradeSetupStatus} from './shared.js';

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
	entryPrice: number;
	entryLabel?: string;
	exitPrice?: number;
	exitLabel?: string;
	targetPctFromEntry?: number;
	measuredMove?: TradeIdeaMeasuredMoveSummary;
	invalidationPrice?: number;
	invalidationLabel?: string;
	completeness?: string;
	unclearReason?: string;
	createdAtSec?: number;
};

export function targetPctFromEntry(entry: number, target: number): number | undefined {
	if (!Number.isFinite(entry) || !Number.isFinite(target) || entry === 0) {
		return undefined;
	}
	return ((target - entry) / entry) * 100;
}

function measuredMoveFromSetup(idea: TradeIdea): TradeIdeaMeasuredMoveSummary | undefined {
	const setup = idea.analysisSetup?.setup;
	if (!setup || typeof setup !== 'object') {
		return undefined;
	}
	const raw = setup as Record<string, unknown>;
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
			: idea.entry.price;
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
	const entryPrice = idea.entry.price;
	const exitPrice = idea.target?.price;
	const pct =
		exitPrice != null && Number.isFinite(exitPrice)
			? targetPctFromEntry(entryPrice, exitPrice)
			: undefined;
	const measuredMove = measuredMoveFromSetup(idea);
	return {
		tradeIdeaNumber,
		id: idea.id,
		analysisType: idea.source.analysisType,
		toolName: idea.source.toolName,
		...(idea.symbol ? {symbol: idea.symbol} : {}),
		status: idea.status,
		side: idea.side,
		confidence: idea.confidence,
		entryPrice,
		...(idea.entry.label ? {entryLabel: idea.entry.label} : {}),
		...(exitPrice != null ? {exitPrice, exitLabel: idea.target?.label ?? 'target'} : {}),
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
