import type {NodeSdkConfig} from '../config/schema.js';
import {buildDetOpsCanonicalJson} from '../api/canonical-json.js';
import {managementPost} from '../api/management-api.js';
import {resolveKeyPathForPublicKey, signUtf8Message} from '../api/management-key.js';
import {getPreferredManagementSigner, managementSign} from './management-signer.js';
import type {SdkPreparedResult, SdkResult} from './result.js';
import {
	ExecuteSignResponseSchema,
	PendingSignRequestSchema,
	type DetOpsPostVariant,
	type ExecuteSignResponse,
	type PreparedSignRequest,
} from './schemas.js';

export type {DetOpsPostVariant, PreparedSignRequest} from './schemas.js';
export type PendingSignRequest = import('./schemas.js').PendingSignRequest;

function isAgentLlmVariant(
	variant: DetOpsPostVariant,
): variant is 'agentLlmConfig' | 'agentLlmApiKey' {
	return variant === 'agentLlmConfig' || variant === 'agentLlmApiKey';
}

export async function preparePendingSignRequest(
	config: NodeSdkConfig,
	pending: import('./schemas.js').PendingSignRequest,
): Promise<SdkPreparedResult<PreparedSignRequest>> {
	const parsedPending = PendingSignRequestSchema.safeParse(pending);
	if (!parsedPending.success) {
		return {ok: false, reason: 'Invalid pending sign request.'};
	}

	const keyInfo = await getPreferredManagementSigner(config);
	if (!keyInfo.ok) {
		return keyInfo;
	}

	const signerLabel = keyInfo.data.publicKey.slice(0, 12);

	if (isAgentLlmVariant(parsedPending.data.postVariant)) {
		const signedMessage = String(
			parsedPending.data.requestFields['signedMessage'] ?? '',
		);
		if (signedMessage.length === 0) {
			return {ok: false, reason: 'Missing signedMessage for agent LLM request.'};
		}

		return {
			ok: true,
			prepared: {
				...parsedPending.data,
				canonicalJson: signedMessage,
				signerLabel,
			},
		};
	}

	const unsigned = {
		clientSig: '',
		nonce: keyInfo.data.nonce,
		nodeKey: keyInfo.data.nodeKey,
		...parsedPending.data.requestFields,
	};
	const canonicalJson = buildDetOpsCanonicalJson(unsigned);

	return {
		ok: true,
		prepared: {
			...parsedPending.data,
			canonicalJson,
			signerLabel,
		},
	};
}

function toApiPostBody(
	prepared: PreparedSignRequest,
	signed: Record<string, unknown>,
): Record<string, unknown> {
	const clientSig = String(signed['clientSig'] ?? '');
	const {clientSig: _ignored, ...rest} = signed;

	if (
		prepared.postVariant === 'setPreferredSigner' ||
		isAgentLlmVariant(prepared.postVariant)
	) {
		return {
			...rest,
			signedMessage: prepared.canonicalJson,
			clientSig,
		};
	}

	return {
		...rest,
		sig: clientSig,
	};
}

async function executeAgentLlmSignRequest(
	config: NodeSdkConfig,
	prepared: PreparedSignRequest,
): Promise<SdkResult<ExecuteSignResponse>> {
	const keyInfo = await getPreferredManagementSigner(config);
	if (!keyInfo.ok) {
		return keyInfo;
	}

	const keyPath = resolveKeyPathForPublicKey(config, keyInfo.data.publicKey);
	if (!keyPath) {
		return {
			ok: false,
			reason: `No local private key found for preferred signer ${keyInfo.data.publicKey}`,
		};
	}

	const clientSig = signUtf8Message(keyPath, prepared.canonicalJson);
	const {signedMessage: _ignored, ...requestFields} = prepared.requestFields;
	void _ignored;
	const body = {
		...requestFields,
		signedMessage: prepared.canonicalJson,
		clientSig,
	};

	const response = await managementPost<unknown>(config, prepared.path, body);
	if (!response.ok) {
		return response;
	}

	const parsed = ExecuteSignResponseSchema.safeParse(response.data);
	if (!parsed.success) {
		return {ok: false, reason: 'Sign response failed validation.'};
	}

	return {ok: true, data: parsed.data};
}

export async function executePendingSignRequest(
	config: NodeSdkConfig,
	prepared: PreparedSignRequest,
): Promise<SdkResult<ExecuteSignResponse>> {
	if (isAgentLlmVariant(prepared.postVariant)) {
		return executeAgentLlmSignRequest(config, prepared);
	}

	const keyInfo = await getPreferredManagementSigner(config);
	if (!keyInfo.ok) {
		return keyInfo;
	}

	const keyPath = resolveKeyPathForPublicKey(config, keyInfo.data.publicKey);
	if (!keyPath) {
		return {
			ok: false,
			reason: `No local private key found for preferred signer ${keyInfo.data.publicKey}`,
		};
	}

	const signed = await managementSign(config, prepared.requestFields, keyPath);
	if (!signed.ok) {
		return signed;
	}

	const body = toApiPostBody(prepared, signed.data);
	const response = await managementPost<unknown>(config, prepared.path, body);
	if (!response.ok) {
		return response;
	}

	const parsed = ExecuteSignResponseSchema.safeParse(response.data);
	if (!parsed.success) {
		return {ok: false, reason: 'Sign response failed validation.'};
	}

	return {ok: true, data: parsed.data};
}
