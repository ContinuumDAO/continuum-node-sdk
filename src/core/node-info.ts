import type {NodeSdkConfig} from '../config/schema.js';
import {
	buildManagementQueryPath,
	managementGet,
} from '../api/management-api.js';
import {connectivityHealthFetchTimeoutMs} from './connectivity-health-timeout.js';
import type {SdkResult} from './result.js';
import {
	ConnectivityHealthGroupSchema,
	DockerUpdateStatusDataSchema,
	HealthSchema,
	LogsSchema,
	MachineInfoSchema,
	NODE_CONFIG_API_PATHS,
	SubscriptionSchema,
	SuccessRateSchema,
	ConfiguredNodeKeySchema,
	GetConfiguredNodeKeysDataSchema,
} from '../schemas/extended.js';
import {version} from './general.js';
import {z} from 'zod';

type Subscription = z.infer<typeof SubscriptionSchema>;
type ConnectivityGroup = z.infer<typeof ConnectivityHealthGroupSchema>;

export async function getMachineInfo(
	config: NodeSdkConfig,
	options: {refresh?: boolean} = {},
): Promise<SdkResult<z.infer<typeof MachineInfoSchema>>> {
	const path = buildManagementQueryPath('/getMachineInfo', {
		refresh:
			options.refresh === undefined ? undefined : String(options.refresh),
	});
	const result = await managementGet<unknown>(config, path);
	if (!result.ok) {
		return result;
	}
	const parsed = MachineInfoSchema.safeParse(result.data);
	if (!parsed.success) {
		return {ok: false, reason: 'Machine info response failed validation.'};
	}
	return {ok: true, data: parsed.data};
}

export async function getSuccessRate(
	config: NodeSdkConfig,
	options: {hours?: number} = {},
): Promise<SdkResult<z.infer<typeof SuccessRateSchema>>> {
	const path = buildManagementQueryPath('/getSuccessRate', {
		hours: options.hours === undefined ? undefined : String(options.hours),
	});
	const result = await managementGet<unknown>(config, path);
	if (!result.ok) {
		return result;
	}
	const parsed = SuccessRateSchema.safeParse(result.data);
	if (!parsed.success) {
		return {ok: false, reason: 'Success rate response failed validation.'};
	}
	return {ok: true, data: parsed.data};
}

export async function getSubscriptions(
	config: NodeSdkConfig,
): Promise<SdkResult<{subscriptions: Subscription[]}>> {
	const result = await managementGet<unknown>(config, '/getSubscriptions');
	if (!result.ok) {
		return result;
	}
	const list = Array.isArray(result.data) ? result.data : [];
	const subscriptions = [];
	for (const entry of list) {
		const parsed = SubscriptionSchema.safeParse(entry);
		if (parsed.success) {
			subscriptions.push(parsed.data);
		}
	}
	return {ok: true, data: {subscriptions}};
}

export async function getDockerUpdateStatus(
	config: NodeSdkConfig,
): Promise<SdkResult<z.infer<typeof DockerUpdateStatusDataSchema>>> {
	const result = await managementGet<unknown>(config, NODE_CONFIG_API_PATHS.dockerUpdateStatus);
	if (!result.ok) {
		return result;
	}
	const parsed = DockerUpdateStatusDataSchema.safeParse(result.data);
	if (!parsed.success) {
		return {ok: false, reason: 'GET /maintenance/dockerUpdateStatus response failed validation.'};
	}
	const data = {...parsed.data};
	if (!data.runningVersion?.trim()) {
		const running = await version(config);
		if (running.ok) {
			data.runningVersion = running.data.version;
			if (!data.runningVersionDate?.trim()) {
				data.runningVersionDate = running.data.versionDate;
			}
		}
	}
	return {ok: true, data};
}

