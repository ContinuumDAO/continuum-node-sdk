import type {SdkResult} from '../result.js';
import type {ChartPatternAnalysis, EnrichedChartPatternHit} from '../chart-patterns/types.js';

export type BoundChartPatternAnalysis = {
	patterns: EnrichedChartPatternHit[];
	patternMenu: ChartPatternAnalysis['patternMenu'];
	title?: string;
	ohlcvDigest?: string;
	boundAt: number;
};

const store = new Map<string, BoundChartPatternAnalysis>();

export function clearChartPatternAnalysisSession(sessionKey: string): void {
	store.delete(sessionKey);
}

export function getBoundChartPatternAnalysis(
	sessionKey: string,
): BoundChartPatternAnalysis | undefined {
	return store.get(sessionKey);
}

export function bindChartPatternAnalysis(
	sessionKey: string,
	analysis: ChartPatternAnalysis,
	options: {title?: string; ohlcvDigest?: string} = {},
): BoundChartPatternAnalysis | null {
	if (!analysis.patterns?.length) {
		store.delete(sessionKey);
		return null;
	}
	const bound: BoundChartPatternAnalysis = {
		patterns: analysis.patterns,
		patternMenu: analysis.patternMenu,
		boundAt: Date.now(),
		...(options.title?.trim() ? {title: options.title.trim()} : {}),
		...(options.ohlcvDigest?.trim() ? {ohlcvDigest: options.ohlcvDigest.trim()} : {}),
	};
	store.set(sessionKey, bound);
	return bound;
}

/** Keep only keys accepted by apply_chart_pattern_drawings MCP schema. */
export function stripChartPatternAnalysisForMcpApply(
	analysis: unknown,
): Record<string, unknown> | undefined {
	if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) {
		return undefined;
	}
	const src = analysis as Record<string, unknown>;
	const out: Record<string, unknown> = {};
	for (const key of [
		'pattern',
		'patterns',
		'primaryPattern',
		'highestConfidencePattern',
		'patternId',
		'patternIndex',
		'selectionMode',
	] as const) {
		if (src[key] !== undefined) {
			out[key] = src[key];
		}
	}
	return Object.keys(out).length > 0 ? out : undefined;
}

export type ChartPatternApplyResolveInput = {
	title?: string;
	ohlcvDigest?: string;
	patternId?: string;
	patternIndex?: number;
	patternNumber?: number;
	analysis?: unknown;
	drawings?: unknown;
	pattern?: unknown;
};

const PATTERN_SESSION_MISS =
	'No chart pattern analysis in this session. Run analyze_chart_patterns on the same OHLCV fetch first, then apply_chart_pattern_drawings with patternNumber (1-based menu #) or patternId.';

const PATTERN_DIGEST_MISMATCH =
	'`ohlcvDigest` does not match the bound pattern analysis session. Re-run analyze_chart_patterns or pass matching meta.sessionBind.';

export type ChartPatternApplyResolvedInput = ChartPatternApplyResolveInput & {
	analysis?: {
		patterns?: EnrichedChartPatternHit[];
		patternMenu?: ChartPatternAnalysis['patternMenu'];
		[key: string]: unknown;
	};
};

/** Inject bound analysis.patterns when the agent selects by menu number/id only. */
export function resolveChartPatternApplyInput(
	sessionKey: string,
	input: ChartPatternApplyResolveInput,
): SdkResult<ChartPatternApplyResolvedInput> {
	const hasGeometry =
		input.drawings != null ||
		(input.analysis != null &&
			typeof input.analysis === 'object' &&
			(Array.isArray((input.analysis as {patterns?: unknown[]}).patterns) ||
				(input.analysis as {pattern?: unknown}).pattern != null));

	const wantsSelection =
		input.patternId != null ||
		input.patternIndex != null ||
		input.patternNumber != null;

	if (hasGeometry || !wantsSelection) {
		return {ok: true, data: normalizePatternSelectionFields(input) as ChartPatternApplyResolvedInput};
	}

	const bound = store.get(sessionKey);
	if (!bound) {
		return {ok: false, reason: PATTERN_SESSION_MISS};
	}

	const requestedDigest = input.ohlcvDigest?.trim();
	if (requestedDigest && bound.ohlcvDigest && bound.ohlcvDigest !== requestedDigest) {
		return {ok: false, reason: PATTERN_DIGEST_MISMATCH};
	}

	return {
		ok: true,
		data: {
			...normalizePatternSelectionFields(input),
			analysis: stripChartPatternAnalysisForMcpApply({
				...(typeof input.analysis === 'object' && input.analysis != null
					? (input.analysis as Record<string, unknown>)
					: {}),
				patterns: bound.patterns,
			}),
		},
	};
}

export function normalizePatternSelectionFields<T extends ChartPatternApplyResolveInput>(
	input: T,
): T {
	const out = {...input};
	if (out.patternNumber != null && out.patternIndex == null) {
		const n = Math.floor(Number(out.patternNumber));
		if (Number.isFinite(n) && n >= 1) {
			out.patternIndex = n - 1;
		}
	}
	return out;
}

export function sortPatternHitsForMenu(hits: EnrichedChartPatternHit[]): EnrichedChartPatternHit[] {
	return [...hits].sort(
		(a, b) => b.barSpan.toIndex - a.barSpan.toIndex || b.confidence - a.confidence,
	);
}
