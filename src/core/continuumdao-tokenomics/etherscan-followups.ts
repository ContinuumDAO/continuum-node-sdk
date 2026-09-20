import type {NodeSdkConfig} from '../../config/schema.js';
import {listMcpServers} from '../agent/mcp-servers.js';
import type {SdkResult} from '../result.js';
import type {CtmAddressRow, CtmEtherscanPlaybook, CtmOnChainFollowUp} from './schemas.js';
import {
	ETHERSCAN_API_KEY_ENV,
	ETHERSCAN_COMMUNITY_MCP_SERVER_ID,
	ETHERSCAN_MCP_SERVER_ID,
	ETHEREUM_CHAIN_ID,
	LINEA_CHAIN_ID,
} from './constants.js';

export type CtmEtherscanServerHint = {
	id: string;
	envConfigured?: boolean;
	apiKeyEnvVar?: string;
};

export type ChooseCtmEtherscanFollowUpInput = {
	activeServers: readonly CtmEtherscanServerHint[];
	catalogServers: readonly CtmEtherscanServerHint[];
	addresses: readonly CtmAddressRow[];
};

function findServer(
	rows: readonly CtmEtherscanServerHint[],
	id: string,
): CtmEtherscanServerHint | undefined {
	const want = id.trim().toLowerCase();
	return rows.find(row => row.id.trim().toLowerCase() === want);
}

function addressById(addresses: readonly CtmAddressRow[], id: string): string | undefined {
	return addresses.find(row => row.id === id)?.address;
}

function playbook(
	id: string,
	title: string,
	unlocked: boolean,
	serverId: string,
	calls: Array<{tool: string; args: Record<string, unknown>}>,
): CtmEtherscanPlaybook {
	return {
		id,
		title,
		unlocked,
		calls: calls.map(call => ({
			serverId,
			tool: `${serverId}__${call.tool}`,
			args: call.args,
		})),
	};
}

