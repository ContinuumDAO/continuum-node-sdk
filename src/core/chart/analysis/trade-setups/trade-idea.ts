import {randomUUID} from 'node:crypto';
import type {OhlcvAnalysisMeta} from '../analysis-meta.js';
import type {ChartPatternTradeSetup} from './chart-pattern-trade-setup.js';
import {normalizeChartPatternTradeSetup} from './chart-pattern-trade-setup.js';
import type {CandlestickTradeSetup} from './candlestick-trade-setup.js';
import {normalizeCandlestickTradeSetup} from './candlestick-trade-setup.js';
import type {KeyLevelsTradeSetup} from './key-levels-trade-setup.js';
import {normalizeKeyLevelsTradeSetup} from './key-levels-trade-setup.js';
import type {MomentumTradeSetup} from './momentum-trade-setup.js';
import {normalizeMomentumTradeSetup} from './momentum-trade-setup.js';
import {
	ANALYZE_TOOL_SETUP_FIELDS,
	type AnalysisTradeSetupKind,
	type NormalizedTradeLevel,
	type TradeIdeaCompleteness,
	type TradeSetupSide,
	type TradeSetupStatus,
	deriveCompleteness,
	toolNameForAnalysisKind,
} from './shared.js';

export type AnalysisTradeSetup =
	| {kind: 'chart_pattern'; setup: ChartPatternTradeSetup}
	| {kind: 'candlestick'; setup: CandlestickTradeSetup}
	| {kind: 'key_levels'; setup: KeyLevelsTradeSetup}
	| {kind: 'momentum'; setup: MomentumTradeSetup};

export type TradeIdeaSource = {
	analysisType: AnalysisTradeSetupKind;
	toolName: string;
	stepId?: string;
	taskId?: string;
};

export type TradeIdea = {
	id: string;
	source: TradeIdeaSource;
	protocolId?: string;
	symbol?: string;
	status: TradeSetupStatus;
	completeness: TradeIdeaCompleteness;
	side: TradeSetupSide;
	confidence: number;
	lastClose: number;
	entry: NormalizedTradeLevel;
	target?: NormalizedTradeLevel;
	invalidation?: NormalizedTradeLevel;
	analysisSetup: AnalysisTradeSetup;
	unclearReason?: string;
	createdAtSec: number;
};

export type TradeIdeaMeta = {
	id?: string;
	toolName?: string;
	stepId?: string;
	taskId?: string;
	protocolId?: string;
	symbol?: string;
	createdAtSec?: number;
};

function normalizeFromSetup(setup: AnalysisTradeSetup): {
	status: TradeSetupStatus;
	side: TradeSetupSide;
	confidence: number;
	lastClose: number;
	entry: NormalizedTradeLevel;
	target?: NormalizedTradeLevel;
	invalidation?: NormalizedTradeLevel;
	unclearReason?: string;
	completeness: TradeIdeaCompleteness;
} {
	let raw:
		| ReturnType<typeof normalizeChartPatternTradeSetup>
		| ReturnType<typeof normalizeCandlestickTradeSetup>
		| ReturnType<typeof normalizeKeyLevelsTradeSetup>
		| ReturnType<typeof normalizeMomentumTradeSetup>;
	switch (setup.kind) {
		case 'chart_pattern':
			raw = normalizeChartPatternTradeSetup(setup.setup);
			break;
		case 'candlestick':
			raw = normalizeCandlestickTradeSetup(setup.setup);
			break;
		case 'key_levels':
			raw = normalizeKeyLevelsTradeSetup(setup.setup);
			break;
		case 'momentum':
			raw = normalizeMomentumTradeSetup(setup.setup);
			break;
		default:
			throw new Error(`Unsupported analysis setup kind: ${(setup as AnalysisTradeSetup).kind}`);
	}
	const entry = raw.entry ?? {price: raw.lastClose, label: 'last close'};
	const completeness = deriveCompleteness({
		entry,
		target: 'target' in raw ? raw.target : undefined,
		invalidation: 'invalidation' in raw ? raw.invalidation : undefined,
	});
	return {
		status: raw.status,
		side: raw.side,
		confidence: raw.confidence,
		lastClose: raw.lastClose,
		entry,
		target: 'target' in raw ? raw.target : undefined,
		invalidation: 'invalidation' in raw ? raw.invalidation : undefined,
		unclearReason: raw.unclearReason,
		completeness,
	};
}

