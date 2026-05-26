import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../result.js';
import {CreateForgeInputSchema} from './schemas.js';
import {
	broadcastWithOverrideSender,
	generateSignRequestWithFoundryScript,
	type FoundryBroadcastJson,
} from '../../evm/forge-broadcast.js';
import {fetchKeyGenResult} from '../keygen.js';
import {createPublicClientForChain} from './context.js';
import {signAndSubmitMultiSignRequest} from './sign-request-body.js';
import {getClientIdFromKeyGenResult} from '../../evm/rpc-utils.js';

export async function createForgeMultiSignRequest(
	config: NodeSdkConfig,
	input: unknown,
): Promise<SdkResult<{requestId: string}>> {
	const parsed = CreateForgeInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid forge multi-sign input.'};
	}

	const kg = await fetchKeyGenResult(config, parsed.data.keyGenId);
	if (!kg.ok) return kg;

	let broadcast: FoundryBroadcastJson = parsed.data.broadcast;
	const chainIdNum = parsed.data.destinationChainID
		? parseInt(parsed.data.destinationChainID, 10)
		: parseInt(
				String(
					(broadcast.transactions[0]?.transaction ?? broadcast.transactions[0]?.tx)
						?.chainId ?? broadcast.chain ?? '0',
				),
				10,
			);

	if (parsed.data.overrideSender && kg.data.ethereumaddress) {
		const ctx = await createPublicClientForChain(config, chainIdNum);
		if (!ctx.ok) return ctx;
		const pending = await ctx.data.publicClient.getTransactionCount({
			address: (parsed.data.overrideSender.startsWith('0x')
				? parsed.data.overrideSender
				: `0x${parsed.data.overrideSender}`) as `0x${string}`,
			blockTag: 'pending',
		});
		const firstNonce = parsed.data.startingNonce ?? pending;
		broadcast = broadcastWithOverrideSender(
			broadcast,
			parsed.data.overrideSender,
			firstNonce,
		);
	}

	const keyList = kg.data.keylist ?? [];
	const clientId = getClientIdFromKeyGenResult(kg.data);
	const payload = generateSignRequestWithFoundryScript(broadcast, {
		destinationChainID: parsed.data.destinationChainID,
		keyList: keyList as string[],
		pubKey: kg.data.pubkeyhex,
		purpose: parsed.data.purpose,
	});
	const body = payload.bodyForSign;
	if (clientId) body.clientId = clientId;

	return signAndSubmitMultiSignRequest(config, body);
}
