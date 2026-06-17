import type {NodeSdkConfig} from '../../config/schema.js';
import {getTokenRegistry} from '../../core/registry/tokens.js';
import {flattenTokenRegistry} from '../../core/registry/registry-lookup.js';

/** Token decimals from node token registry (chain registry token list), if present. */
export async function lookupRegistryTokenDecimals(
	config: NodeSdkConfig,
	chainId: number,
	tokenAddress: string,
): Promise<number | undefined> {
	const registry = await getTokenRegistry(config, {chain_id: String(chainId)});
	if (!registry.ok) return undefined;
	const needle = tokenAddress.trim().toLowerCase();
	for (const row of flattenTokenRegistry(registry.data)) {
		if (
			String(row.chainId) === String(chainId) &&
			row.contractAddress.toLowerCase() === needle &&
			typeof row.decimals === 'number' &&
			Number.isInteger(row.decimals) &&
			row.decimals >= 0
		) {
			return row.decimals;
		}
	}
	return undefined;
}
