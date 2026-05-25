const DETOPS_BASE_ORDER = ['clientSig', 'nonce', 'nodeKey'] as const;

function serializeCanonicalValue(value: unknown): string {
	return JSON.stringify(value);
}

export function buildDetOpsCanonicalJson(
	fields: Record<string, unknown>,
): string {
	const payload: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(fields)) {
		if (value === undefined || value === null || key === 'clientSig') {
			continue;
		}

		payload[key] = value;
	}

	payload['clientSig'] = '';

	const orderedKeys = [
		...DETOPS_BASE_ORDER.filter(key => key in payload),
		...Object.keys(payload)
			.filter(key => !DETOPS_BASE_ORDER.includes(key as 'clientSig'))
			.sort(),
	];

	const parts = orderedKeys.map(key => {
		const value = payload[key];
		return `${JSON.stringify(key)}:${serializeCanonicalValue(value)}`;
	});

	return `{${parts.join(',')}}`;
}
