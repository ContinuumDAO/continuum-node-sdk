import {createPublicClient, defineChain, getAddress, http, zeroAddress, type Address} from 'viem';
import type {NodeSdkConfig} from '../../config/schema.js';
import {MPA_WALLET_CONTRACT_CONFIG, MPA_WALLET_READ_ABI} from '../../config/mpa-wallet.js';
import type {SdkResult} from '../result.js';
import {RegisterKeyGenInputSchema} from './schemas.js';
import {fetchKeyGenResult, fetchGlobalNonceByKeyGenId, getKeyGenParentGroupId} from '../keygen.js';
import {buildMultiSignProposal} from '../../evm/proposal-builder.js';
import {signAndSubmitMultiSignRequest} from './sign-request-body.js';
import {assertExecutorNativeSufficientForProposal} from './gas-preflight.js';
import {feeAddressKindForKeyGen} from './address-kind.js';
import {nodeId} from '../general.js';
import {appendFeeTokenApproveIfNeeded, buildRegisterKeyGenActions, type MpaProposalAction} from './mpa-billing-actions.js';

const REGISTER_PURPOSE = 'Register KeyGen with MultiSignAgentWallet on Linea';

function getMpaPublicClient() {
	const chain = defineChain({
		id: MPA_WALLET_CONTRACT_CONFIG.chainId,
		name: MPA_WALLET_CONTRACT_CONFIG.chainName,
		nativeCurrency: {decimals: 18, name: 'Ether', symbol: 'ETH'},
		rpcUrls: {default: {http: [MPA_WALLET_CONTRACT_CONFIG.rpcUrl]}},
	});
	return createPublicClient({
		chain,
		transport: http(MPA_WALLET_CONTRACT_CONFIG.rpcUrl),
	});
}

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

	const self = await nodeId(config);
	if (!self.ok) return self;
	const nodeKey = self.data.nodeId;
	const addressKind = feeAddressKindForKeyGen(kg.data as Record<string, unknown>);

	const client = getMpaPublicClient();
	const mpa = MPA_WALLET_CONTRACT_CONFIG.contractAddress as Address;
	const authority = await client.readContract({
		address: mpa,
		abi: MPA_WALLET_READ_ABI,
		functionName: 'getNodeWithdrawAuthority',
		args: [nodeKey],
	});
	if (authority === zeroAddress) {
		return {
			ok: false,
			reason: 'Node withdraw authority is not claimed. Call claim_node_withdraw_authority first.',
		};
	}

	const executorId =
		(parsed.data as {executorKeyGenId?: string}).executorKeyGenId?.trim() || parsed.data.keyGenId;
	const executorKg = executorId === parsed.data.keyGenId ? kg : await fetchKeyGenResult(config, executorId);
	if (!executorKg.ok) return executorKg;
	const eth = executorKg.data.ethereumaddress?.trim();
	if (!eth) {
		return {
			ok: false,
			reason: 'Register must be composed from the claimed authority secp256k1 KeyGen (ethereum address).',
		};
	}
	const executor = getAddress(eth.startsWith('0x') ? eth : `0x${eth}`) as Address;
	if (executor.toLowerCase() !== authority.toLowerCase()) {
		return {
			ok: false,
			reason: `Compose from the claimed authority KeyGen (${authority}), not ${executor}.`,
		};
	}

	const nonceRes = await fetchGlobalNonceByKeyGenId(config, parsed.data.keyGenId);
	const globalNonce = nonceRes.ok ? nonceRes.data : 0;
	let groupId = (parsed.data as {groupId?: string}).groupId?.trim() ?? '';
	if (!groupId) {
		const parent = await getKeyGenParentGroupId(config, {id: parsed.data.keyGenId});
		if (parent.ok) groupId = parent.data.groupId;
	}

	const nodeIdBytes = await client.readContract({
		address: mpa,
		abi: MPA_WALLET_READ_ABI,
		functionName: 'nodeIdOfNodeKey',
		args: [nodeKey],
	});
	const [trial, rates] = await Promise.all([
		client.readContract({
			address: mpa,
			abi: MPA_WALLET_READ_ABI,
			functionName: 'qualifiesForNodeTrial',
			args: [nodeIdBytes],
		}),
		client.readContract({
			address: mpa,
			abi: MPA_WALLET_READ_ABI,
			functionName: 'getActiveRates',
		}),
	]);
	let waiver = false;
	if (groupId) {
		try {
			waiver = Boolean(
				await client.readContract({
					address: mpa,
					abi: MPA_WALLET_READ_ABI,
					functionName: 'qualifiesForVeCtmWaiver',
					args: [parsed.data.keyGenId, addressKind, nodeKey],
				}),
			);
		} catch {
			waiver = false;
		}
		if (!waiver) {
			try {
				const nodeProperties = await client.readContract({
					address: mpa,
					abi: MPA_WALLET_READ_ABI,
					functionName: 'nodeProperties',
				});
				const attached = await client.readContract({
					address: nodeProperties,
					abi: [
						{
							inputs: [{name: 'keyGen', type: 'address'}],
							name: 'attachedTokenId',
							outputs: [{name: '', type: 'uint256'}],
							stateMutability: 'view',
							type: 'function',
						},
					] as const,
					functionName: 'attachedTokenId',
					args: [authority],
				});
				waiver = attached > 0n;
			} catch {
				/* pre-register view is false until the account exists */
			}
		}
	}
	const waived = Boolean(trial || waiver);
	const monthlyFee = rates[0];

	const actions: MpaProposalAction[] = [];
	if (!waived && monthlyFee > 0n) {
		await appendFeeTokenApproveIfNeeded(client, actions, executor, monthlyFee);
	}
	actions.push(...buildRegisterKeyGenActions(parsed.data.keyGenId, addressKind, nodeKey, globalNonce, groupId));

	const built = await buildMultiSignProposal(config, {
		keyGenResult: executorKg.data,
		chainId: MPA_WALLET_CONTRACT_CONFIG.chainId,
		purpose: parsed.data.purpose ?? REGISTER_PURPOSE,
		useCustomGas: parsed.data.useCustomGas,
		startingNonce: parsed.data.startingNonce,
		actions,
	});
	if (!built.ok) return built;

	const preflight = await assertExecutorNativeSufficientForProposal(config, {
		keyGenResult: executorKg.data,
		chainId: MPA_WALLET_CONTRACT_CONFIG.chainId,
		proposal: built.data,
	});
	if (!preflight.ok) return preflight;

	return signAndSubmitMultiSignRequest(config, built.data.unsignedBody);
}
