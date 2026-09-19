import {getAddress, isAddress, type Address} from 'viem';
import {fetchKeyGenResult} from '../../core/keygen.js';
import {parseKeyGenRequestId} from '../../core/keygen-id.js';
import type {NodeSdkConfig} from '../../config/schema.js';
import {resolveChainRegistryEntry} from '../../core/registry/networks.js';
import type {SdkResult} from '../../core/result.js';
import {parseEvmChainId} from './input-adapter.js';

const CONTINUUM_DAO_SIMULATE_PROPOSAL_TOOL = 'ctm_continuum_dao_simulate_proposal';

export function isContinuumDaoSimulateProposalTool(toolName: string): boolean {
	return toolName === CONTINUUM_DAO_SIMULATE_PROPOSAL_TOOL;
}

function parseOptionalAddress(raw: unknown): Address | undefined {
	if (typeof raw !== 'string' || !raw.trim() || !isAddress(raw.trim())) return undefined;
	return getAddress(raw.trim());
}

/**
 * Resolve rpcUrl from the chain registry and account from an explicit EOA
 * (draft proposer) or, when omitted, the preferred KeyGen ETH address.
 */
export async function adaptContinuumDaoSimulateProposalMcpInput(
	config: NodeSdkConfig,
	toolName: string,
	input: Record<string, unknown>,
): Promise<SdkResult<Record<string, unknown>>> {
	if (!isContinuumDaoSimulateProposalTool(toolName)) {
		return {ok: true, data: input};
	}

	const adapted: Record<string, unknown> = {...input};
	const chainId = parseEvmChainId(adapted.chainId);
	if (!Number.isFinite(chainId) || chainId <= 0) {
		return {ok: false, reason: 'chainId must be 59144 (Linea) or 59141 (Linea Sepolia).'};
	}
	adapted.chainId = chainId;

	const rpcProvided =
		typeof adapted.rpcUrl === 'string' && adapted.rpcUrl.trim()
			? adapted.rpcUrl.trim()
			: undefined;
	if (!rpcProvided) {
		const chain = await resolveChainRegistryEntry(config, chainId);
		if (!chain.ok) {
			return chain;
		}
		const rpcUrl = String(chain.data.rpcGateway ?? '').trim();
		if (!rpcUrl) {
			return {
				ok: false,
				reason: `Chain registry entry for chainId ${chainId} has no rpcGateway. Configure it via get_chain_registry / add_to_chain_registry.`,
			};
		}
		adapted.rpcUrl = rpcUrl;
	}

	const accountRaw = typeof adapted.account === 'string' ? adapted.account.trim() : '';
	let account = parseOptionalAddress(accountRaw);
	if (accountRaw && !account) {
		return {ok: false, reason: 'account must be a valid Ethereum address.'};
	}
	if (!account) {
		const keyGenIdRaw = String(adapted.keyGenId ?? '').trim();
		if (!keyGenIdRaw) {
			return {
				ok: false,
				reason:
					'Pass account (any Ethereum address that will submit the draft) or keyGenId (defaults account to that KeyGen).',
			};
		}
		const keyGenIdParsed = parseKeyGenRequestId(keyGenIdRaw);
		if (!keyGenIdParsed.ok) return keyGenIdParsed;
		const kg = await fetchKeyGenResult(config, keyGenIdParsed.data);
		if (!kg.ok) return kg;
		const eth = String(kg.data.ethereumaddress ?? '').trim();
		if (!eth) {
			return {ok: false, reason: 'KeyGen result missing ethereumaddress.'};
		}
		try {
			account = getAddress(eth.startsWith('0x') ? eth : `0x${eth}`);
		} catch {
			return {ok: false, reason: 'KeyGen ethereumaddress is not a valid EVM address.'};
		}
	}
	adapted.account = account;
	delete adapted.purposeText;
	delete adapted.useCustomGas;

	return {ok: true, data: adapted};
}
