import type {NodeSdkConfig} from '../../config/schema.js';
import {
	DEFAULT_MANAGEMENT_SIGNING,
	type ManagementSigningMethod,
} from '../../schemas/extended.js';
import type {SdkResult} from '../result.js';
import {fetchKeyGenResult} from '../keygen.js';
import {buildManagementPostRequest, managementSign} from '../management-signer.js';
import {
	mpcGetSignRequestById,
	mpcGetSignResultById,
	mpcPostUpdateSignResultStatusById,
} from './client.js';
import {BroadcastSignResultInputSchema} from './schemas.js';
import {getMessageRawForDetail, keyGenIdFromRecord} from './sign-request-utils.js';
import {
	bitcoinNetworkFromDestinationChainId,
	bitcoinTxIdFromRawHex,
	broadcastBitcoinRawTxEsplora,
	finalizeP2trKeyPathTxHexFromUnsignedAndRs,
	finalizeP2wpkhTxHexFromUnsignedAndRs,
	isBitcoinSignRequestDestinationChain,
	parseBitcoinTransferExtra,
	type BitcoinPublicNetwork,
	type BitcoinTransferScriptType,
} from './bitcoin-transfer-draft.js';

function signatureRs(result: Record<string, unknown>): {r: string; s: string} | null {
	const r = result.r ?? result.R ?? result.sigr ?? result.Sigr;
	const s = result.s ?? result.S ?? result.sigs ?? result.Sigs;
	if (typeof r !== 'string' || typeof s !== 'string') return null;
	if (!r.trim() || !s.trim()) return null;
	return {r, s};
}

function stringField(rec: Record<string, unknown>, name: string): string {
	const want = name.toLowerCase();
	for (const [key, value] of Object.entries(rec)) {
		if (key.toLowerCase() === want && typeof value === 'string' && value.trim()) {
			return value.trim();
		}
	}
	return '';
}

async function markExecuted(
	config: NodeSdkConfig,
	requestId: string,
	txid: string,
	signing: ManagementSigningMethod,
	signedRawTx?: string,
): Promise<SdkResult<unknown>> {
	const built = await buildManagementPostRequest(
		config,
		{
			path: '/updateSignResultStatusById',
			buildRequestFields: () => ({
				requestId,
				status: 'executed',
				transactionHash: txid,
			}),
		},
		signing,
	);
	if (!built.ok) return built;
	const signed = await managementSign(config, signing, built.data.unsignedBody);
	if (!signed.ok) return signed;
	const body = signedRawTx ? {...signed.data, signedRawTx} : signed.data;
	return mpcPostUpdateSignResultStatusById(config, body);
}

/**
 * Bitcoin branch of broadcast_sign_result.
 * Returns null when the sign request is not a Bitcoin payment.
 */
export async function broadcastBitcoinSignResult(
	config: NodeSdkConfig,
	input: unknown,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<{requestId: string; txHashes: string[]; status: 'executed'}> | null> {
	const parsed = BroadcastSignResultInputSchema.safeParse(input);
	if (!parsed.success) return null;
	const requestId = parsed.data.requestId;
	const req = await mpcGetSignRequestById(config, requestId);
	if (!req.ok) return null;
	const reqData = req.data as Record<string, unknown>;
	const chainRaw = reqData.DestinationChainID ?? reqData.destinationChainID;
	if (!isBitcoinSignRequestDestinationChain(String(chainRaw ?? ''))) return null;

	const network: BitcoinPublicNetwork | null =
		bitcoinNetworkFromDestinationChainId(String(chainRaw ?? '')) ??
		null;
	if (!network) {
		return {ok: false, reason: 'Missing Bitcoin network on this sign request.'};
	}
	const extra = parseBitcoinTransferExtra(reqData.ExtraJSON ?? reqData.extraJSON);
	const scriptType: BitcoinTransferScriptType = extra?.bitcoinScriptType ?? 'p2wpkh';
	const fromAddress = (extra?.fromAddress ?? '').trim();
	if (!fromAddress) {
		return {ok: false, reason: 'This Bitcoin payment is missing its sender address.'};
	}
	const signResult = await mpcGetSignResultById(config, requestId);
	if (!signResult.ok) return signResult;
	const rs = signatureRs(signResult.data);
	if (!rs) {
		return {
			ok: false,
			reason: 'Sign result is missing r and s. Run Get Sig on the originator before broadcasting.',
		};
	}
	const unsigned = getMessageRawForDetail(reqData, 0);
	if (!unsigned?.trim()) {
		return {ok: false, reason: 'This Bitcoin payment is missing its unsigned transaction.'};
	}

	let hex: string;
	try {
		if (scriptType === 'p2tr') {
			hex = finalizeP2trKeyPathTxHexFromUnsignedAndRs({
				unsignedTxHex: unsigned,
				sigRHex: rs.r,
				sigSHex: rs.s,
			});
		} else {
			const keyGenId = keyGenIdFromRecord(reqData);
			if (!keyGenId) {
				return {ok: false, reason: 'This Bitcoin payment is missing its KeyGen id.'};
			}
			const kg = await fetchKeyGenResult(config, keyGenId);
			if (!kg.ok) return kg;
			const pubKey = stringField(kg.data as Record<string, unknown>, 'pubkeyhex');
			if (!pubKey) {
				return {ok: false, reason: 'KeyGen result is missing the secp256k1 public key.'};
			}
			hex = finalizeP2wpkhTxHexFromUnsignedAndRs({
				unsignedTxHex: unsigned,
				sigRHex: rs.r,
				sigSHex: rs.s,
				pubkeyHex: pubKey,
				fromAddress,
				network,
			});
		}
	} catch (error) {
		return {
			ok: false,
			reason: error instanceof Error ? error.message : 'Could not finalize the Bitcoin transaction.',
		};
	}

	const localTxid = bitcoinTxIdFromRawHex(hex);
	const secure = extra?.bitcoinSecurityCheck === true;
	if (secure) {
		const recorded = await markExecuted(config, requestId, localTxid, signing, hex);
		if (!recorded.ok) return recorded;
		return {ok: true, data: {requestId, txHashes: [localTxid], status: 'executed'}};
	}

	let returned: string;
	try {
		returned = await broadcastBitcoinRawTxEsplora(network, hex);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (!/already/i.test(message)) {
			return {ok: false, reason: message};
		}
		returned = localTxid;
	}
	if (returned.trim().toLowerCase() !== localTxid.toLowerCase()) {
		return {
			ok: false,
			reason: `Esplora returned txid ${returned.trim()} but this raw transaction hashes to ${localTxid}. The payment was not marked executed.`,
		};
	}
	const recorded = await markExecuted(config, requestId, localTxid, signing);
	if (!recorded.ok) return recorded;
	return {ok: true, data: {requestId, txHashes: [localTxid], status: 'executed'}};
}
