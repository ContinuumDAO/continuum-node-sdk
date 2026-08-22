import type {MpaWalletStatusData} from '../mpc/mpa-billing-helpers.js';

export const AGENT_CHART_DATA_FETCH_NO_PREFERRED_KEYGEN =
	'Chart and time-series data fetch requires a preferred KeyGen. Select a preferred KeyGen under Node → AI Agent → Provider, then try again.';

export const AGENT_CHART_DATA_FETCH_MONTH_NOT_ACTIVE =
	'Your preferred KeyGen is not subscribed for the current month. Activate the keygen_billing tool group, then call get_mpa_wallet_status and create_mpa_sync_billing_multi_sign_request for that KeyGen (deposits the fee-token or CTM shortfall when needed; no deposit when monthActivationWaived). Wait until that request is executed, then retry.';

function stripMcpToolServerPrefix(name: string): string {
	const idx = name.indexOf('__');
	if (idx <= 0) {
		return name;
	}
	return name.slice(idx + 2);
}

/** MCP tools that fetch OHLCV or time-series candles for charting / analysis. */
export function isAgentChartDataFetchTool(toolName: string): boolean {
	const bare = stripMcpToolServerPrefix(toolName).toLowerCase();
	if (bare.includes('fetch_ohlcv')) {
		return true;
	}
	if (bare === 'get_crypto_ohlcv_historical' || bare === 'get_kline_candles') {
		return true;
	}
	if (bare.includes('ohlcv_historical') || bare.includes('get_kline')) {
		return true;
	}
	if (
		bare.includes('getfullchart') ||
		bare.includes('getlightchart') ||
		bare.includes('getintradaychart') ||
		bare.includes('getunadjustedchart') ||
		bare.includes('historicalchart') ||
		bare.includes('historical-chart') ||
		bare.includes('historical_chart') ||
		bare.includes('historicalprice') ||
		bare.includes('historical-price') ||
		bare.includes('historical_price')
	) {
		return true;
	}
	if (
		bare.includes('get_stock_bars') ||
		bare.includes('get_crypto_bars') ||
		bare.includes('get_option_bars')
	) {
		return true;
	}
	if (
		bare === 'getstockprices' ||
		bare === 'get_stock_prices' ||
		bare === 'getvixhistory' ||
		bare === 'get_vix_history'
	) {
		return true;
	}
	return false;
}

/** Human-readable block reason, or null when fetch is allowed. */
export function agentChartDataFetchBlockedReason(input: {
	preferredKeyGenId: string;
	status: MpaWalletStatusData | null | undefined;
}): string | null {
	const keyGenId = input.preferredKeyGenId.trim();
	if (!keyGenId) {
		return AGENT_CHART_DATA_FETCH_NO_PREFERRED_KEYGEN;
	}
	const status = input.status;
	if (status == null) {
		return null;
	}
	if (!status.registered) {
		return `${AGENT_CHART_DATA_FETCH_MONTH_NOT_ACTIVE} Register billing for this KeyGen first.`;
	}
	if (status.fundedForCurrentMonth !== true) {
		return AGENT_CHART_DATA_FETCH_MONTH_NOT_ACTIVE;
	}
	return null;
}
