import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../result.js';
import {CreateComposeInputSchema} from './schemas.js';
import {fetchKeyGenResult} from './context.js';
import {buildMultiSignProposal} from '../../evm/proposal-builder.js';
import {signAndSubmitMultiSignRequest} from './sign-request-body.js';
import {assertExecutorNativeSufficientForProposal} from './gas-preflight.js';

export async function createComposeMultiSignRequest(
	config: NodeSdkConfig,
	input: unknown,
): Promise<SdkResult<{requestId: string}>> {
	const parsed = CreateComposeInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid compose multi-sign input.'};
	}

	const kg = await fetchKeyGenResult(config, parsed.data.keyGenId);
	if (!kg.ok) return kg;

	const built = await buildMultiSignProposal(config, {
		keyGenResult: kg.data,
		chainId: parsed.data.chainId,
		actions: parsed.data.actions,
		purpose: parsed.data.purpose,
		useCustomGas: parsed.data.useCustomGas,
		startingNonce: parsed.data.startingNonce,
	});
	if (!built.ok) return built;

	const preflight = await assertExecutorNativeSufficientForProposal(config, {
		keyGenResult: kg.data,
		chainId: parsed.data.chainId,
		proposal: built.data,
	});
	if (!preflight.ok) return preflight;

	return signAndSubmitMultiSignRequest(config, built.data.bodyForSign);
}
