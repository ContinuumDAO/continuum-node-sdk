const MANAGEMENT_CANONICAL_BASE_ORDER = ['nonce', 'clientSig', 'nodeKey'] as const;

function serializeCanonicalValue(value: unknown): string {
	return JSON.stringify(value);
}

function buildOrderedCanonicalJson(
	fields: Record<string, unknown>,
	baseOrder: readonly string[],
	signField: string,
): string {
	const payload: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(fields)) {
		if (value === undefined || value === null || key === signField) {
			continue;
		}

		payload[key] = value;
	}

	payload[signField] = '';

	const orderedKeys = [
		...baseOrder.filter(key => key in payload),
		...Object.keys(payload)
			.filter(key => !baseOrder.includes(key))
			.sort(),
	];

	const parts = orderedKeys.map(key => {
		const value = payload[key];
		return `${JSON.stringify(key)}:${serializeCanonicalValue(value)}`;
	});

	return `{${parts.join(',')}}`;
}

export function buildManagementCanonicalJson(
	fields: Record<string, unknown>,
): string {
	return buildOrderedCanonicalJson(fields, MANAGEMENT_CANONICAL_BASE_ORDER, 'clientSig');
}

export function buildManagementUnsignedBody(
	keyInfo: {readonly nonce: number; readonly nodeKey: string},
	requestFields: Record<string, unknown>,
): Record<string, unknown> {
	return {
		clientSig: '',
		nonce: keyInfo.nonce,
		nodeKey: keyInfo.nodeKey,
		...requestFields,
	};
}
