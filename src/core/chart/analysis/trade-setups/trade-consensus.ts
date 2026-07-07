import type {AnalysisTradeSetupKind, TradeSetupSide} from './shared.js';
import type {TradeIdea} from './trade-idea.js';

export type TradeConsensusConfig = {
	requiredSources?: AnalysisTradeSetupKind[];
	minAgree?: number;
	minConfidence?: number;
	allowPartial?: boolean;
	blockOnConflict?: boolean;
	submitTradeFromConsensus?: boolean;
};

export type TradeConsensusGate = 'ALLOWED' | 'BLOCKED';

export type TradeConsensusEvaluation = {
	gate: TradeConsensusGate;
	blockers: string[];
	agreeCount: number;
	conflict: boolean;
	matchingIdeas: TradeIdea[];
	config: TradeConsensusConfig;
};

const DEFAULT_CONFIG: Required<
	Pick<TradeConsensusConfig, 'minAgree' | 'minConfidence' | 'allowPartial' | 'blockOnConflict'>
> = {
	minAgree: 2,
	minConfidence: 0.45,
	allowPartial: true,
	blockOnConflict: true,
};

function dominantSide(ideas: TradeIdea[]): TradeSetupSide | null {
	const counts: Record<TradeSetupSide, number> = {long: 0, short: 0, neutral: 0};
	for (const idea of ideas) {
		if (idea.side === 'long' || idea.side === 'short') {
			counts[idea.side] += 1;
		}
	}
	if (counts.long === 0 && counts.short === 0) {
		return null;
	}
	if (counts.long > counts.short) {
		return 'long';
	}
	if (counts.short > counts.long) {
		return 'short';
	}
	return null;
}

export function evaluateTradeConsensus(
	ideas: TradeIdea[],
	config: TradeConsensusConfig = {},
): TradeConsensusEvaluation {
	const merged = {...DEFAULT_CONFIG, ...config};
	const required = merged.requiredSources ?? [];
	const candidates = ideas.filter(idea => {
		if (required.length > 0 && !required.includes(idea.source.analysisType)) {
			return false;
		}
		if (idea.status !== 'clear') {
			return false;
		}
		if (!merged.allowPartial && idea.completeness !== 'full') {
			return false;
		}
		return idea.confidence >= merged.minConfidence;
	});
	const sides = new Set(
		candidates.map(item => item.side).filter(side => side === 'long' || side === 'short'),
	);
	const conflict = sides.size > 1;
	const dominant = dominantSide(candidates);
	const matchingIdeas =
		dominant == null ? candidates : candidates.filter(item => item.side === dominant);
	const blockers: string[] = [];
	if (required.length > 0) {
		for (const source of required) {
			if (!ideas.some(item => item.source.analysisType === source)) {
				blockers.push(`Missing required source ${source}.`);
			}
		}
	}
	if (matchingIdeas.length < merged.minAgree) {
		blockers.push(
			`Only ${matchingIdeas.length} idea(s) meet consensus filters; minAgree=${merged.minAgree}.`,
		);
	}
	if (conflict && merged.blockOnConflict) {
		blockers.push('Conflicting long/short ideas among consensus candidates.');
	}
	const gate: TradeConsensusGate = blockers.length === 0 ? 'ALLOWED' : 'BLOCKED';
	return {
		gate,
		blockers,
		agreeCount: matchingIdeas.length,
		conflict,
		matchingIdeas,
		config: merged,
	};
}

export function parseTradeConsensusYaml(raw: Record<string, unknown>): TradeConsensusConfig | null {
	const block = raw.tradeConsensus;
	if (!block || typeof block !== 'object') {
		return null;
	}
	const cfg = block as Record<string, unknown>;
	const out: TradeConsensusConfig = {};
	if (Array.isArray(cfg.requiredSources)) {
		out.requiredSources = cfg.requiredSources.filter(
			(item): item is AnalysisTradeSetupKind => typeof item === 'string',
		);
	}
	if (typeof cfg.minAgree === 'number') {
		out.minAgree = cfg.minAgree;
	}
	if (typeof cfg.minConfidence === 'number') {
		out.minConfidence = cfg.minConfidence;
	}
	if (typeof cfg.allowPartial === 'boolean') {
		out.allowPartial = cfg.allowPartial;
	}
	if (typeof cfg.blockOnConflict === 'boolean') {
		out.blockOnConflict = cfg.blockOnConflict;
	}
	if (typeof cfg.submitTradeFromConsensus === 'boolean') {
		out.submitTradeFromConsensus = cfg.submitTradeFromConsensus;
	}
	return out;
}
