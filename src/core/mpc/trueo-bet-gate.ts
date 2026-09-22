import {
	assertTrueoBetStillOpen,
	extraJsonFromSignRequest,
	parseTrueoBetExtraJson,
	TRUEO_BET_EXPIRED_ERROR,
} from '@continuumdao/ctm-mpc-defi/protocols/evm/trueo';
import type {SdkResult} from '../result.js';

export async function assertTrueoBetOpenForSignRequest(
	detail: Record<string, unknown>,
): Promise<SdkResult<void>> {
	const extra = parseTrueoBetExtraJson(extraJsonFromSignRequest(detail));
	if (!extra) return {ok: true, data: undefined};
	try {
		await assertTrueoBetStillOpen(extra.marketAddress);
		return {ok: true, data: undefined};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {ok: false, reason: message.includes('Market expired') ? TRUEO_BET_EXPIRED_ERROR : message};
	}
}
