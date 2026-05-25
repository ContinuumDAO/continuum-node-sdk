export type ApiEnvelope = {
	code?: unknown;
	error?: unknown;
	Code?: unknown;
	Error?: unknown;
	data?: unknown;
	Data?: unknown;
};

export function readApiCode(envelope: ApiEnvelope): unknown {
	if ('code' in envelope && envelope.code !== undefined) {
		return envelope.code;
	}

	if ('Code' in envelope && envelope.Code !== undefined) {
		return envelope.Code;
	}

	return undefined;
}

export function readApiError(envelope: ApiEnvelope): unknown {
	if (typeof envelope.error === 'string') {
		return envelope.error;
	}

	if (typeof envelope.Error === 'string') {
		return envelope.Error;
	}

	return undefined;
}

export function readApiData(envelope: ApiEnvelope): unknown {
	if ('data' in envelope) {
		return envelope.data;
	}

	if ('Data' in envelope) {
		return envelope.Data;
	}

	return undefined;
}

export function isSuccessCode(code: unknown): boolean {
	return code === 0 || code === '0';
}

export type ParsedEnvelope<T = unknown> =
	| {ok: true; data: T; code: unknown}
	| {ok: false; reason: string; code?: unknown};

export async function parseApiEnvelope<T = unknown>(
	response: Response,
): Promise<ParsedEnvelope<T>> {
	if (!response.ok) {
		return {
			ok: false,
			reason: `HTTP ${response.status} ${response.statusText}`,
		};
	}

	let body: unknown;
	try {
		body = await response.json();
	} catch {
		return {ok: false, reason: 'invalid JSON response'};
	}

	if (!body || typeof body !== 'object') {
		return {ok: false, reason: 'invalid JSON response'};
	}

	const envelope = body as ApiEnvelope;
	const code = readApiCode(envelope);
	const error = readApiError(envelope);

	if (!isSuccessCode(code)) {
		const errorText =
			typeof error === 'string' && error.length > 0
				? error
				: `API code ${String(code)}`;
		return {ok: false, reason: errorText, code};
	}

	return {
		ok: true,
		data: readApiData(envelope) as T,
		code,
	};
}
