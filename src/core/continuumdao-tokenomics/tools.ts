import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../result.js';
import type {ContinuumDaoAddressDeps} from './addresses.js';
import {getCtmProtocolAddresses} from './addresses.js';
import type {ContinuumDaoApiDeps} from './client.js';
import {ALLOCATION_NOTE} from './constants.js';
import type {CtmFollowUpDeps} from './etherscan-followups.js';
import {resolveCtmOnChainFollowUp} from './etherscan-followups.js';
import {getCtmMetricsDecoded} from './metrics.js';
import type {
	GetCtmMetricsOutput,
	GetCtmProtocolAddressesToolOutput,
	GetCtmTokenomicsSnapshotOutput,
	GetVeCtmPositionInput,
	GetVeCtmPositionToolOutput,
	GetVeCtmLockedForAddressesInput,
	GetVeCtmLockedForAddressesToolOutput,
	GetVeCtmTokensInput,
	GetVeCtmTokensToolOutput,
} from './schemas.js';
import {
	getVeCtmLockedForAddresses,
	getVeCtmPosition,
	getVeCtmTokens,
} from './tokens.js';

export type CtmTokenomicsDeps = ContinuumDaoAddressDeps & CtmFollowUpDeps;

export async function getCtmMetrics(
	config?: NodeSdkConfig,
	deps?: CtmTokenomicsDeps,
): Promise<SdkResult<GetCtmMetricsOutput>> {
	const [metrics, addresses] = await Promise.all([
		getCtmMetricsDecoded(deps),
		getCtmProtocolAddresses(deps),
	]);
	if (!metrics.ok) {
		return metrics;
	}
	const rows = addresses.ok ? addresses.data.addresses : [];
	const onChainFollowUp = await resolveCtmOnChainFollowUp(rows, config, deps);
	return {
		ok: true,
		data: {
			...metrics.data,
			onChainFollowUp,
		},
	};
}

export async function getCtmProtocolAddressesTool(
	config?: NodeSdkConfig,
	deps?: CtmTokenomicsDeps,
): Promise<SdkResult<GetCtmProtocolAddressesToolOutput>> {
	const addresses = await getCtmProtocolAddresses(deps);
	if (!addresses.ok) {
		return addresses;
	}
	const onChainFollowUp = await resolveCtmOnChainFollowUp(
		addresses.data.addresses,
		config,
		deps,
	);
	return {
		ok: true,
		data: {
			...addresses.data,
			onChainFollowUp,
		},
	};
}

export async function getVeCtmPositionTool(
	input: GetVeCtmPositionInput,
	config?: NodeSdkConfig,
	deps?: CtmTokenomicsDeps,
): Promise<SdkResult<GetVeCtmPositionToolOutput>> {
	const [position, addresses] = await Promise.all([
		getVeCtmPosition(input, deps),
		getCtmProtocolAddresses(deps),
	]);
	if (!position.ok) {
		return position;
	}
	const rows = addresses.ok ? addresses.data.addresses : [];
	const onChainFollowUp = await resolveCtmOnChainFollowUp(rows, config, deps);
	return {
		ok: true,
		data: {
			...position.data,
			onChainFollowUp,
		},
	};
}

export async function getVeCtmTokensTool(
	input: GetVeCtmTokensInput,
	config?: NodeSdkConfig,
	deps?: CtmTokenomicsDeps,
): Promise<SdkResult<GetVeCtmTokensToolOutput>> {
	const [tokens, addresses] = await Promise.all([
		getVeCtmTokens(input, deps),
		getCtmProtocolAddresses(deps),
	]);
	if (!tokens.ok) {
		return tokens;
	}
	const rows = addresses.ok ? addresses.data.addresses : [];
	const onChainFollowUp = await resolveCtmOnChainFollowUp(rows, config, deps);
	return {
		ok: true,
		data: {
			...tokens.data,
			onChainFollowUp,
		},
	};
}

export async function getVeCtmLockedForAddressesTool(
	input: GetVeCtmLockedForAddressesInput,
	config?: NodeSdkConfig,
	deps?: CtmTokenomicsDeps,
): Promise<SdkResult<GetVeCtmLockedForAddressesToolOutput>> {
	const [locked, addresses] = await Promise.all([
		getVeCtmLockedForAddresses(input, deps),
		getCtmProtocolAddresses(deps),
	]);
	if (!locked.ok) {
		return locked;
	}
	const rows = addresses.ok ? addresses.data.addresses : [];
	const onChainFollowUp = await resolveCtmOnChainFollowUp(rows, config, deps);
	return {
		ok: true,
		data: {
			...locked.data,
			onChainFollowUp,
		},
	};
}

export async function getCtmTokenomicsSnapshot(
	config?: NodeSdkConfig,
	deps?: CtmTokenomicsDeps,
): Promise<SdkResult<GetCtmTokenomicsSnapshotOutput>> {
	const [metrics, addresses] = await Promise.all([
		getCtmMetricsDecoded(deps),
		getCtmProtocolAddresses(deps),
	]);
	if (!metrics.ok) {
		return metrics;
	}
	if (!addresses.ok) {
		return addresses;
	}
	const onChainFollowUp = await resolveCtmOnChainFollowUp(
		addresses.data.addresses,
		config,
		deps,
	);
	return {
		ok: true,
		data: {
			metrics: metrics.data,
			addresses: addresses.data.addresses,
			networks: addresses.data.networks,
			warnings: addresses.data.warnings,
			allocationNote: ALLOCATION_NOTE,
			onChainFollowUp,
		},
	};
}

export async function listCtmOnChainFollowups(
	config?: NodeSdkConfig,
	deps?: CtmTokenomicsDeps,
): Promise<SdkResult<GetCtmProtocolAddressesToolOutput['onChainFollowUp']>> {
	const addresses = await getCtmProtocolAddresses(deps);
	const rows = addresses.ok ? addresses.data.addresses : [];
	const onChainFollowUp = await resolveCtmOnChainFollowUp(rows, config, deps);
	return {ok: true, data: onChainFollowUp};
}

export type {ContinuumDaoApiDeps};