export function buildCtmEtherscanPlaybooks(input: {
	unlocked: boolean;
	serverId: string;
	addresses: readonly CtmAddressRow[];
}): CtmEtherscanPlaybook[] {
	const ctm = addressById(input.addresses, 'ctm');
	const ve = addressById(input.addresses, 'votingEscrow');
	const dao = addressById(input.addresses, 'dao');
	const c3gov = addressById(input.addresses, 'c3governor');
	const nodeProperties = addressById(input.addresses, 'nodeProperties');
	const rewards = addressById(input.addresses, 'rewards');
	const msaw = addressById(input.addresses, 'msaw');
	const treasury = addressById(input.addresses, 'treasury');
	const {unlocked, serverId} = input;

	const playbooks: CtmEtherscanPlaybook[] = [];
	if (ctm) {
		playbooks.push(
			playbook('token-info', 'CTM token info (Ethereum + Linea)', unlocked, serverId, [
				{tool: 'get_token_info', args: {chainid: ETHEREUM_CHAIN_ID, contractaddress: ctm}},
				{tool: 'get_token_info', args: {chainid: LINEA_CHAIN_ID, contractaddress: ctm}},
			]),
			{
				...playbook(
					'top-holders',
					'CTM top holders (compare with API holders count)',
					unlocked,
					serverId,
					[
						{
							tool: 'get_token_top_holders',
							args: {chainid: ETHEREUM_CHAIN_ID, contractaddress: ctm},
						},
						{
							tool: 'get_token_top_holders',
							args: {chainid: LINEA_CHAIN_ID, contractaddress: ctm},
						},
					],
				),
				then: {
					tool: 'get_ve_ctm_locked_for_addresses',
					note: 'Pass the holder addresses from get_token_top_holders. Returns VotingEscrow.locked() CTM per address (veNFT lock sum), not ERC-20 wallet balance.',
				},
			},
		);
	}
	if (ctm && (c3gov || dao)) {
		const calls: Array<{tool: string; args: Record<string, unknown>}> = [];
		if (c3gov) {
			calls.push({
				tool: 'get_token_balances',
				args: {chainid: ETHEREUM_CHAIN_ID, address: c3gov},
			});
			calls.push({
				tool: 'get_native_balance',
				args: {chainid: ETHEREUM_CHAIN_ID, address: c3gov},
			});
		}
		if (dao) {
			calls.push({
				tool: 'get_token_balances',
				args: {chainid: LINEA_CHAIN_ID, address: dao},
			});
			calls.push({
				tool: 'get_native_balance',
				args: {chainid: LINEA_CHAIN_ID, address: dao},
			});
		}
		playbooks.push(
			playbook('treasury-balances', 'Treasury CTM and native balances', unlocked, serverId, calls),
		);
	}
	if (ctm) {
		playbooks.push(
			playbook('ctm-transfers', 'Recent CTM transfers (mints, treasury, escrow)', unlocked, serverId, [
				{
					tool: 'get_token_transfers',
					args: {chainid: ETHEREUM_CHAIN_ID, contractaddress: ctm},
				},
				{
					tool: 'get_token_transfers',
					args: {chainid: LINEA_CHAIN_ID, contractaddress: ctm},
				},
			]),
		);
	}
	const verifyTargets = [
		ctm ? {label: 'CTM', address: ctm, chainid: ETHEREUM_CHAIN_ID} : null,
		ctm ? {label: 'CTM Linea', address: ctm, chainid: LINEA_CHAIN_ID} : null,
		ve ? {label: 'VotingEscrow', address: ve, chainid: LINEA_CHAIN_ID} : null,
		dao ? {label: 'Governor', address: dao, chainid: LINEA_CHAIN_ID} : null,
		nodeProperties
			? {label: 'NodeProperties', address: nodeProperties, chainid: LINEA_CHAIN_ID}
			: null,
		rewards ? {label: 'Rewards', address: rewards, chainid: LINEA_CHAIN_ID} : null,
		msaw ? {label: 'MSAW', address: msaw, chainid: LINEA_CHAIN_ID} : null,
		treasury ? {label: 'Treasury', address: treasury, chainid: LINEA_CHAIN_ID} : null,
	].filter((item): item is NonNullable<typeof item> => item != null);
	if (verifyTargets.length > 0) {
		const calls: Array<{tool: string; args: Record<string, unknown>}> = [];
		for (const target of verifyTargets) {
			calls.push({
				tool: 'get_contract_source',
				args: {chainid: target.chainid, address: target.address},
			});
			calls.push({
				tool: 'get_contract_abi',
				args: {chainid: target.chainid, address: target.address},
			});
			calls.push({
				tool: 'get_contract_creation',
				args: {chainid: target.chainid, address: target.address},
			});
		}
		playbooks.push(
			playbook(
				'verify-contracts',
				'Verify CTM, veCTM, governor, NodeProperties, Rewards, MSAW, treasury',
				unlocked,
				serverId,
				calls,
			),
		);
	}
	if (ve) {
		playbooks.push(
			playbook(
				'vectm-events',
				'veCTM logs (Deposit, Withdraw, Transfer, Liquidate)',
				unlocked,
				serverId,
				[{tool: 'get_logs', args: {chainid: LINEA_CHAIN_ID, address: ve}}],
			),
		);
	}
	if (dao) {
		playbooks.push(
			playbook('governor-activity', 'Linea governor transactions', unlocked, serverId, [
				{tool: 'get_transactions', args: {chainid: LINEA_CHAIN_ID, address: dao}},
			]),
			playbook(
				'last-votes',
				'Governor VoteCast logs (last vote time per address — filter by voter)',
				unlocked,
				serverId,
				[{tool: 'get_logs', args: {chainid: LINEA_CHAIN_ID, address: dao}}],
			),
		);
	}
	if (playbooks.length === 0) {
		playbooks.push({
			id: 'locked-titles',
			title: 'On-chain follow-ups (token info, holders, treasury, transfers, verify, veCTM logs)',
			unlocked,
			calls: [],
		});
	}
	return playbooks;
}

