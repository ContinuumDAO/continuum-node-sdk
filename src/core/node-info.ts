import type {NodeSdkConfig} from '../config/schema.js';
import {
	buildManagementQueryPath,
	managementGet,
} from '../api/management-api.js';
import type {SdkResult} from './result.js';
import {
	ConnectivityHealthGroupSchema,
	HealthSchema,
	LogsSchema,
	MachineInfoSchema,
	SubscriptionSchema,
	SuccessRateSchema,
} from '../schemas/extended.js';
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

export async function getHealth(
	config: NodeSdkConfig,
): Promise<SdkResult<z.infer<typeof HealthSchema>>> {
	const result = await managementGet<unknown>(config, '/health');
	if (!result.ok) {
		return result;
	}
	const parsed = HealthSchema.safeParse(result.data);
	if (!parsed.success) {
		return {ok: false, reason: 'Health response failed validation.'};
	}
	return {ok: true, data: parsed.data};
}

export async function getConnectivityHealth(
	config: NodeSdkConfig,
	options: {groupId?: string; timeout?: number} = {},
): Promise<SdkResult<{groups: ConnectivityGroup[]}>> {
	const path = buildManagementQueryPath('/connectivityHealth', {
		groupId: options.groupId,
		timeout:
			options.timeout === undefined ? undefined : String(options.timeout),
	});
	const result = await managementGet<unknown>(config, path);
	if (!result.ok) {
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
