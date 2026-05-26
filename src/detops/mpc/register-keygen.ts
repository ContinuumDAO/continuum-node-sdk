import type {NodeSdkConfig} from '../../config/schema.js';
import {MPA_WALLET_CONTRACT_CONFIG} from '../../config/mpa-wallet.js';
import type {SdkResult} from '../result.js';
import {RegisterKeyGenInputSchema} from './schemas.js';
import {fetchKeyGenResult} from './context.js';
import {buildMultiSignProposal} from '../../evm/proposal-builder.js';
import {signAndSubmitMultiSignRequest} from './sign-request-body.js';
import {assertExecutorNativeSufficientForProposal} from './gas-preflight.js';

const REGISTER_PURPOSE = 'Register KeyGen with MultiSignAgentWallet on Linea';

export async function registerKeyGenOnLinea(
	config: NodeSdkConfig,
	input: unknown,
): Promise<SdkResult<{requestId: string}>> {
	const parsed = RegisterKeyGenInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid register KeyGen input.'};
	}

	const kg = await fetchKeyGenResult(config, parsed.data.keyGenId);
	if (!kg.ok) return kg;

	const built = await buildMultiSignProposal(config, {
		keyGenResult: kg.data,
		chainId: MPA_WALLET_CONTRACT_CONFIG.chainId,
		purpose: parsed.data.purpose ?? REGISTER_PURPOSE,
		useCustomGas: parsed.data.useCustomGas,
		startingNonce: parsed.data.startingNonce,
		actions: [
			{
				signature: 'register()',
				contractAddress: MPA_WALLET_CONTRACT_CONFIG.contractAddress,
				args: [],
			},
		],
	});
	if (!built.ok) return built;

	const preflight = await assertExecutorNativeSufficientForProposal(config, {
		keyGenResult: kg.data,
		chainId: MPA_WALLET_CONTRACT_CONFIG.chainId,
		proposal: built.data,
	});
	if (!preflight.ok) return preflight;

	return signAndSubmitMultiSignRequest(config, built.data.bodyForSign);
}
