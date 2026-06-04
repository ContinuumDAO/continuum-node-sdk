import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../result.js';
import {joinMultiSignPayloads} from '../../evm/join-multisign.js';
import {JoinMultiSignRequestsInputSchema} from './schemas.js';
import {signAndSubmitMultiSignRequest} from './sign-request-body.js';

export async function createJoinedMultiSignRequest(
	config: NodeSdkConfig,
	input: unknown,
): Promise<SdkResult<{requestId: string}>> {
	const parsed = JoinMultiSignRequestsInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid join multi-sign input.'};
	}

	let payload: ReturnType<typeof joinMultiSignPayloads>;
	try {
		payload = joinMultiSignPayloads(
			parsed.data.payloadA,
			parsed.data.payloadB,
			parsed.data.firstNonce,
			parsed.data.purpose,
		);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return {ok: false, reason: msg};
	}

	return signAndSubmitMultiSignRequest(config, payload.bodyForSign);
}
