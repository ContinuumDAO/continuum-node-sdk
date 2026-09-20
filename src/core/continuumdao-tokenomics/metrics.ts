import {formatUnits} from 'viem';
import type {SdkResult} from '../result.js';
import type {ContinuumDaoApiDeps} from './client.js';
import {fetchMetricsFromApi} from './client.js';
import {
	CIRCULATING_SUPPLY_FORMULA,
	CIRCULATING_SUPPLY_NOTE,
	CTM_DECIMALS,
	CTM_MAX_SUPPLY_CTM,
	MAX_SUPPLY_NOTE,
} from './constants.js';
import type {CtmMetricsDecoded, CtmMetricsRaw} from './schemas.js';

export type DecodedCtmMetrics = {
	raw: CtmMetricsRaw;
	decoded: CtmMetricsDecoded;
	circulatingSupplyFormula: string;
	circulatingSupplyNote: string;
	maxSupplyCtm: string;
	maxSupplyNote: string;
};

function formatCtmAmount(wei: string): string {
	try {
		return formatUnits(BigInt(wei), CTM_DECIMALS);
	} catch {
		return wei;
	}
}

function formatLockDays(seconds: string): string {
	try {
		const sec = BigInt(seconds);
		const whole = sec / 86400n;
		const rem = sec % 86400n;
		if (rem === 0n) {
			return whole.toString();
		}
		const days = Number(sec) / 86400;
		return Number.isFinite(days) ? days.toFixed(2) : seconds;
	} catch {
		return seconds;
	}
}

export function decodeCtmMetrics(raw: CtmMetricsRaw): DecodedCtmMetrics {
	let holders = 0;
	try {
		holders = Number(BigInt(raw.holders));
	} catch {
		holders = Number.parseInt(raw.holders, 10);
	}
	if (!Number.isFinite(holders) || holders < 0) {
		holders = 0;
	}
	return {
		raw,
		decoded: {
			escrowedCtm: formatCtmAmount(raw.escrowed),
			totalSupplyCtm: formatCtmAmount(raw.totalSupply),
			circulatingSupplyCtm: formatCtmAmount(raw.circulatingSupply),
			totalPower: formatCtmAmount(raw.totalPower),
			holders,
			avgLockDurationSeconds: raw.avgLockDuration,
			avgLockDurationDays: formatLockDays(raw.avgLockDuration),
		},
		circulatingSupplyFormula: CIRCULATING_SUPPLY_FORMULA,
		circulatingSupplyNote: CIRCULATING_SUPPLY_NOTE,
		maxSupplyCtm: CTM_MAX_SUPPLY_CTM,
		maxSupplyNote: MAX_SUPPLY_NOTE,
	};
}

export async function getCtmMetricsDecoded(
	deps?: ContinuumDaoApiDeps,
): Promise<SdkResult<DecodedCtmMetrics>> {
	const fetched = await fetchMetricsFromApi(deps);
	if (!fetched.ok) {
		return fetched;
	}
	return {ok: true, data: decodeCtmMetrics(fetched.data)};
}
