import type {NodeSdkConfig} from '../config/schema.js';
import {managementGet} from '../api/management-api.js';
import type {SdkResult} from './result.js';
import {NodeIdResponseSchema, VersionResponseSchema} from './schemas.js';
import {NodeIdSchema} from './types.js';

export async function nodeId(
	config: NodeSdkConfig,
): Promise<SdkResult<{nodeId: string}>> {
	const result = await managementGet<string>(config, '/getNodeKey');
	if (!result.ok) {
		return result;
	}

	const parsed = NodeIdSchema.safeParse(result.data);
	if (!parsed.success) {
		return {ok: false, reason: 'Node ID response failed validation.'};
	}

	const response = NodeIdResponseSchema.safeParse({nodeId: parsed.data});
	if (!response.success) {
		return {ok: false, reason: 'Node ID response failed validation.'};
	}

	return {ok: true, data: response.data};
}

type VersionApiData = {
	version?: string;
	versionDate?: string;
	cggmp24UpstreamGitRev?: string;
};

export async function version(
	config: NodeSdkConfig,
): Promise<
	SdkResult<{
		version: string;
		versionDate: string;
		cggmp24UpstreamGitRev: string;
	}>
> {
	const result = await managementGet<VersionApiData>(config, '/version');
	if (!result.ok) {
		return result;
	}

	const parsed = VersionResponseSchema.safeParse({
		version: result.data.version ?? '',
		versionDate: result.data.versionDate ?? '',
		cggmp24UpstreamGitRev: result.data.cggmp24UpstreamGitRev ?? '',
	});
	if (!parsed.success) {
		return {ok: false, reason: 'Version response failed validation.'};
	}

	return {ok: true, data: parsed.data};
}
