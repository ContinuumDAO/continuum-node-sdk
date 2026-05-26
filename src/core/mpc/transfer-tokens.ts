import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../result.js';
import {
	TransferC3InputSchema,
	TransferCtmErc20InputSchema,
	TransferErc20InputSchema,
	TransferErc721InputSchema,
} from './schemas.js';
import {fetchKeyGenResult} from '../keygen.js';
import {buildMultiSignProposal} from '../../evm/proposal-builder.js';
import {signAndSubmitMultiSignRequest} from './sign-request-body.js';
import {assertExecutorNativeSufficientForProposal} from './gas-preflight.js';

const DEFAULT_ERC20_SIG = 'transfer(address,uint256)';
const DEFAULT_ERC721_SIG = 'transferFrom(address,address,uint256)';
const DEFAULT_C3_SIG = 'c3transfer(string,uint256,string)';

async function submitTokenTransfer(
	config: NodeSdkConfig,
	args: {
		keyGenId: string;
		chainId: number;
		tokenAddress: string;
		signature: string;
		args: {name: string; type: string; value: string}[];
		purpose?: string;
		useCustomGas?: boolean;
		startingNonce?: number;
	},
): Promise<SdkResult<{requestId: string}>> {
	const kg = await fetchKeyGenResult(config, args.keyGenId);
	if (!kg.ok) return kg;

	const built = await buildMultiSignProposal(config, {
		keyGenResult: kg.data,
		chainId: args.chainId,
		purpose: args.purpose,
		useCustomGas: args.useCustomGas,
		startingNonce: args.startingNonce,
		actions: [
			{
				signature: args.signature,
				contractAddress: args.tokenAddress,
				args: args.args,
			},
		],
	});
	if (!built.ok) return built;

	const preflight = await assertExecutorNativeSufficientForProposal(config, {
		keyGenResult: kg.data,
		chainId: args.chainId,
		proposal: built.data,
	});
	if (!preflight.ok) return preflight;

	return signAndSubmitMultiSignRequest(config, built.data.bodyForSign);
}

export async function transferErc20(
	config: NodeSdkConfig,
	input: unknown,
): Promise<SdkResult<{requestId: string}>> {
	const parsed = TransferErc20InputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid ERC20 transfer input.'};
	}
	const sig = parsed.data.transferSig ?? DEFAULT_ERC20_SIG;
	return submitTokenTransfer(config, {
		keyGenId: parsed.data.keyGenId,
		chainId: parsed.data.chainId,
		tokenAddress: parsed.data.tokenAddress,
		signature: sig,
		args: [
			{name: 'to', type: 'address', value: parsed.data.toAddress},
			{name: 'amount', type: 'uint256', value: parsed.data.amountWei},
		],
		purpose: parsed.data.purpose,
		useCustomGas: parsed.data.useCustomGas,
		startingNonce: parsed.data.startingNonce,
	});
}

export async function transferErc721(
	config: NodeSdkConfig,
	input: unknown,
): Promise<SdkResult<{requestId: string}>> {
	const parsed = TransferErc721InputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid ERC721 transfer input.'};
	}
	const kg = await fetchKeyGenResult(config, parsed.data.keyGenId);
	if (!kg.ok) return kg;
	const from =
		parsed.data.fromAddress ??
		(kg.data.ethereumaddress?.startsWith('0x')
			? kg.data.ethereumaddress
			: `0x${kg.data.ethereumaddress}`);
	const sig = parsed.data.transferSig ?? DEFAULT_ERC721_SIG;
	return submitTokenTransfer(config, {
		keyGenId: parsed.data.keyGenId,
		chainId: parsed.data.chainId,
		tokenAddress: parsed.data.tokenAddress,
		signature: sig,
		args: [
			{name: 'from', type: 'address', value: from},
			{name: 'to', type: 'address', value: parsed.data.toAddress},
			{name: 'tokenId', type: 'uint256', value: parsed.data.tokenId},
		],
		purpose: parsed.data.purpose,
		useCustomGas: parsed.data.useCustomGas,
		startingNonce: parsed.data.startingNonce,
	});
}

export async function transferCtmErc20(
	config: NodeSdkConfig,
	input: unknown,
): Promise<SdkResult<{requestId: string}>> {
	return transferErc20(config, input);
}

export async function transferCtmErc20CrossChain(
	config: NodeSdkConfig,
	input: unknown,
): Promise<SdkResult<{requestId: string}>> {
	const parsed = TransferC3InputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid c3transfer input.'};
	}
	const sig = parsed.data.transferSig ?? DEFAULT_C3_SIG;
	return submitTokenTransfer(config, {
		keyGenId: parsed.data.keyGenId,
		chainId: parsed.data.chainId,
		tokenAddress: parsed.data.tokenAddress,
		signature: sig,
		args: [
			{name: 'toStr', type: 'string', value: parsed.data.toStr},
			{name: 'amount', type: 'uint256', value: parsed.data.amountWei},
			{name: 'toChainIdStr', type: 'string', value: parsed.data.toChainIdStr},
		],
		purpose: parsed.data.purpose,
		useCustomGas: parsed.data.useCustomGas,
		startingNonce: parsed.data.startingNonce,
	});
}
