import {randomUUID} from 'node:crypto';
import type {OhlcvAnalysisMeta} from '../analysis-meta.js';
import type {ChartPatternTradeSetup} from './chart-pattern-trade-setup.js';
import {normalizeChartPatternTradeSetup} from './chart-pattern-trade-setup.js';
import type {CandlestickTradeSetup} from './candlestick-trade-setup.js';
import {normalizeCandlestickTradeSetup} from './candlestick-trade-setup.js';
import type {KeyLevelFibRetraceTradeSetup} from './key-level-fib-retrace-trade-setup.js';
import {applyKeyLevelFibSideVariant} from './key-level-fib-retrace-trade-setup.js';
import type {KeyLevelsTradeSetup} from './key-levels-trade-setup.js';
import {normalizeKeyLevelsTradeSetup} from './key-levels-trade-setup.js';
import type {MomentumTradeSetup} from './momentum-trade-setup.js';
import {normalizeMomentumTradeSetup} from './momentum-trade-setup.js';
import type {RangeVolatilityTradeSetup} from './range-volatility-trade-setup.js';
import {normalizeRangeVolatilityTradeSetup} from './range-volatility-trade-setup.js';
import type {BollingerTradeSetup} from './bollinger-trade-setup.js';
import {bollingerTradeIdeaContextFromSetup, normalizeBollingerTradeSetup} from './bollinger-trade-setup.js';
import type {BollingerTradeIdeaContext} from './bollinger-trade-setup.js';
import type {MovingAveragesTradeSetup} from './moving-averages-trade-setup.js';
import {
	movingAveragesTradeIdeaContextFromSetup,
	normalizeMovingAveragesTradeSetup,
} from './moving-averages-trade-setup.js';
import type {MovingAveragesTradeIdeaContext} from './moving-averages-trade-setup.js';
import type {TrendStructureTradeSetup} from './trend-structure-trade-setup.js';
import {normalizeTrendStructureTradeSetup} from './trend-structure-trade-setup.js';
import {
	extractTradeSetupSelection,
	type TradeSetupSelection,
} from './trade-setup-selection.js';
import {chartDataPurposeContextFromAnalysisMeta, type TradeChartDataPurposeContext} from './chart-data-purpose.js';
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
	| {kind: 'key_level_fibonacci'; setup: KeyLevelFibRetraceTradeSetup}
	| {kind: 'momentum'; setup: MomentumTradeSetup}
	| {kind: 'range_volatility'; setup: RangeVolatilityTradeSetup}
	| {kind: 'bollinger_bands'; setup: BollingerTradeSetup}
	| {kind: 'moving_averages'; setup: MovingAveragesTradeSetup}
	| {kind: 'trend_structure'; setup: TrendStructureTradeSetup};

export type TradeIdeaSource = {
	analysisType: AnalysisTradeSetupKind;
	toolName: string;
	stepId?: string;
	taskId?: string;
	chartData?: TradeChartDataPurposeContext;
};

export type TradeIdeaBollingerContext = BollingerTradeIdeaContext;

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
	entry?: NormalizedTradeLevel;
	target?: NormalizedTradeLevel;
	invalidation?: NormalizedTradeLevel;
	analysisSetup: AnalysisTradeSetup;
	/** Menu row / geometry identity used for this idea — re-bind on re-analyze via analyzeArgsFromTradeSetupSelection. */
	tradeSetupSelection?: TradeSetupSelection;
	bollingerContext?: TradeIdeaBollingerContext;
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
	ohlcvMeta?: Pick<OhlcvAnalysisMeta, 'barCount' | 'fetchContext'>;
	fetchPayload?: unknown;
	fetchToolName?: string;
	loadedProtocolId?: string;
};

function normalizeKeyLevelFibTradeSetup(setup: KeyLevelFibRetraceTradeSetup) {
	return {
		status: setup.status,
		side: setup.side,
		confidence: setup.confidence,
		lastClose: setup.lastClose,
		entry: {price: setup.entryPrice, label: setup.entryLabel},
		...(setup.targetPrice != null && Number.isFinite(setup.targetPrice)
			? {target: {price: setup.targetPrice, label: setup.targetLabel}}
			: {}),
		...(setup.invalidationPrice != null && Number.isFinite(setup.invalidationPrice)
			? {invalidation: {price: setup.invalidationPrice, label: setup.invalidationLabel}}
			: {}),
		...(setup.unclearReason ? {unclearReason: setup.unclearReason} : {}),
	};
}

