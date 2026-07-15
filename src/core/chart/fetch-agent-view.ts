import {buildOhlcvAnalysisMeta, type OhlcvAnalysisMeta} from './analysis/analysis-meta.js';
import {extractChartMetadataFromFetchPayload} from './fetch-metadata.js';
import {extractOhlcvBarsFromUnknown} from './fetch-result.js';
import type {OhlcvFingerprint} from './ohlcv-integrity.js';
import type {OhlcvSessionBindHint} from './ohlcv-session-store.js';

export type FetchLoadMeta = OhlcvAnalysisMeta & {
	sessionBind?: OhlcvSessionBindHint;
};

/** Build meta (ohlcvSummary, sessionBind, fetchContext) after a successful OHLCV fetch. */
export function buildFetchLoadMeta(
	payload: unknown,
	options: {
		title?: string;
		fingerprint?: OhlcvFingerprint | null;
		sessionBind?: OhlcvSessionBindHint;
	} = {},
): FetchLoadMeta | undefined {
	const bars = extractOhlcvBarsFromUnknown(payload, {maxPoints: 10_000});
	if (!bars?.length) {
		return undefined;
	}
	const inferred = extractChartMetadataFromFetchPayload(payload);
	const title = options.title?.trim() || inferred.title;
	const meta = buildOhlcvAnalysisMeta(bars as Record<string, unknown>[], {
		title,
		toolResult: payload,
		ohlcvFingerprint: options.fingerprint,
	});
	return options.sessionBind ? {...meta, sessionBind: options.sessionBind} : meta;
}

/** Agent-facing fetch payload — omits candle rows (UI / structuredContent keeps full fetch). */
export function slimFetchOutputForAgent(
	payload: unknown,
	meta: FetchLoadMeta,
): Record<string, unknown> {
	const inferred = extractChartMetadataFromFetchPayload(payload);
	return {
		agentView: 'slim',
		fetch: {
			...(inferred.title ? {title: inferred.title} : {}),
			...(inferred.label ? {label: inferred.label} : {}),
			barCount: meta.barCount,
		},
		meta,
	};
}

/** Attach fetch meta to the full vendor payload without removing candle rows. */
export function attachFetchMetaToPayload(
	payload: unknown,
	meta: FetchLoadMeta,
): Record<string, unknown> {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return {meta};
	}
	return {...(payload as Record<string, unknown>), meta};
}
