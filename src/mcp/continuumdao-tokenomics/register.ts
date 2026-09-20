import { McpServer } from "@modelcontextprotocol/server";
import type {NodeSdkConfig} from '../../config/schema.js';
import {
	GetCtmMetricsInputSchema,
	GetCtmMetricsOutputSchema,
	GetCtmOnChainFollowupsInputSchema,
	GetCtmOnChainFollowupsOutputSchema,
	GetCtmProtocolAddressesInputSchema,
	GetCtmProtocolAddressesToolOutputSchema,
	GetCtmTokenomicsSnapshotInputSchema,
	GetCtmTokenomicsSnapshotOutputSchema,
	GetVeCtmLockedForAddressesInputSchema,
	GetVeCtmLockedForAddressesToolOutputSchema,
	GetVeCtmPositionInputSchema,
	GetVeCtmPositionToolOutputSchema,
	GetVeCtmTokensInputSchema,
	GetVeCtmTokensToolOutputSchema,
	getCtmMetrics,
	getCtmProtocolAddressesTool,
	getCtmTokenomicsSnapshot,
	getVeCtmLockedForAddressesTool,
	getVeCtmPositionTool,
	getVeCtmTokensTool,
	listCtmOnChainFollowups,
} from '../../core/continuumdao-tokenomics/index.js';
import {registerMcpMarkdownResource} from '../mcp-resources.js';
import {sdkResultToCallToolResult} from '../tool-utils.js';

export function registerContinuumDaoTokenomicsTools(
	server: McpServer,
	config: NodeSdkConfig,
): void {
	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		'get_ctm_metrics',
		{
			description:
				'Live ContinuumDAO token metrics from app-api.continuumdao.org GET /metrics: escrowed, totalSupply, circulatingSupply, totalPower, holders, avgLockDuration. circulatingSupply is unlocked CTM outside the Linea treasury (crawler formula), not the White Paper “all locked in veCTM” figure. Includes onChainFollowUp for official etherscan MCP playbooks. No API key. Not an OHLCV source.',
			inputSchema: GetCtmMetricsInputSchema,
			outputSchema: GetCtmMetricsOutputSchema,
		},
		async () => sdkResultToCallToolResult(await getCtmMetrics(config)),
	);

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		'get_ctm_protocol_addresses',
		{
			description:
				'Live ContinuumDAO contract addresses: GET app-api /protocol/* (CTM, veCTM, governor, C3Governor, Distribution, networks) plus VotingEscrow views (nodeProperties, rewards, treasury) and NodeProperties.msaw(). Each row has explorerUrl (Etherscan / Lineascan). API rows are canonical. Includes onChainFollowUp for etherscan. No API key. Not an OHLCV source.',
			inputSchema: GetCtmProtocolAddressesInputSchema,
			outputSchema: GetCtmProtocolAddressesToolOutputSchema,
		},
		async () => sdkResultToCallToolResult(await getCtmProtocolAddressesTool(config)),
	);

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		'get_ve_ctm_position',
		{
			description:
				'veCTM position for a wallet: CTM locked via VotingEscrow.locked(tokenId) (amount + unlock time), per-NFT voting power, plus address-level getVotes, delegates, last Governor VoteCast, and lockedTotal. Requires a 0x address. Lineascan links and onChainFollowUp for etherscan. No API key. Not an OHLCV source.',
			inputSchema: GetVeCtmPositionInputSchema,
			outputSchema: GetVeCtmPositionToolOutputSchema,
		},
		async input => sdkResultToCallToolResult(await getVeCtmPositionTool(input, config)),
	);

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		'get_ve_ctm_tokens',
		{
			description:
				'Paginated or batched veCTM NFTs from GET /tokens (page 0 = newest, or ids up to 50). Locked CTM and unlock time come from VotingEscrow.locked(tokenId). Also NFT voting power, owner getVotes, and last Governor vote when readable. Lineascan NFT links and onChainFollowUp for etherscan. No API key. Not an OHLCV source.',
			inputSchema: GetVeCtmTokensInputSchema,
			outputSchema: GetVeCtmTokensToolOutputSchema,
		},
		async input => sdkResultToCallToolResult(await getVeCtmTokensTool(input, config)),
	);

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		'get_ve_ctm_locked_for_addresses',
		{
			description:
				'For one or more wallets (max 25) — including Etherscan top-holder addresses — return CTM locked in veCTM via VotingEscrow.locked(tokenId) per NFT and a per-address lockedTotal. This is escrowed CTM, not ERC-20 wallet balance. No API key. Not an OHLCV source.',
			inputSchema: GetVeCtmLockedForAddressesInputSchema,
			outputSchema: GetVeCtmLockedForAddressesToolOutputSchema,
		},
		async input =>
			sdkResultToCallToolResult(await getVeCtmLockedForAddressesTool(input, config)),
	);

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		'get_ctm_tokenomics_snapshot',
		{
			description:
				'Compose live CTM metrics + protocol/VE-derived addresses + White Paper allocation note. Use search_continuum_docs for narrative tokenomics; do not invent live allocation percentages. Includes onChainFollowUp for etherscan. No API key. Not an OHLCV source.',
			inputSchema: GetCtmTokenomicsSnapshotInputSchema,
			outputSchema: GetCtmTokenomicsSnapshotOutputSchema,
		},
		async () => sdkResultToCallToolResult(await getCtmTokenomicsSnapshot(config)),
	);

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		'list_ctm_onchain_followups',
		{
			description:
				'What else is possible if the official etherscan MCP is loaded: prefills for token info, top holders (then get_ve_ctm_locked_for_addresses for per-wallet locked CTM), treasury balances, transfers, contract verification, veCTM logs, governor txs. If etherscan is not active or ETHERSCAN_API_KEY is missing, explains how to add it. Ask the operator before add_mcp_server_from_catalog / agent_load_mcp_server. Do not auto-load. Not an OHLCV source.',
			inputSchema: GetCtmOnChainFollowupsInputSchema,
			outputSchema: GetCtmOnChainFollowupsOutputSchema,
		},
		async () => sdkResultToCallToolResult(await listCtmOnChainFollowups(config)),
	);
}

export function registerContinuumDaoTokenomicsResources(server: McpServer): void {
	registerMcpMarkdownResource(
		server,
		'continuumdao_tokenomics_docs',
		'continuumdao-tokenomics.md',
		'ContinuumDAO tokenomics MCP: circulating supply, protocol addresses, veCTM positions, locked CTM per holder address, etherscan follow-ups.',
	);
}

export function createContinuumDaoTokenomicsMcpServer(config: NodeSdkConfig): McpServer {
	const server = new McpServer(
		{
			name: 'continuum-dao-tokenomics-mcp',
			version: '1.0.0',
		},
		{
			capabilities: {
				tools: {},
			},
		},
	);

	registerContinuumDaoTokenomicsTools(server, config);
	registerContinuumDaoTokenomicsResources(server);

	return server;
}
