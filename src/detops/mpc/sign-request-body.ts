import type {NodeSdkConfig} from '../../config/schema.js';
import {MPA_HOME_DIR} from '../../config/paths.js';
import type {SdkResult} from '../result.js';
import {
	fetchManagementKeyOptions,
	resolveManagementSigningKeyOption,
	signManagementMessage,
} from '../management-signer.js';
import type {CreateMultiSignRequestResult} from './types.js';
import {mpcPostMultiSignRequest} from './client.js';

function sdkError(reason: string): Error {
	return new Error(reason);
}

/**
 * Sign bodyForSign with Ed25519 (JSON.stringify) and POST /multiSignRequest.
 */
export async function signAndSubmitMultiSignRequest(
	config: NodeSdkConfig,
	bodyForSign: Record<string, unknown>,
): Promise<SdkResult<CreateMultiSignRequestResult>> {
	try {
		const keyOptionsResult = await fetchManagementKeyOptions(config);
		if (!keyOptionsResult.ok) {
			return keyOptionsResult;
		}
		const selectedResult = await resolveManagementSigningKeyOption(
			config,
			keyOptionsResult.data,
		);
		if (!selectedResult.ok) {
			return selectedResult;
		}
		const selectedSigningKey = selectedResult.data;
		const messageToSign = JSON.stringify(bodyForSign);
		const signature = await signManagementMessage(
			selectedSigningKey,
			messageToSign,
			{
				keyRoot: MPA_HOME_DIR,
				toMcpApiError: sdkError,
				config,
				assertAgentCanSignManagementRequests: async () => {},
			},
		);
		const payload = {
			...bodyForSign,
			clientSig: signature,
			signedMessage: messageToSign,
		};
		const posted = await mpcPostMultiSignRequest(config, payload);
		if (!posted.ok) return posted;
		return {ok: true, data: {requestId: posted.data}};
	} catch (error) {
		return {
			ok: false,
			reason: error instanceof Error ? error.message : String(error),
		};
	}
}
