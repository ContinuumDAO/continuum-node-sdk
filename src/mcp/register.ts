import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	DefiProtocolContext,
	type CreateContinuumMcpServerOptions,
} from './defi/context.js';
import {registerDefiDiscoveryTools} from './defi/discovery.js';
import {registerAllDefiProtocolTools} from './defi/register-protocol-tools.js';
import {registerGroupTools} from './group.js';
import {registerKeyGenTools} from './keygen.js';
import {registerKeyGenMessagingTools} from './keygen-messaging.js';
import {registerManagementSignerTools} from './management-signer.js';
import {registerMcpMarkdownResource} from './mcp-resources.js';
import {registerNodeTools} from './node.js';
import {registerAddressBookTools} from './registry/address-book.js';
import {registerChainRegistryTools} from './registry/networks.js';
import {registerTokenRegistryTools} from './registry/tokens.js';
import {registerMpcTools} from './mpc.js';
import {registerAgentMcpServerTools} from './agent-mcp-servers.js';
import {registerAgentEnvironmentVariableTools} from './agent-environment-variables.js';
import {registerAgentCronJobTools} from './agent-cron-jobs.js';
import {registerAgentWebhookTools} from './agent-webhooks.js';
import {registerAgentSkillTools} from './agent-skills.js';
import {registerChartTools} from './chart.js';

export function registerContinuumTools(
	server: McpServer,
	config: NodeSdkConfig,
	defiContext?: DefiProtocolContext,
): void {
	registerNodeTools(server, config);
	registerGroupTools(server, config);
	registerManagementSignerTools(server, config);
	registerKeyGenTools(server, config);
	registerKeyGenMessagingTools(server, config);
	registerAddressBookTools(server, config);
	registerTokenRegistryTools(server, config);
	registerChainRegistryTools(server, config);
	registerMpcTools(server, config);
	registerAgentMcpServerTools(server, config);
	registerAgentEnvironmentVariableTools(server, config);
	registerAgentCronJobTools(server, config);
	registerAgentWebhookTools(server, config);
	registerAgentSkillTools(server, config);
	registerChartTools(server);
	if (defiContext) {
		registerDefiDiscoveryTools(server, config, defiContext);
		registerAllDefiProtocolTools(server, config, defiContext);
	}
}

export function createContinuumMcpServer(
	config: NodeSdkConfig,
	options: CreateContinuumMcpServerOptions = {},
): McpServer {
	const defiContext = options.defiContext ?? new DefiProtocolContext();
	const server = new McpServer(
		{
			name: 'continuum-mcp',
			version: '1.0.0',
		},
		{
			capabilities: {
				tools: {
					listChanged: true,
				},
			},
		},
	);

	registerContinuumTools(server, config, defiContext);

	registerMcpMarkdownResource(
		server,
		'overview_docs',
		'overview.md',
		'High-level MCP host overview for this server.',
	);
	registerMcpMarkdownResource(
		server,
		'group_docs',
		'group.md',
		'Group creation flow and validation rules.',
	);
	registerMcpMarkdownResource(
		server,
		'sign_docs',
		'sign.md',
		'Modular signing flow and reusable signing tools.',
	);
	registerMcpMarkdownResource(
		server,
		'management_signer_docs',
		'management-signer.md',
		'Management signer lifecycle, MCP tools, and local key requirements.',
	);
	registerMcpMarkdownResource(
		server,
		'keygen_docs',
		'keygen.md',
		'Key generation request, acceptance, and result flow.',
	);
	registerMcpMarkdownResource(
		server,
		'address_book_registry_docs',
		'registry/address-book.md',
		'Address book registry tools and workflows.',
	);
	registerMcpMarkdownResource(
		server,
		'token_registry_docs',
		'registry/tokens.md',
		'Saved token registry tools and workflows.',
	);
	registerMcpMarkdownResource(
		server,
		'chain_registry_docs',
		'registry/networks.md',
		'Chain registry tools and workflows.',
	);
	registerMcpMarkdownResource(
		server,
		'mpc_docs',
		'mpc.md',
		'MPC multi-sign requests, Get Sig, Execute, and MPA workflows.',
	);
	registerMcpMarkdownResource(
		server,
		'agent_mcp_servers_docs',
		'agent-mcp-servers.md',
		'Agent MCP server catalog: list, add, and remove node MCP integrations.',
	);
	registerMcpMarkdownResource(
		server,
		'agent_cron_jobs_docs',
		'agent-cron-jobs.md',
		'Agent cron jobs: scheduled agent tasks, run history, and lifecycle.',
	);
	registerMcpMarkdownResource(
		server,
		'agent_webhooks_docs',
		'agent-webhooks.md',
		'Agent inbound webhooks: list, add, activate, and test HTTP hook jobs.',
	);
	registerMcpMarkdownResource(
		server,
		'agent_skills_docs',
		'agent-skills.md',
		'Agent skills: local markdown/txt guidance files and initialLoad behavior.',
	);
	registerMcpMarkdownResource(
		server,
		'chart_docs',
		'chart.md',
		'Agent chat charts: prepare_chart_from_rows, prepare_chart, OHLCV normalization, and indicator overlays.',
	);

	server.server.oninitialized = () => {
		void server.server.sendToolListChanged().catch(error => {
			console.error('Failed to send tools/list_changed notification:', error);
		});
	};

	return server;
}

export {registerNodeTools} from './node.js';
export {registerGroupTools} from './group.js';
export {registerKeyGenTools, registerKeygenTools} from './keygen.js';
export {registerKeyGenMessagingTools} from './keygen-messaging.js';
export {
	registerManagementSignerTools,
	registerManagementKeyTools,
} from './management-signer.js';
export {registerAddressBookTools} from './registry/address-book.js';
export {registerTokenRegistryTools} from './registry/tokens.js';
export {registerChainRegistryTools} from './registry/networks.js';
export {registerMpcTools} from './mpc.js';
export {
	registerVpnTools,
	registerVpnResources,
	createVpnMcpServer,
} from './vpn.js';
export {registerTaTools, registerTaResources, createTaMcpServer} from './ta/register.js';
export {registerAgentMcpServerTools} from './agent-mcp-servers.js';
export {registerAgentCronJobTools} from './agent-cron-jobs.js';
export {registerAgentWebhookTools} from './agent-webhooks.js';
export {registerAgentSkillTools} from './agent-skills.js';
export {camelToSnake, sdkResultToCallToolResult, wrapSdk} from './tool-utils.js';