function normalizeFromSetup(setup: AnalysisTradeSetup): {
	status: TradeSetupStatus;
	side: TradeSetupSide;
	confidence: number;
	lastClose: number;
	entry?: NormalizedTradeLevel;
	target?: NormalizedTradeLevel;
	invalidation?: NormalizedTradeLevel;
	unclearReason?: string;
	completeness: TradeIdeaCompleteness;
} {
	let raw:
		| ReturnType<typeof normalizeChartPatternTradeSetup>
		| ReturnType<typeof normalizeCandlestickTradeSetup>
		| ReturnType<typeof normalizeKeyLevelsTradeSetup>
		| ReturnType<typeof normalizeKeyLevelFibTradeSetup>
		| ReturnType<typeof normalizeMomentumTradeSetup>
		| ReturnType<typeof normalizeRangeVolatilityTradeSetup>
		| ReturnType<typeof normalizeBollingerTradeSetup>
		| ReturnType<typeof normalizeMovingAveragesTradeSetup>
		| ReturnType<typeof normalizeTrendStructureTradeSetup>;
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
		case 'key_level_fibonacci':
			raw = normalizeKeyLevelFibTradeSetup(setup.setup);
			break;
		case 'momentum':
			raw = normalizeMomentumTradeSetup(setup.setup);
			break;
		case 'range_volatility':
			raw = normalizeRangeVolatilityTradeSetup(setup.setup);
			break;
		case 'bollinger_bands':
			raw = normalizeBollingerTradeSetup(setup.setup);
			break;
		case 'moving_averages':
			raw = normalizeMovingAveragesTradeSetup(setup.setup);
			break;
		case 'trend_structure':
			raw = normalizeTrendStructureTradeSetup(setup.setup);
			break;
		default:
			throw new Error(`Unsupported analysis setup kind: ${(setup as AnalysisTradeSetup).kind}`);
	}
	const entry =
		raw.entry ??
		(raw.status !== 'unclear' ? {price: raw.lastClose, label: 'last close'} : undefined);
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
		...(entry ? {entry} : {}),
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
	const bollingerContext =
		setup.kind === 'bollinger_bands'
			? bollingerTradeIdeaContextFromSetup(setup.setup)
			: undefined;
	const tradeSetupSelection = extractTradeSetupSelection(setup);
	const chartData = chartDataPurposeContextFromAnalysisMeta(
		meta.ohlcvMeta,
		meta.fetchPayload,
		meta.fetchToolName,
		meta.loadedProtocolId,
	);
	return {
		id: meta.id ?? randomUUID(),
		source: {
			analysisType,
			toolName: meta.toolName ?? toolNameForAnalysisKind(analysisType),
			...(meta.stepId ? {stepId: meta.stepId} : {}),
			...(meta.taskId ? {taskId: meta.taskId} : {}),
			...(chartData ? {chartData} : {}),
		},
		...(meta.protocolId ? {protocolId: meta.protocolId} : {}),
		...(meta.symbol ? {symbol: meta.symbol} : {}),
		status: normalized.status,
		completeness: normalized.completeness,
		side: normalized.side,
		confidence: normalized.confidence,
		lastClose: normalized.lastClose,
		...(normalized.entry ? {entry: normalized.entry} : {}),
		...(normalized.target ? {target: normalized.target} : {}),
		...(normalized.invalidation ? {invalidation: normalized.invalidation} : {}),
		analysisSetup: setup,
		...(tradeSetupSelection ? {tradeSetupSelection} : {}),
		...(bollingerContext ? {bollingerContext} : {}),
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

/** Override fib trade idea side (UI toggle or skill-defaults) before limit build. */
export function tradeIdeaWithFibSideOverride(idea: TradeIdea, side?: 'long' | 'short'): TradeIdea {
	if (!side || idea.side === side || idea.analysisSetup.kind !== 'key_level_fibonacci') {
		return idea;
	}
	const setup = applyKeyLevelFibSideVariant(idea.analysisSetup.setup, side);
	const normalized = normalizeKeyLevelFibTradeSetup(setup);
	const tradeSetupSelection = extractTradeSetupSelection({kind: 'key_level_fibonacci', setup});
	return {
		...idea,
		side: setup.side,
		entry: normalized.entry,
		...(normalized.target ? {target: normalized.target} : {}),
		...(normalized.invalidation ? {invalidation: normalized.invalidation} : {}),
		status: setup.status,
		...(setup.unclearReason ? {unclearReason: setup.unclearReason} : {}),
		analysisSetup: {kind: 'key_level_fibonacci', setup},
		...(tradeSetupSelection ? {tradeSetupSelection} : {}),
	};
}
