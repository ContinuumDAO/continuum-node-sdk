import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkEmptyResult} from './gas-preflight.js';
import {getMpaWalletStatus} from './mpa-top-up.js';

export async function assertMpaCreditsForGetSig(
	config: NodeSdkConfig,
	args: {
		keyGenId: string;
		keyGenAddress: string;
		requiredCredits?: number;
	},
): Promise<SdkEmptyResult> {
	const globalNonce = await getMpaWalletStatus(config, {keyGenId: args.keyGenId});
	if (!globalNonce.ok) return globalNonce;
	if (globalNonce.data.globalNonce === 0) {
		return {ok: true};
	}
	const credits = globalNonce.data.remainingNonces ?? 0;
	const free = globalNonce.data.freeTransactionsLeft ?? 0;
	const total = free + Math.max(0, credits - free);
	const need = args.requiredCredits ?? 1;
	if (total < need) {
		return {
			ok: false,
			reason: `Insufficient MPA credits (${total} remaining, need ${need}). Top up on Linea.`,
		};
	}
	return {ok: true};
}
