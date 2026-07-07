import {z} from 'zod';
import {coerceFiniteNumber} from '../point-normalize.js';
import {extractLiveBindingFromFetchPayload} from '../live/binding-extract.js';
import {barTimeSecFromRow} from '../live/bar-merge.js';
import {fetchChartLiveTick} from '../live/fetch-tick.js';
import {inferBarPeriodSec, mergeLiveTickIntoBars} from '../live/merge-tick.js';
import {ChartLiveTickSchema, type ChartLiveTick} from '../live/schemas.js';
import {extractOhlcvFetchWindow, validateOhlcvBarsFromToolResult} from '../ohlcv-window.js';
import {runOhlcvIntegrityPipeline, rejectOhlcvWindowMismatch} from '../ohlcv-integrity.js';
import {barsFromOhlcvToolInput, rejectStringToolResultInput, type OhlcvToolInput} from './ohlcv-input.js';
import type {SdkResult} from '../../result.js';
import type {OhlcvFingerprint} from '../ohlcv-integrity.js';

export const OhlcvLiveMergeMetaSchema = z
	.object({
		attempted: z.boolean(),
		merged: z.boolean(),
		livePrice: z.number().optional(),
		liveTickTimeMs: z.number().optional(),
		priorLastClose: z.number().optional(),
		barRolledOver: z.boolean().optional(),
		skippedReason: z.string().optional(),
	})
	.strict();

export type OhlcvLiveMergeMeta = z.infer<typeof OhlcvLiveMergeMetaSchema>;

export const OhlcvAnalysisInputSchema = z
	.object({
		mergeLive: z.boolean().optional(),
		liveTick: ChartLiveTickSchema.optional(),
	})
	.strict();

export function shouldMergeLiveForAnalysis(
	bars: Record<string, unknown>[],
	toolResult: unknown | undefined,
	mergeLive: boolean | undefined,
): {merge: boolean; skippedReason?: string} {
	if (mergeLive === false) {
		return {merge: false, skippedReason: 'mergeLive disabled (historical or explicit opt-out)'};
	}
	const binding = extractLiveBindingFromFetchPayload(toolResult);
	if (!binding) {
		return {merge: false, skippedReason: 'no live binding for this data source'};
	}
	const barPeriodSec = inferBarPeriodSec(bars) ?? binding.bucketSec;
	const window = extractOhlcvFetchWindow(toolResult);
	if (window != null) {
		const ageMs = Date.now() - window.endTimeMs;
		if (ageMs > barPeriodSec * 2_000) {
			return {
				merge: false,
				skippedReason: 'historical fetch window (endTimeMs is in the past)',
			};
		}
	}
	const lastBar = bars[bars.length - 1];
	const lastSec = lastBar ? barTimeSecFromRow(lastBar) : null;
	if (lastSec != null) {
		const tickSec = Math.floor(Date.now() / 1000);
		if (tickSec >= lastSec + barPeriodSec * 2) {
			return {
				merge: false,
				skippedReason:
					'OHLCV tail is more than one bar behind live — pass the same chart fetch toolResult; only re-fetch if the operator changed symbol, interval, or lookback',
			};
		}
	}
	return {merge: true};
}

export async function prepareOhlcvBarsForAnalysis(
	input: OhlcvToolInput & {
		executeResult?: unknown;
		fetchResult?: unknown;
		maxPoints?: number;
		mergeLive?: boolean;
		liveTick?: ChartLiveTick;
	},
): Promise<
	SdkResult<{
		bars: Record<string, unknown>[];
		liveMerge: OhlcvLiveMergeMeta;
		fingerprint: OhlcvFingerprint | null;
	}>
> {
	const stringReject = rejectStringToolResultInput(input);
	if (!stringReject.ok) {
		return stringReject;
	}

	const bars = barsFromOhlcvToolInput(input);
	if (!bars.length) {
		return {
			ok: false,
			reason: 'no OHLCV bars',
		};
	}

	const integrity = runOhlcvIntegrityPipeline(bars, input);
	if (!integrity.ok) {
		return integrity;
	}

	if (input.toolResult != null) {
		const shapeCheck = validateOhlcvBarsFromToolResult(bars, input.toolResult, input.title);
		if (!shapeCheck.ok) {
			return shapeCheck;
		}
	}

	if (input.title?.trim()) {
		const windowCheck = rejectOhlcvWindowMismatch({
			title: input.title.trim(),
			barCount: bars.length,
			toolResult: input.toolResult,
		});
		if (!windowCheck.ok) {
			return windowCheck;
		}
	}

	const decision = shouldMergeLiveForAnalysis(bars, input.toolResult, input.mergeLive);
	if (!decision.merge) {
		return {
			ok: true,
			data: {
				bars,
				liveMerge: {
					attempted: decision.skippedReason !== 'mergeLive disabled (historical or explicit opt-out)',
					merged: false,
					skippedReason: decision.skippedReason,
				},
				fingerprint: integrity.data.fingerprint,
			},
		};
	}

	const binding = extractLiveBindingFromFetchPayload(input.toolResult)!;
	const priorLastClose = coerceFiniteNumber(bars[bars.length - 1]?.close) ?? undefined;
	let tick = input.liveTick;
	if (!tick) {
		try {
			tick = (await fetchChartLiveTick(binding)) ?? undefined;
		} catch {
			tick = undefined;
		}
	}
	if (!tick) {
		return {
			ok: true,
			data: {
				bars,
				liveMerge: {
					attempted: true,
					merged: false,
					priorLastClose,
					skippedReason: 'live tick fetch failed — quote priorLastClose or re-fetch OHLCV',
				},
				fingerprint: integrity.data.fingerprint,
			},
		};
	}

	const {bars: merged, barRolledOver} = mergeLiveTickIntoBars(bars, tick, {
		bucketSec: binding.bucketSec,
		maxPoints: input.maxPoints ?? 10_000,
	});

	const mergedIntegrity = runOhlcvIntegrityPipeline(merged, {...input, allowRowsOnly: true});
	if (!mergedIntegrity.ok) {
		return mergedIntegrity;
	}

	return {
		ok: true,
		data: {
			bars: merged,
			liveMerge: {
				attempted: true,
				merged: true,
				livePrice: tick.price,
				liveTickTimeMs: tick.timeMs,
				priorLastClose,
				barRolledOver,
			},
			// Fetch identity — unchanged by live tick merge (matches meta.sessionBind / chart fingerprint).
			fingerprint: integrity.data.fingerprint,
		},
	};
}
