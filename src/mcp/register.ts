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
import {registerAgentMcpServerTools} from './agent-mcp-servers.js';
import {promises as fs} from 'node:fs';
import path from 'node:path';

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
	registerAgentMcpServerTools(server, config);
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

  function registerMarkdownResource(
    name: string,
    filename: string,
    description: string,
  ): void {
    const uri = `docs://${filename}`;
    server.registerResource(
      name,
      uri,
      {description, mimeType: 'text/markdown'},
      async () => {
        const filePath = path.join(
          process.cwd(),
          'src/mcp/resources',
          filename,
        );
        const text = await fs.readFile(filePath, 'utf8');
        return {
          contents: [
            {
              uri,
              mimeType: 'text/markdown',
              text,
            },
          ],
        };
      },
    );
  }

  registerMarkdownResource(
    'overview_docs',
    'overview.md',
    'High-level MCP host overview for this server.',
  );
  registerMarkdownResource(
    'group_docs',
    'group.md',
    'Group creation flow and validation rules.',
  );
  registerMarkdownResource(
    'sign_docs',
    'sign.md',
    'Modular signing flow and reusable signing tools.',
  );
  registerMarkdownResource(
    'management_signer_docs',
    'management-signer.md',
    'Management signer lifecycle, MCP tools, and local key requirements.',
  );
  registerMarkdownResource(
    'keygen_docs',
    'keygen.md',
    'Key generation request, acceptance, and result flow.',
  );
  registerMarkdownResource(
    'address_book_registry_docs',
    'registry/address-book.md',
    'Address book registry tools and workflows.',
  );
  registerMarkdownResource(
    'token_registry_docs',
    'registry/tokens.md',
    'Saved token registry tools and workflows.',
  );
  registerMarkdownResource(
    'chain_registry_docs',
    'registry/networks.md',
    'Chain registry tools and workflows.',
  );
  registerMarkdownResource(
    'mpc_docs',
    'mpc.md',
    'MPC multi-sign requests, Get Sig, Execute, and MPA workflows.',
  );
  registerMarkdownResource(
    'agent_mcp_servers_docs',
    'agent-mcp-servers.md',
    'Agent MCP server catalog: list, add, and remove node MCP integrations.',
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
export {
	registerManagementSignerTools,
	registerManagementKeyTools,
} from './management-signer.js';
export {registerAddressBookTools} from './registry/address-book.js';
export {registerTokenRegistryTools} from './registry/tokens.js';
export {registerChainRegistryTools} from './registry/networks.js';
export {registerMpcTools} from './mpc.js';
export {registerAgentMcpServerTools} from './agent-mcp-servers.js';
export {camelToSnake, sdkResultToCallToolResult, wrapSdk} from './tool-utils.js';