export function symbolFromOhlcvMeta(meta?: Pick<OhlcvAnalysisMeta, 'title' | 'fetchContext'>): string | undefined {
	const coin = meta?.fetchContext?.coin;
	if (typeof coin === 'string' && coin.trim()) {
		return coin.trim().toUpperCase();
	}
	const title = meta?.title?.trim();
	if (!title) {
		return undefined;
	}
	const head = title.split(/[\s/—-]+/)[0]?.trim();
	return head ? head.toUpperCase() : undefined;
}

export function wrapAnalysisTradeSetup(
	setup: AnalysisTradeSetup,
	meta: TradeIdeaMeta = {},
): TradeIdea {
	const normalized = normalizeFromSetup(setup);
	const analysisType = setup.kind;
	return {
		id: meta.id ?? randomUUID(),
		source: {
			analysisType,
			toolName: meta.toolName ?? toolNameForAnalysisKind(analysisType),
			...(meta.stepId ? {stepId: meta.stepId} : {}),
			...(meta.taskId ? {taskId: meta.taskId} : {}),
		},
		...(meta.protocolId ? {protocolId: meta.protocolId} : {}),
		...(meta.symbol ? {symbol: meta.symbol} : {}),
		status: normalized.status,
		completeness: normalized.completeness,
		side: normalized.side,
		confidence: normalized.confidence,
		lastClose: normalized.lastClose,
		entry: normalized.entry,
		...(normalized.target ? {target: normalized.target} : {}),
		...(normalized.invalidation ? {invalidation: normalized.invalidation} : {}),
		analysisSetup: setup,
		...(normalized.unclearReason ? {unclearReason: normalized.unclearReason} : {}),
		createdAtSec: meta.createdAtSec ?? Math.floor(Date.now() / 1000),
	};
}

export function tradeIdeaFromAnalyzeOutput(
	toolName: string,
	analysis: Record<string, unknown> | null | undefined,
	meta?: TradeIdeaMeta,
): TradeIdea | null {
	const setup = extractAnalysisTradeSetup(toolName, analysis);
	if (!setup) {
		return null;
	}
	return wrapAnalysisTradeSetup(setup, {
		...meta,
		toolName: meta?.toolName ?? toolName,
	});
}

export function extractAnalysisTradeSetup(
	toolName: string,
	analysis: Record<string, unknown> | null | undefined,
): AnalysisTradeSetup | null {
	if (!analysis) {
		return null;
	}
	const baseTool = toolName.replace(/^.*__/, '');
	const mapping = ANALYZE_TOOL_SETUP_FIELDS[baseTool];
	if (!mapping) {
		return null;
	}
	const raw = analysis[mapping.field];
	if (!raw || typeof raw !== 'object') {
		return null;
	}
	return {kind: mapping.kind, setup: raw} as AnalysisTradeSetup;
}

export function extractTradeSetupFromAnalyzeOutput(
	toolName: string,
	analysis: Record<string, unknown> | null | undefined,
): AnalysisTradeSetup | null {
	return extractAnalysisTradeSetup(toolName, analysis);
}

export function tradeIdeasUpsertKey(idea: TradeIdea): string {
	const symbol = idea.symbol ?? '';
	const step = idea.source.stepId ?? '';
	const task = idea.source.taskId ?? '';
	return `${idea.source.analysisType}|${step}|${task}|${symbol}`;
}

export function upsertTradeIdeas(existing: TradeIdea[], next: TradeIdea): TradeIdea[] {
	const key = tradeIdeasUpsertKey(next);
	const out = existing.filter(item => tradeIdeasUpsertKey(item) !== key);
	out.push(next);
	return out;
}

export function findTradeIdeaById(ideas: TradeIdea[], id: string): TradeIdea | undefined {
	return ideas.find(item => item.id === id);
}

export function findNewestClearTradeIdea(
	ideas: TradeIdea[],
	analysisType?: AnalysisTradeSetupKind,
): TradeIdea | undefined {
	const filtered = ideas.filter(
		item =>
			item.status === 'clear' &&
			(analysisType == null || item.source.analysisType === analysisType),
	);
	return filtered.sort((a, b) => b.createdAtSec - a.createdAtSec)[0];
}

export function migrateLastTradeSetupToTradeIdeas(
	lastTradeSetup: Record<string, unknown> | null | undefined,
): TradeIdea[] {
	if (!lastTradeSetup || typeof lastTradeSetup !== 'object') {
		return [];
	}
	const setup = {kind: 'chart_pattern' as const, setup: lastTradeSetup as ChartPatternTradeSetup};
	return [
		wrapAnalysisTradeSetup(setup, {
			toolName: 'analyze_chart_patterns',
		}),
	];
}
