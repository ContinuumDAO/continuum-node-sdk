import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {nodeId, version} from '../core/general.js';
import {
	getConnectivityHealth,
	getHealth,
	getLogs,
	getMachineInfo,
	getSubscriptions,
	getSuccessRate,
	getConfiguredNodeKeys,
} from '../core/node-info.js';
import {
	ConnectivityHealthGroupSchema,
	HealthSchema,
	LogsSchema,
	MachineInfoSchema,
	NodeIdSchema,
	SubscriptionSchema,
	SuccessRateSchema,
	GetConfiguredNodeKeysDataSchema,
} from '../schemas/extended.js';
import {camelToSnake, wrapSdk} from './tool-utils.js';

const VersionSchema = z.object({
	version: z.string(),
	versionDate: z.string(),
	cggmp24UpstreamGitRev: z.string(),
});

export function registerNodeTools(
	server: McpServer,
	config: NodeSdkConfig,
): void {
	server.registerTool(
		camelToSnake('getMachineInfo'),
		{
			description: 'Get machine information (CPU, memory, disk, OS, VPS detection).',
			inputSchema: z.object({refresh: z.boolean().optional()}),
			outputSchema: MachineInfoSchema,
		},
		async ({refresh}: {refresh?: boolean}) =>
			wrapSdk(getMachineInfo(config, {refresh})),
	);

	server.registerTool(
		camelToSnake('getSuccessRate'),
		{
			description: 'Get keygen/sign success-rate statistics.',
			inputSchema: z.object({hours: z.number().int().nonnegative().optional()}),
			outputSchema: SuccessRateSchema,
		},
		async ({hours}: {hours?: number}) =>
			wrapSdk(getSuccessRate(config, {hours})),
	);

	server.registerTool(
		camelToSnake('getSubscriptions'),
		{
			description: 'Get current MQTT subscription information.',
			outputSchema: z.object({subscriptions: z.array(SubscriptionSchema)}),
		},
		async () => wrapSdk(getSubscriptions(config)),
	);

	server.registerTool(
		camelToSnake('getHealth'),
		{
			description: 'Get comprehensive node health status.',
			outputSchema: HealthSchema,
		},
		async () => wrapSdk(getHealth(config)),
	);

	server.registerTool(
		camelToSnake('getConnectivityHealth'),
		{
			description: 'Check per-node connectivity and latency by group.',
			inputSchema: z.object({
				groupId: z.string().optional(),
				timeout: z.number().int().positive().optional(),
			}),
			outputSchema: z.object({groups: z.array(ConnectivityHealthGroupSchema)}),
		},
		async ({
			groupId,
			timeout,
		}: {
			groupId?: string;
			timeout?: number;
		}) => wrapSdk(getConnectivityHealth(config, {groupId, timeout})),
	);

	server.registerTool(
		camelToSnake('getLogs'),
		{
			description: 'Get recent node logs.',
			inputSchema: z.object({hours: z.number().int().nonnegative().optional()}),
			outputSchema: LogsSchema,
		},
		async ({hours}: {hours?: number}) => wrapSdk(getLogs(config, {hours})),
	);

	server.registerTool(
		camelToSnake('nodeId'),
		{
			description: "Get this node's public key (node ID).",
			outputSchema: z.object({nodeId: NodeIdSchema}),
		},
		async () => wrapSdk(nodeId(config)),
	);

	server.registerTool(
		camelToSnake('version'),
		{
			description: 'Get current node version and version date.',
			outputSchema: VersionSchema,
		},
		async () => wrapSdk(version(config)),
	);

	server.registerTool(
		camelToSnake('getConfiguredNodeKeys'),
		{
			description:
				'Get node public keys for all configured peer addresses (GET /getConfiguredNodeKeys). Use before create_group_request to pick valid nodeIds. Search tags: group, peers.',
			inputSchema: z.object({}).strict(),
			outputSchema: GetConfiguredNodeKeysDataSchema,
		},
		async () => wrapSdk(getConfiguredNodeKeys(config)),
	);
}
