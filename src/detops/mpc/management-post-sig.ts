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
	return JSON.stringify({...body, clientSig: ''});
}

export function withManagementClientSig(
	body: Record<string, unknown>,
	clientSig: string,
): Record<string, unknown> {
	return {...body, clientSig: clientSig.trim().replace(/^0x/i, '')};
}