export async function getHealth(
	config: NodeSdkConfig,
): Promise<SdkResult<z.infer<typeof HealthSchema>>> {
	const result = await managementGet<unknown>(config, '/health');
	if (!result.ok) {
		return result;
	}
	const parsed = HealthSchema.safeParse(result.data);
	if (!parsed.success) {
		const detail = parsed.error.issues
			.map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
			.join('; ');
		return {
			ok: false,
			reason: detail
				? `Health response failed validation. ${detail}`
				: 'Health response failed validation.',
		};
	}
	return {ok: true, data: parsed.data};
}

export {connectivityHealthFetchTimeoutMs} from './connectivity-health-timeout.js';

export async function getConnectivityHealth(
	config: NodeSdkConfig,
	options: {groupId?: string; timeout?: number} = {},
): Promise<SdkResult<{groups: ConnectivityGroup[]}>> {
	const path = buildManagementQueryPath('/connectivityHealth', {
		groupId: options.groupId,
		timeout:
			options.timeout === undefined ? undefined : String(options.timeout),
	});
	const result = await managementGet<unknown>(config, path, {
		timeoutMs: connectivityHealthFetchTimeoutMs(options.timeout),
	});
	if (!result.ok) {
		if (/abort/i.test(result.reason)) {
			return {
				ok: false,
				reason: `Connectivity health request timed out waiting for /connectivityHealth. ${result.reason}`,
			};
		}
		return result;
	}
	const rawGroups = Array.isArray(result.data)
		? result.data
		: typeof result.data === 'object' &&
				result.data !== null &&
				Array.isArray((result.data as {groups?: unknown[]}).groups)
			? (result.data as {groups: unknown[]}).groups
			: [];
	const groups = [];
	for (const entry of rawGroups) {
		const parsed = ConnectivityHealthGroupSchema.safeParse(entry);
		if (parsed.success) {
			groups.push(parsed.data);
		}
	}
	return {ok: true, data: {groups}};
}

export async function getLogs(
	config: NodeSdkConfig,
	options: {hours?: number} = {},
): Promise<SdkResult<z.infer<typeof LogsSchema>>> {
	const path = buildManagementQueryPath('/getLogs', {
		hours: options.hours === undefined ? undefined : String(options.hours),
	});
	const result = await managementGet<unknown>(config, path);
	if (!result.ok) {
		return result;
	}
	const parsed = LogsSchema.safeParse(result.data);
	if (!parsed.success) {
		return {ok: false, reason: 'Logs response failed validation.'};
	}
	return {ok: true, data: parsed.data};
}

type ConfiguredNodesApiData = {
	nodes?: Array<{
		address?: string;
		available?: boolean;
		publicKey?: string;
	}>;
	total?: number;
	available?: number;
	unavailable?: number;
};

/** GET /getConfiguredNodeKeys — peer node keys for configured addresses. */
export async function getConfiguredNodeKeys(
	config: NodeSdkConfig,
): Promise<SdkResult<z.infer<typeof GetConfiguredNodeKeysDataSchema>>> {
	const result = await managementGet<ConfiguredNodesApiData>(
		config,
		'/getConfiguredNodeKeys',
	);
	if (!result.ok) {
		return result;
	}
	const nodes = [];
	for (const node of result.data.nodes ?? []) {
		const parsed = ConfiguredNodeKeySchema.safeParse({
			address: String(node.address ?? ''),
			available: Boolean(node.available),
			publicKey: String(node.publicKey ?? ''),
		});
		if (parsed.success && parsed.data.publicKey) {
			nodes.push(parsed.data);
		}
	}
	const payload = {
		nodes,
		...(result.data.total !== undefined ? {total: result.data.total} : {}),
		...(result.data.available !== undefined
			? {available: result.data.available}
			: {}),
		...(result.data.unavailable !== undefined
			? {unavailable: result.data.unavailable}
			: {}),
	};
	const validated = GetConfiguredNodeKeysDataSchema.safeParse(payload);
	if (!validated.success) {
		return {
			ok: false,
			reason: 'Configured node keys response failed validation.',
		};
	}
	return {ok: true, data: validated.data};
}
