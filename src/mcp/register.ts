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
import {registerManagementSignerTools} from './management-signer.js';
import {registerNodeTools} from './node.js';
import {registerAddressBookTools} from './registry/address-book.js';
import {registerChainRegistryTools} from './registry/networks.js';
import {registerTokenRegistryTools} from './registry/tokens.js';
import {registerMpcTools} from './mpc.js';

export function registerContinuumTools(
	server: McpServer,
	config: NodeSdkConfig,
	defiContext?: DefiProtocolContext,
): void {
	registerNodeTools(server, config);
	registerGroupTools(server, config);
	registerManagementSignerTools(server, config);
	registerKeyGenTools(server, config);
	registerAddressBookTools(server, config);
	registerTokenRegistryTools(server, config);
	registerChainRegistryTools(server, config);
	registerMpcTools(server, config);
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
export {
	registerManagementSignerTools,
	registerManagementKeyTools,
} from './management-signer.js';
export {registerAddressBookTools} from './registry/address-book.js';
export {registerTokenRegistryTools} from './registry/tokens.js';
export {registerChainRegistryTools} from './registry/networks.js';
export {registerMpcTools} from './mpc.js';
export {camelToSnake, sdkResultToCallToolResult, wrapSdk} from './tool-utils.js';
