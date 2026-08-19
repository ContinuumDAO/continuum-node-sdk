import type {NodeSdkConfig} from '../../config/schema.js';
import {MPA_WALLET_CONTRACT_CONFIG} from '../../config/mpa-wallet.js';
import type {SdkResult} from '../result.js';
import {MpaTopUpInputSchema, MpaWalletStatusInputSchema} from './schemas.js';
import {fetchKeyGenResult} from '../keygen.js';
import {buildMultiSignProposal} from '../../evm/proposal-builder.js';
import {signAndSubmitMultiSignRequest} from './sign-request-body.js';
import {assertExecutorNativeSufficientForProposal} from './gas-preflight.js';
import {fetchMergedMpaWalletStatus, type MpaWalletStatusData} from './mpa-fee-status.js';
import {prepareMpaKeyGenDepositActions} from './mpa-billing-actions.js';

export async function getMpaWalletStatus(
	config: NodeSdkConfig,
	input: unknown,
): Promise<SdkResult<MpaWalletStatusData>> {
	const parsed = MpaWalletStatusInputSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			reason: parsed.error.issues[0]?.message ?? 'Invalid MPA wallet status input.',
		};
	}

	const kg = await fetchKeyGenResult(config, parsed.data.keyGenId);
	if (!kg.ok) return kg;
	const eth = kg.data.ethereumaddress?.trim() ?? '';

	try {
		const data = await fetchMergedMpaWalletStatus(config, parsed.data.keyGenId, eth);
		return {ok: true, data};
	} catch (e) {
		return {
			ok: true,
			data: {
				registered: false,
				error: e instanceof Error ? e.message : 'Failed to load MPA wallet status',
			},
		};
	}
}

export async function createMpaTopUpMultiSignRequest(
	config: NodeSdkConfig,
	input: unknown,
): Promise<SdkResult<{requestId: string}>> {
	const parsed = MpaTopUpInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid MPA top-up input.'};
	}

	const kg = await fetchKeyGenResult(config, parsed.data.keyGenId);
	if (!kg.ok) return kg;
	const eth = kg.data.ethereumaddress?.trim();
	if (!eth) {
		return {ok: false, reason: 'KeyGen has no ethereum address.'};
	}

	const prepared = await prepareMpaKeyGenDepositActions(config, {
		keyGenId: parsed.data.keyGenId,
		amountWei: parsed.data.amountWei,
		activateBillingMonthAfterDeposit: parsed.data.activateBillingMonthAfterDeposit,
		paymentToken: parsed.data.paymentToken,
	});
	if (!prepared.ok) return prepared;

	const syncAfterDeposit = prepared.data.actions.some(
		(a) => a.signature === 'syncBilling(string,string,string,uint256)',
	);
	const tokenLabel = parsed.data.paymentToken === 'ctm' ? 'CTM' : 'fee token';
	const purpose =
		parsed.data.purpose ??
		(syncAfterDeposit
			? `Top up MPA signing credits in ${tokenLabel} and activate billing month`
			: `Top up MPA signing credits in ${tokenLabel}`);

	const actions = prepared.data.actions;

	const built = await buildMultiSignProposal(config, {
		keyGenResult: kg.data,
		chainId: MPA_WALLET_CONTRACT_CONFIG.chainId,
		purpose,
		useCustomGas: parsed.data.useCustomGas,
		startingNonce: parsed.data.startingNonce,
		actions,
	});
	if (!built.ok) return built;

	const preflight = await assertExecutorNativeSufficientForProposal(config, {
		keyGenResult: kg.data,
		chainId: MPA_WALLET_CONTRACT_CONFIG.chainId,
		proposal: built.data,
	});
	if (!preflight.ok) return preflight;

	return signAndSubmitMultiSignRequest(config, built.data.unsignedBody);
}
