import type {NodeSdkConfig} from '../config/schema.js';
import {managementGet} from '../api/management-api.js';
import type {SdkResult} from '../detops/result.js';
import {
	AllGroupIdsResponseSchema,
	MpcKeyInfoSchema,
	MpcKeysResponseSchema,
	type MpcKeyInfo,
} from '../detops/schemas.js';

export type {MpcKeyInfo} from '../detops/schemas.js';

export async function fetchMpcKeys(
	config: NodeSdkConfig,
): Promise<SdkResult<{keys: MpcKeyInfo[]}>> {
	const result = await managementGet<unknown>(config, '/getAllGroupIds');
	if (!result.ok) {
		return result;
	}

	const parsedGroups = AllGroupIdsResponseSchema.safeParse(result.data);
	if (!parsedGroups.success) {
		return {ok: false, reason: 'MPC keys response failed validation.'};
	}

	const keys: MpcKeyInfo[] = [];
	for (const group of parsedGroups.data.groups ?? []) {
		for (const keyGen of group.keyGens ?? []) {
			const pubKeyHex = keyGen.pubkeyhex?.trim() ?? '';
			if (pubKeyHex.length === 0) {
				continue;
			}

			const mapped = {
				pubKeyHex,
				keyType: keyGen.keytype ?? 'unknown',
				threshold: keyGen.threshold ?? 0,
				members: keyGen.keylist?.length ?? 0,
				address: keyGen.ethereumaddress ?? '',
			};
			const validated = MpcKeyInfoSchema.safeParse(mapped);
			if (validated.success) {
				keys.push(validated.data);
			}
		}
	}

	const response = MpcKeysResponseSchema.safeParse({keys});
	if (!response.success) {
		return {ok: false, reason: 'MPC keys response failed validation.'};
	}

	return {ok: true, data: response.data};
}
