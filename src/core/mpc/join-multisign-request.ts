import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../result.js';
import {joinMultiSignPayloads} from '../../evm/join-multisign.js';
import {JoinMultiSignRequestsInputSchema} from './schemas.js';
import {signAndSubmitMultiSignRequest} from './sign-request-body.js';
import {getUserFolderFile} from '../agent/user-folder.js';

function normalizeJoinPayloadFromFileContent(
	content: string,
): SdkResult<Record<string, unknown>> {
	const trimmed = content.trim();
	if (!trimmed) {
		return {ok: false, reason: 'Join payload file is empty.'};
	}
	let value: unknown;
	try {
		value = JSON.parse(trimmed) as unknown;
	} catch {
		return {ok: false, reason: 'Join payload file is not valid JSON.'};
	}
	if (typeof value !== 'object' || value == null || Array.isArray(value)) {
		return {ok: false, reason: 'Join payload file must contain a JSON object.'};
	}
	return {ok: true, data: {...(value as Record<string, unknown>)}};
}

async function resolveJoinPayloadInput(
	config: NodeSdkConfig,
	inline: Record<string, unknown> | undefined,
	filePath: string | undefined,
	label: 'A' | 'B',
): Promise<SdkResult<Record<string, unknown>>> {
	if (inline) {
		return {ok: true, data: inline};
	}
	const pathTrimmed = filePath?.trim();
	if (!pathTrimmed) {
		return {
			ok: false,
			reason: `Provide payload${label} or payload${label}FilePath.`,
		};
	}
	const file = await getUserFolderFile(config, pathTrimmed);
	if (!file.ok) return file;
	return normalizeJoinPayloadFromFileContent(file.data.content);
}

export async function createJoinedMultiSignRequest(
	config: NodeSdkConfig,
	input: unknown,
): Promise<SdkResult<{requestId: string}>> {
	const parsed = JoinMultiSignRequestsInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid join multi-sign input.'};
	}

	const payloadA = await resolveJoinPayloadInput(
		config,
		parsed.data.payloadA,
		parsed.data.payloadAFilePath,
		'A',
	);
	if (!payloadA.ok) return payloadA;

	const payloadB = await resolveJoinPayloadInput(
		config,
		parsed.data.payloadB,
		parsed.data.payloadBFilePath,
		'B',
	);
	if (!payloadB.ok) return payloadB;

	let payload: ReturnType<typeof joinMultiSignPayloads>;
	try {
		payload = joinMultiSignPayloads(
			payloadA.data,
			payloadB.data,
			parsed.data.firstNonce,
			parsed.data.purpose,
		);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return {ok: false, reason: msg};
	}

	return signAndSubmitMultiSignRequest(config, payload.bodyForSign);
}
