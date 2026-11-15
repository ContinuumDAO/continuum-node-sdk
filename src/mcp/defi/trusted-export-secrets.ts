import type {NodeSdkConfig} from '../../config/schema.js';
import {readTrustedVariable} from '../../core/agent/trusted-variables.js';
import {resolveBitqueryApiKeyFromNode} from './bitquery-api-key.js';
import {resolveTheGraphApiKeyFromNode} from './the-graph-api-key.js';

const ETHERSCAN_API_KEY_ENV = 'ETHERSCAN_API_KEY';

const GRAPH_EXPORTS = new Set([
	'uniswapV4FetchOhlcv',
	'fetchUniswapV4ChartLivePrice',
	'fetchUniswapV4LatestSwap',
	'fetchUniswapV4PoolHourDatas',
	'fetchUniswapV4PoolDayDatas',
	'fetchUniswapV4Swaps',
	'fetchUniswapV4PoolMeta',
	'compoundV3FetchMarketsSummary',
]);

const BITQUERY_EXPORTS = new Set([
	'uniswapV4FetchOhlcv',
	'fetchUniswapV4ChartLivePrice',
	'fetchRobinhoodBitqueryOhlcv',
]);

/**
 * Copy library arguments and fill secret fields from the Variables store.
 * Agent-supplied copies of those fields are dropped. Values are not written to process.env.
 */
export async function applyTrustedExportSecrets(
	config: NodeSdkConfig,
	exportName: string,
	input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	const next: Record<string, unknown> = {...input};
	if (GRAPH_EXPORTS.has(exportName)) {
		delete next.theGraphApiKey;
		const key = await resolveTheGraphApiKeyFromNode(config);
		if (key) next.theGraphApiKey = key;
	}
	if (exportName === 'fetchCompoundV3SubgraphMarkets') {
		delete next.apiKey;
		const key = await resolveTheGraphApiKeyFromNode(config);
		if (key) next.apiKey = key;
	}
	if (BITQUERY_EXPORTS.has(exportName)) {
		delete next.bitqueryApiKey;
		const key = await resolveBitqueryApiKeyFromNode(config);
		if (key) next.bitqueryApiKey = key;
	}
	if (exportName === 'continuumDaoComposeProposalAction') {
		delete next.etherscanApiKey;
		const key = await readTrustedVariable(ETHERSCAN_API_KEY_ENV, config);
		if (key) next.etherscanApiKey = key;
	}
	return next;
}
