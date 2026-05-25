import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	getConnectivityHealth,
	getHealth,
	getLogs,
	getMachineInfo,
	getNodeKeySimple,
	getSubscriptions,
	getSuccessRate,
	getVersionSimple,
} from '../detops/node-info.js';
import {
	ConnectivityHealthGroupSchema,
	HealthSchema,
	LogsSchema,
	MachineInfoSchema,
	NodeIdSchema,
	SubscriptionSchema,
	SuccessRateSchema,
} from '../schemas/extended.js';
import {camelToSnake, wrapSdk} from './tool-utils.js';

const VersionSimpleSchema = z.object({
	version: z.string(),
	versionDate: z.string(),
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
		camelToSnake('getNodeKeySimple'),
		{
			description: "Get this node's public key (node ID).",
			outputSchema: z.object({nodeId: NodeIdSchema}),
		},
		async () => wrapSdk(getNodeKeySimple(config)),
	);

	server.registerTool(
		camelToSnake('getVersionSimple'),
		{
			description: 'Get current node version and version date.',
			outputSchema: VersionSimpleSchema,
		},
		async () => wrapSdk(getVersionSimple(config)),
	);
}
