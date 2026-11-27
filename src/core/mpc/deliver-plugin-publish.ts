import type {NodeSdkConfig} from '../../config/schema.js';
import {managementPost} from '../../api/management-api.js';
import {
	buildManagementPostRequest,
	managementSign,
} from '../management-signer.js';
import {
	DEFAULT_MANAGEMENT_SIGNING,
	type ManagementSigningMethod,
} from '../../schemas/extended.js';
import type {SdkResult} from '../result.js';
import {mpcGetSignRequestById} from './client.js';
import {isMpaPluginReleaseSignRequest} from './eip712-sign-request.js';

function publishReceipt(data: unknown): string {
	if (typeof data === 'string' && data.trim()) return data.trim();
	return 'Plugin published.';
}

/**
 * Finish a plugin catalog release. The dashboard calls the same management route
 * from the Publish plugin button. A release that is already on the catalog is
 * treated as done so the sign result can be marked executed.
 */
export async function deliverMpaPluginPublish(
	config: NodeSdkConfig,
	requestId: string,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<string>> {
	const built = await buildManagementPostRequest(
		config,
		{
			path: '/completePluginPublish',
			buildRequestFields: () => ({requestId}),
		},
		signing,
	);
	if (!built.ok) return built;
	const signed = await managementSign(config, signing, built.data.unsignedBody);
	if (!signed.ok) return signed;
	const posted = await managementPost<unknown>(config, built.data.path, signed.data);
	if (!posted.ok) {
		if (/no pending publish/i.test(posted.reason)) {
			return {ok: true, data: 'This release is already on the catalog.'};
		}
		return posted;
	}
	return {ok: true, data: publishReceipt(posted.data)};
}

/** Null when this sign request is not a plugin release. */
export async function deliverMpaPluginPublishIfNeeded(
	config: NodeSdkConfig,
	requestId: string,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<string> | null> {
	const req = await mpcGetSignRequestById(config, requestId);
	if (!req.ok) return null;
	if (!isMpaPluginReleaseSignRequest(req.data as Record<string, unknown>)) return null;
	return deliverMpaPluginPublish(config, requestId, signing);
}
