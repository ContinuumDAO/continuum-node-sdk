import {getEnvironmentVariable} from '../agent/environment-variables.js';
import type {NodeSdkConfig} from '../../config/schema.js';
import {getCmcProApiKey} from './client.js';

export const COINMARKETCAP_API_KEY_ENV = 'COINMARKETCAP_API_KEY';

export const COINMARKETCAP_API_KEY_SIGNUP_URL =
	'https://pro.coinmarketcap.com/signup';

export function missingCmcApiKeyReason(): string {
	return [
		'CoinMarketCap Pro API key required for CEX aggregate OHLCV.',
		`Add environment variable ${COINMARKETCAP_API_KEY_ENV} in Node → AI Agent → Variables (add_environment_variable MCP tool).`,
		`Create a key at ${COINMARKETCAP_API_KEY_SIGNUP_URL}`,
		'Verify with list_environment_variables (name and envConfigured only — never pass the key in tool input).',
		'For keyless DEX pool OHLCV use get_kline_candles instead.',
	].join('\n');
}

/** Agent Variable first, then continuum-mcp process.env fallback. */
export async function resolveCmcApiKey(
	config: NodeSdkConfig,
): Promise<string | undefined> {
	const result = await getEnvironmentVariable(config, {
		name: COINMARKETCAP_API_KEY_ENV,
	});
	if (result.ok) {
		const value = result.data.value.trim();
		if (value) {
			return value;
		}
	}
	return getCmcProApiKey();
}

export async function isCmcApiKeyConfigured(
	config: NodeSdkConfig,
): Promise<boolean> {
	return (await resolveCmcApiKey(config)) !== undefined;
}
