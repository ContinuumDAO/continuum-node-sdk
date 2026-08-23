import {buildEip712Multisign, type Eip712TypedDataPayload} from '@continuumdao/ctm-mpc-defi/core';
import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../result.js';
import {fetchKeyGenResult} from '../keygen.js';
import {CreateComposeEip712InputSchema} from './schemas.js';
import {signAndSubmitMultiSignRequest} from './sign-request-body.js';
import {executorAddressFromKeyGen} from './context.js';

export async function createComposeEip712MultiSignRequest(
	config: NodeSdkConfig,
	input: unknown,
): Promise<SdkResult<{requestId: string}>> {
	const parsed = CreateComposeEip712InputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid compose EIP-712 multi-sign input.'};
	}

	const kg = await fetchKeyGenResult(config, parsed.data.keyGenId);
	if (!kg.ok) return kg;

	const dest = executorAddressFromKeyGen(kg.data);
	if (!dest) {
		return {ok: false, reason: 'KeyGen missing executor ethereum address.'};
	}

	let built;
	try {
		built = buildEip712Multisign({
			keyGen: {
				pubkeyhex: kg.data.pubkeyhex,
				keylist: kg.data.keylist ? [...kg.data.keylist] : undefined,
			},
			purposeText: parsed.data.purpose ?? 'EIP-712 signatures',
			destinationChainID: String(parsed.data.chainId),
			destinationAddress: dest,
			legs: parsed.data.signatures.map(sig => ({
				typedData: sig.typedData as Eip712TypedDataPayload,
				delivery: sig.delivery ?? {kind: 'none'},
			})),
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return {ok: false, reason: `Could not build EIP-712 multi-sign body: ${message}`};
	}

	return signAndSubmitMultiSignRequest(config, built.bodyForSign);
}
