import {buildManagementCanonicalJson} from '../../api/canonical-json.js';

export type ManagementSigFields = {
	nonce: number;
	clientSig: string;
	nodeKey: string;
};

export function normalizeManagementNodeKey(
	nodeKey: string | null | undefined,
): string {
	const nk = nodeKey?.trim().replace(/^0x/i, '');
	if (!nk || !/^[0-9a-fA-F]{128}$/.test(nk)) {
		throw new Error('nodeKey is required (128 hex from GET /getNodeKey).');
	}
	return nk.toLowerCase();
}

export function managementSigFields(
	nonce: number,
	nodeKey: string | null | undefined,
): ManagementSigFields {
	return {nonce, clientSig: '', nodeKey: normalizeManagementNodeKey(nodeKey)};
}

export function buildManagementPostBody(
	nonce: number,
	nodeKey: string | null | undefined,
	fields: Record<string, unknown> = {},
): Record<string, unknown> {
	return {...managementSigFields(nonce, nodeKey), ...fields};
}

export function messageToSignManagementBody(body: Record<string, unknown>): string {
	return buildManagementCanonicalJson({...body, clientSig: ''});
}

export function withManagementClientSig(
	body: Record<string, unknown>,
	clientSig: string,
): Record<string, unknown> {
	return {...body, clientSig: clientSig.trim().replace(/^0x/i, '')};
}

/** Unsigned POST /postMSQTTKey body (sign caCertPem bytes directly, not JSON). */
export function buildPostMqttKeyBody(
	nonce: number,
	nodeKey: string | null | undefined,
	caCertPem: string,
): Record<string, unknown> {
	return {
		...buildManagementPostBody(nonce, nodeKey),
		caCertPem: caCertPem.trim(),
	};
}

/** Unsigned POST /postPreferredKeyGen body. */
export function buildPostPreferredKeyGenBody(
	nonce: number,
	nodeKey: string | null | undefined,
	keyGenId: string,
): Record<string, unknown> {
	return buildManagementPostBody(nonce, nodeKey, {keyGenId: keyGenId.trim()});
}

/** Unsigned POST /signRequestAgree body. */
export function buildSignRequestAgreeUnsignedBody(
	requestId: string,
	accept: boolean,
	nonce: number,
	nodeKey: string | null | undefined,
	thoughts?: string,
): Record<string, unknown> {
	const fields: Record<string, unknown> = {requestId, accept};
	const t = thoughts?.trim().slice(0, 256);
	if (t) fields.thoughts = t;
	return buildManagementPostBody(nonce, nodeKey, fields);
}

export function signRequestAgreeMessageToSign(
	requestId: string,
	accept: boolean,
	nonce: number,
	nodeKey: string | null | undefined,
	thoughts?: string,
): string {
	return messageToSignManagementBody(
		buildSignRequestAgreeUnsignedBody(requestId, accept, nonce, nodeKey, thoughts),
	);
}
