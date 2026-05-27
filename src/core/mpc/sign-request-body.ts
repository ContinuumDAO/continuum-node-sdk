import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../result.js';
import {
	DEFAULT_MANAGEMENT_SIGNING,
	type ManagementSigningMethod,
} from '../../schemas/extended.js';
import {
	buildManagementPostRequest,
	managementSign,
} from '../management-signer.js';
import type {CreateMultiSignRequestResult} from './types.js';
import {mpcPostMultiSignRequest} from './client.js';

function hasManagementCanonicalBase(body: Record<string, unknown>): boolean {
	return (
		typeof body.nonce === 'number' &&
		!Number.isNaN(body.nonce) &&
		typeof body.nodeKey === 'string' &&
		body.nodeKey.trim().length > 0
	);
}

/**
 * Sign a multiSignRequest body and POST /multiSignRequest.
 * Accepts a full unsigned management body or route-only fields (wrapped automatically).
 */
export async function signAndSubmitMultiSignRequest(
	config: NodeSdkConfig,
	body: Record<string, unknown>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<CreateMultiSignRequestResult>> {
	let unsignedBody = body;
	if (!hasManagementCanonicalBase(body)) {
		const built = await buildManagementPostRequest(
			config,
			{
				path: '/multiSignRequest',
				buildRequestFields: () => body,
			},
			signing,
		);
		if (!built.ok) {
			return built;
		}
		unsignedBody = built.data.unsignedBody;
	}

	const signed = await managementSign(config, signing, unsignedBody);
	if (!signed.ok) {
		return signed;
	}

	const posted = await mpcPostMultiSignRequest(config, signed.data);
	if (!posted.ok) {
		return posted;
	}
	return {ok: true, data: {requestId: posted.data}};
}
