import type {NodeSdkConfig} from '../../config/schema.js';
import {managementGet, managementPost} from '../../api/management-api.js';
import {
	DEFAULT_MANAGEMENT_SIGNING,
	type ManagementSigningMethod,
} from '../../schemas/extended.js';
import type {SdkResult} from '../result.js';
import {
	buildManagementPostRequest,
	managementSign,
	toSelectedSigner,
} from '../management-signer.js';

export async function postSignedManagementRequest(
	config: NodeSdkConfig,
	path: string,
	buildRequestFields: (
		ctx: {nodeKey: string},
	) => Record<string, unknown> | Promise<Record<string, unknown>>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		data: Record<string, unknown>;
		selectedSigningKey?: ReturnType<typeof toSelectedSigner>;
		signingMessage: string;
	}>
> {
	const built = await buildManagementPostRequest(
		config,
		{path, buildRequestFields: ctx => buildRequestFields({nodeKey: ctx.nodeKey})},
		signing,
	);
	if (!built.ok) return built;

	const signed = await managementSign(config, signing, built.data.unsignedBody, {
		publicKey: built.data.selectedSigningKey?.value,
	});
	if (!signed.ok) return signed;

	const posted = await managementPost<unknown>(config, path, signed.data);
	if (!posted.ok) return posted;

	const data =
		posted.data != null && typeof posted.data === 'object' && !Array.isArray(posted.data)
			? (posted.data as Record<string, unknown>)
			: {raw: posted.data};

	return {
		ok: true,
		data: {
			data,
			selectedSigningKey: built.data.selectedSigningKey
				? toSelectedSigner(built.data.selectedSigningKey)
				: undefined,
			signingMessage: built.data.canonicalJson,
		},
	};
}

export async function getManagementRecord(
	config: NodeSdkConfig,
	path: string,
): Promise<SdkResult<Record<string, unknown>>> {
	const result = await managementGet<unknown>(config, path);
	if (!result.ok) return result;
	if (result.data != null && typeof result.data === 'object' && !Array.isArray(result.data)) {
		return {ok: true, data: result.data as Record<string, unknown>};
	}
	return {ok: false, reason: 'Unexpected VPN API response shape.'};
}
