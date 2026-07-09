import type {NodeSdkConfig} from '../../config/schema.js';
import {getPreferredKeyGen} from '../keygen.js';
import {getMpaWalletStatus} from '../mpc/mpa-top-up.js';
import type {SdkResult} from '../result.js';
import {
	AGENT_CHART_DATA_FETCH_NO_PREFERRED_KEYGEN,
	agentChartDataFetchBlockedReason,
} from './agent-chart-data-access.js';

/** Resolve preferred KeyGen + current-month billing before OHLCV / time-series fetch tools run. */
export async function assertAgentChartDataFetchAllowed(
	config: NodeSdkConfig,
): Promise<SdkResult<{keyGenId: string}>> {
	const preferred = await getPreferredKeyGen(config);
	if (!preferred.ok) {
		return preferred;
	}

	const keyGenId = preferred.data.keyGenId.trim();
	if (!keyGenId) {
		return {ok: false, reason: AGENT_CHART_DATA_FETCH_NO_PREFERRED_KEYGEN};
	}

	const billing = await getMpaWalletStatus(config, {keyGenId});
	if (!billing.ok) {
		return billing;
	}

	const blocked = agentChartDataFetchBlockedReason({
		preferredKeyGenId: keyGenId,
		status: billing.data,
	});
	if (blocked) {
		return {ok: false, reason: blocked};
	}

	return {ok: true, data: {keyGenId}};
}