export function chooseCtmEtherscanFollowUp(
	input: ChooseCtmEtherscanFollowUpInput,
): CtmOnChainFollowUp {
	const officialActive = findServer(input.activeServers, ETHERSCAN_MCP_SERVER_ID);
	const communityActive = findServer(input.activeServers, ETHERSCAN_COMMUNITY_MCP_SERVER_ID);
	const officialCatalog = findServer(input.catalogServers, ETHERSCAN_MCP_SERVER_ID);
	const officialPreferred = true;

	if (officialActive) {
		const keyReady = officialActive.envConfigured === true;
		const serverId = ETHERSCAN_MCP_SERVER_ID;
		if (keyReady) {
			return {
				etherscan: {
					available: true,
					serverId,
					officialPreferred,
					note:
						'Official etherscan MCP is active and ETHERSCAN_API_KEY is configured. Load it for this chat with agent_load_mcp_server only if the operator chooses Etherscan, then call the suggested etherscan__* tools. Do not auto-load.',
					enable: {
						agentLoadMcpServer: {serverId},
					},
					playbooks: buildCtmEtherscanPlaybooks({
						unlocked: true,
						serverId,
						addresses: input.addresses,
					}),
				},
			};
		}
		return {
			etherscan: {
				available: false,
				serverId,
				officialPreferred,
				note:
					'Official etherscan MCP is active but ETHERSCAN_API_KEY is not configured. Add it with add_environment_variable, then agent_load_mcp_server only if the operator chooses Etherscan. Further tools (holders, treasury balances, ABI, veCTM logs) unlock after the key is set.',
				enable: {
					addEnvironmentVariable: {name: ETHERSCAN_API_KEY_ENV},
					agentLoadMcpServer: {serverId},
				},
				playbooks: buildCtmEtherscanPlaybooks({
					unlocked: false,
					serverId,
					addresses: input.addresses,
				}),
			},
		};
	}

	if (communityActive && !officialActive) {
		const keyReady = communityActive.envConfigured === true;
		const serverId = ETHERSCAN_COMMUNITY_MCP_SERVER_ID;
		return {
			etherscan: {
				available: keyReady,
				serverId,
				officialPreferred,
				note: keyReady
					? 'Official etherscan is not active. etherscan-community is active (unofficial). Prefer add_mcp_server_from_catalog({ id: "etherscan" }). Community tools are available only because the operator already chose that server.'
					: 'Official etherscan is not active. etherscan-community is active but ETHERSCAN_API_KEY is missing. Prefer official etherscan from the catalog.',
				enable: {
					addFromCatalog: {id: ETHERSCAN_MCP_SERVER_ID},
					addEnvironmentVariable: {name: ETHERSCAN_API_KEY_ENV},
					agentLoadMcpServer: {serverId: keyReady ? serverId : ETHERSCAN_MCP_SERVER_ID},
				},
				playbooks: buildCtmEtherscanPlaybooks({
					unlocked: keyReady,
					serverId,
					addresses: input.addresses,
				}),
			},
		};
	}

	const inCatalog = Boolean(officialCatalog);
	return {
		etherscan: {
			available: false,
			serverId: null,
			officialPreferred,
			note: inCatalog
				? 'Further on-chain tools (CTM holders, treasury balances, contract verification, veCTM logs) are available if the official etherscan MCP is loaded. Ask the operator, then add_mcp_server_from_catalog({ id: "etherscan" }), set ETHERSCAN_API_KEY, and agent_load_mcp_server({ serverId: "etherscan" }). Do not auto-load.'
				: 'Further on-chain tools (CTM holders, treasury balances, contract verification, veCTM logs) are available if the official etherscan MCP is loaded. Call list_mcp_servers; activate etherscan from the catalog if needed, set ETHERSCAN_API_KEY, then agent_load_mcp_server only if the operator chooses it.',
			enable: {
				addFromCatalog: {id: ETHERSCAN_MCP_SERVER_ID},
				addEnvironmentVariable: {name: ETHERSCAN_API_KEY_ENV},
				agentLoadMcpServer: {serverId: ETHERSCAN_MCP_SERVER_ID},
			},
			playbooks: buildCtmEtherscanPlaybooks({
				unlocked: false,
				serverId: ETHERSCAN_MCP_SERVER_ID,
				addresses: input.addresses,
			}),
		},
	};
}

export type CtmFollowUpDeps = {
	listMcpServersFn?: (scope: 'active' | 'catalog') => Promise<
		SdkResult<{
			scope: 'active' | 'catalog';
			activeServers?: readonly CtmEtherscanServerHint[];
			availableCatalog?: readonly CtmEtherscanServerHint[];
		}>
	>;
};

function hintFromUnknownScope(
	addresses: readonly CtmAddressRow[],
	reason: string,
): CtmOnChainFollowUp {
	return {
		etherscan: {
			available: false,
			serverId: null,
			officialPreferred: true,
			note: `${reason} Further on-chain tools (CTM holders, treasury balances, contract verification, veCTM logs) are available if the official etherscan MCP is loaded. Ask the operator before add_mcp_server_from_catalog / agent_load_mcp_server.`,
			enable: {
				addFromCatalog: {id: ETHERSCAN_MCP_SERVER_ID},
				addEnvironmentVariable: {name: ETHERSCAN_API_KEY_ENV},
				agentLoadMcpServer: {serverId: ETHERSCAN_MCP_SERVER_ID},
			},
			playbooks: buildCtmEtherscanPlaybooks({
				unlocked: false,
				serverId: ETHERSCAN_MCP_SERVER_ID,
				addresses,
			}),
		},
	};
}

export async function resolveCtmOnChainFollowUp(
	addresses: readonly CtmAddressRow[],
	config: NodeSdkConfig | undefined,
	deps?: CtmFollowUpDeps,
): Promise<CtmOnChainFollowUp> {
	const listFn =
		deps?.listMcpServersFn ??
		(config
			? async (scope: 'active' | 'catalog') => listMcpServers(config, {scope})
			: undefined);
	if (!listFn) {
		return hintFromUnknownScope(
			addresses,
			'Could not check active MCP servers (no node config).',
		);
	}
	const [activeResult, catalogResult] = await Promise.all([
		listFn('active'),
		listFn('catalog'),
	]);
	if (!activeResult.ok) {
		return hintFromUnknownScope(addresses, `Could not list active MCP servers: ${activeResult.reason}`);
	}
	const activeServers =
		activeResult.data.scope === 'active' ? (activeResult.data.activeServers ?? []) : [];
	const catalogServers =
		catalogResult.ok && catalogResult.data.scope === 'catalog'
			? (catalogResult.data.availableCatalog ?? [])
			: [];
	return chooseCtmEtherscanFollowUp({
		activeServers,
		catalogServers,
		addresses,
	});
}
