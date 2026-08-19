import type {NodeSdkConfig} from '../../config/schema.js';
import {buildManagementQueryPath, managementGet} from '../../api/management-api.js';
import type {SdkResult} from '../result.js';
import {
	CHAIN_REGISTRY_API_PATHS,
	ChainRegistryEntrySchema,
	GetChainRegistryDataSchema,
	GetChainRegistryQuerySchema,
	type GetChainRegistryData,
	type GetChainRegistryQuery,
} from '../../schemas/extended.js';
import {
	chainsMatchingName,
	formatConfiguredChains,
	type ChainRegistryEntry,
} from './registry-lookup.js';
import {z} from 'zod';

function normalizeGetChainDetailsResponse(
	raw: unknown,
): z.infer<typeof ChainRegistryEntrySchema>[] {
	if (raw === null || raw === undefined) {
		return [];
	}
	if (Array.isArray(raw)) {
		return raw
			.map(entry => ChainRegistryEntrySchema.safeParse(entry))
			.filter(parsed => parsed.success)
			.map(parsed => parsed.data);
	}
	if (typeof raw === 'object') {
		const parsed = ChainRegistryEntrySchema.safeParse(raw);
		return parsed.success ? [parsed.data] : [];
	}
	return [];
}

function chainLookupFailed(
	chainId: number | string,
	chains: readonly ChainRegistryEntry[],
): SdkResult<never> {
	return {
		ok: false,
		reason:
			`Chain ${chainId} is not in the registry. Configured chains: ${formatConfiguredChains(chains)}. ` +
			'Use get_chain_registry with chainName or list all chains with {} — do not guess chain IDs.',
	};
}

async function listConfiguredChains(
	config: NodeSdkConfig,
): Promise<SdkResult<readonly ChainRegistryEntry[]>> {
	const registry = await getChainRegistry(config, {});
	if (!registry.ok) {
		return registry;
	}
	return {ok: true, data: registry.data.chains};
}

/** GET chain registry — browser-safe (no management-signer / node:fs). */
export async function getChainRegistry(
	config: NodeSdkConfig,
	query: GetChainRegistryQuery = {},
): Promise<SdkResult<GetChainRegistryData>> {
	const parsedQuery = GetChainRegistryQuerySchema.safeParse(query);
	if (!parsedQuery.success) {
		return {ok: false, reason: 'Invalid chain registry query.'};
	}
	const wantsNameFilter = Boolean(parsedQuery.data.chainName?.trim());
	const path = buildManagementQueryPath(CHAIN_REGISTRY_API_PATHS.get, {
		chain_id: wantsNameFilter ? undefined : parsedQuery.data.chain_id,
	});
	const result = await managementGet<unknown>(config, path);
	if (!result.ok) {
		if (
			parsedQuery.data.chain_id &&
			(result.reason.includes('404') ||
				result.reason.toLowerCase().includes('not found'))
		) {
			const configured = await listConfiguredChains(config);
			if (configured.ok) {
				return chainLookupFailed(parsedQuery.data.chain_id, configured.data);
			}
		}
		return result;
	}
	let chains = normalizeGetChainDetailsResponse(result.data);
	if (parsedQuery.data.chainName?.trim()) {
		chains = chainsMatchingName(chains, parsedQuery.data.chainName);
	}
	if (parsedQuery.data.chain_id) {
		chains = chains.filter(
			entry => String(entry.chainId).trim() === String(parsedQuery.data.chain_id),
		);
	}
	const parsed = GetChainRegistryDataSchema.safeParse({chains});
	if (!parsed.success) {
		return {ok: false, reason: 'Chain registry response failed validation.'};
	}
	return {ok: true, data: parsed.data};
}

/** Resolve one chain registry row — browser-safe. */
export async function resolveChainRegistryByQuery(
	config: NodeSdkConfig,
	query: {chainId?: number | string; chainName?: string},
): Promise<SdkResult<ChainRegistryEntry>> {
	if (query.chainId != null) {
		return resolveChainRegistryEntry(config, query.chainId);
	}
	const chainName = query.chainName?.trim();
	if (!chainName) {
		return {ok: false, reason: 'Provide chainId or chainName.'};
	}
	const registry = await getChainRegistry(config, {chainName});
	if (!registry.ok) {
		return registry;
	}
	const matches = registry.data.chains;
	if (matches.length === 0) {
		const all = await listConfiguredChains(config);
		if (!all.ok) {
			return all;
		}
		return {
			ok: false,
			reason:
				`No chain registry entry matching "${chainName}". Configured chains: ${formatConfiguredChains(all.data)}.`,
		};
	}
	if (matches.length > 1) {
		return {
			ok: false,
			reason: `Multiple chains match "${chainName}": ${formatConfiguredChains(matches)}. Use chainId to disambiguate.`,
		};
	}
	return {ok: true, data: matches[0]!};
}

/** Resolve chain registry entry by id — browser-safe. */
export async function resolveChainRegistryEntry(
	config: NodeSdkConfig,
	chainId: number | string,
): Promise<SdkResult<ChainRegistryEntry>> {
	const registry = await getChainRegistry(config, {chain_id: String(chainId)});
	if (!registry.ok) {
		return registry;
	}
	const chain =
		registry.data.chains.find(
			entry => String(entry.chainId).trim() === String(chainId),
		) ?? registry.data.chains[0];
	if (!chain) {
		const configured = await listConfiguredChains(config);
		if (configured.ok) {
			return chainLookupFailed(chainId, configured.data);
		}
		return {ok: false, reason: 'Chain not configured.'};
	}
	return {ok: true, data: chain};
}
