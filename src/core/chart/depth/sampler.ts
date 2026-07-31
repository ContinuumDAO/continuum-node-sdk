import {averageDepthSamples, snapshotToBins, type DepthSampleRecord} from './average.js';
import {fetchBinanceDepthSnapshot} from './binance-fetch.js';
import {fetchCoinbaseDepthSnapshot} from './coinbase-fetch.js';
import {
	DEFAULT_DEPTH_AVERAGE_WINDOW_SEC,
	DEFAULT_DEPTH_EXCHANGE_ID,
	DEFAULT_DEPTH_LIMIT,
	DEFAULT_DEPTH_SAMPLE_INTERVAL_SEC,
	type AveragedDepthProfile,
	type DepthExchangeId,
	type NormalizedDepthSnapshot,
} from './schemas.js';

export type DepthSamplerKey = {
	exchangeId: DepthExchangeId;
	symbol: string;
};

export type DepthSamplerOptions = {
	sampleIntervalSec?: number;
	windowSec?: number;
	limit?: number;
};

type SamplerState = {
	key: string;
	exchangeId: DepthExchangeId;
	symbol: string;
	sampleIntervalSec: number;
	windowSec: number;
	limit: number;
	samples: DepthSampleRecord[];
	timer: ReturnType<typeof setInterval> | null;
	polling: boolean;
};

const samplers = new Map<string, SamplerState>();

export function depthSamplerKeyString(key: DepthSamplerKey): string {
	return `${key.exchangeId}:spot:${key.symbol.trim().toUpperCase()}`;
}

function trimSamples(state: SamplerState): void {
	const cutoff = Date.now() - state.windowSec * 1000;
	while (state.samples.length > 0 && state.samples[0]!.asOfMs < cutoff) {
		state.samples.shift();
	}
	// Cap buffer even if clock skew
	const maxSamples = Math.max(8, Math.ceil(state.windowSec / Math.max(1, state.sampleIntervalSec)) + 4);
	if (state.samples.length > maxSamples) {
		state.samples.splice(0, state.samples.length - maxSamples);
	}
}

export function ingestDepthSnapshot(
	key: DepthSamplerKey,
	snapshot: NormalizedDepthSnapshot,
	options: DepthSamplerOptions = {},
): AveragedDepthProfile | null {
	const id = depthSamplerKeyString(key);
	let state = samplers.get(id);
	if (!state) {
		state = {
			key: id,
			exchangeId: key.exchangeId,
			symbol: key.symbol.trim().toUpperCase(),
			sampleIntervalSec: options.sampleIntervalSec ?? DEFAULT_DEPTH_SAMPLE_INTERVAL_SEC,
			windowSec: options.windowSec ?? DEFAULT_DEPTH_AVERAGE_WINDOW_SEC,
			limit: options.limit ?? DEFAULT_DEPTH_LIMIT,
			samples: [],
			timer: null,
			polling: false,
		};
		samplers.set(id, state);
	}
	state.samples.push({
		asOfMs: snapshot.asOfMs,
		bins: snapshotToBins(snapshot),
		...(snapshot.mid != null ? {mid: snapshot.mid} : {}),
	});
	trimSamples(state);
	return getAveragedDepthProfile(key);
}

async function pollOnce(state: SamplerState): Promise<void> {
	if (state.polling) {
		return;
	}
	state.polling = true;
	try {
		let snap = null;
		if (state.exchangeId === 'binance') {
			snap = await fetchBinanceDepthSnapshot({
				symbol: state.symbol,
				limit: state.limit,
			});
		} else if (state.exchangeId === 'coinbase') {
			snap = await fetchCoinbaseDepthSnapshot({
				productId: state.symbol,
				limit: state.limit,
			});
		}
		if (snap) {
			ingestDepthSnapshot(
				{exchangeId: state.exchangeId, symbol: state.symbol},
				snap,
				{
					sampleIntervalSec: state.sampleIntervalSec,
					windowSec: state.windowSec,
					limit: state.limit,
				},
			);
		}
	} finally {
		state.polling = false;
	}
}

/** Start (or refresh options for) a background depth sampler. Idempotent. */
export function ensureDepthSampler(
	key: DepthSamplerKey,
	options: DepthSamplerOptions = {},
): void {
	const exchangeId = key.exchangeId || DEFAULT_DEPTH_EXCHANGE_ID;
	const symbol = key.symbol.trim().toUpperCase();
	if (!symbol) {
		return;
	}
	const id = depthSamplerKeyString({exchangeId, symbol});
	const sampleIntervalSec = options.sampleIntervalSec ?? DEFAULT_DEPTH_SAMPLE_INTERVAL_SEC;
	const windowSec = options.windowSec ?? DEFAULT_DEPTH_AVERAGE_WINDOW_SEC;
	const limit = options.limit ?? DEFAULT_DEPTH_LIMIT;

	let state = samplers.get(id);
	if (!state) {
		state = {
			key: id,
			exchangeId,
			symbol,
			sampleIntervalSec,
			windowSec,
			limit,
			samples: [],
			timer: null,
			polling: false,
		};
		samplers.set(id, state);
	} else {
		state.sampleIntervalSec = sampleIntervalSec;
		state.windowSec = windowSec;
		state.limit = limit;
	}

	if (state.timer == null) {
		void pollOnce(state);
		state.timer = setInterval(() => {
			void pollOnce(state!);
		}, sampleIntervalSec * 1000);
		if (typeof state.timer === 'object' && 'unref' in state.timer) {
			state.timer.unref?.();
		}
	}
}

export function getAveragedDepthProfile(key: DepthSamplerKey): AveragedDepthProfile | null {
	const state = samplers.get(depthSamplerKeyString(key));
	if (!state) {
		return null;
	}
	trimSamples(state);
	return averageDepthSamples(state.samples, {
		exchangeId: state.exchangeId,
		symbol: state.symbol,
		windowSec: state.windowSec,
	});
}

export function getDepthSamplerSampleCount(key: DepthSamplerKey): number {
	const state = samplers.get(depthSamplerKeyString(key));
	if (!state) {
		return 0;
	}
	trimSamples(state);
	return state.samples.length;
}

/** Test helper — clear all samplers. */
export function resetDepthSamplersForTests(): void {
	for (const state of samplers.values()) {
		if (state.timer != null) {
			clearInterval(state.timer);
		}
	}
	samplers.clear();
}
