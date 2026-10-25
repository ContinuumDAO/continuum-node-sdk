import * as bitcoin from 'bitcoinjs-lib';
import {z} from 'zod';
import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../result.js';
import {fetchKeyGenResult, getPreferredKeyGen, listKeyGenRequests} from '../keygen.js';
import type {KeyGenResultById} from './types.js';
import {resolveTransferRecipient} from './resolve-recipient.js';
import {signAndSubmitMultiSignRequest} from './sign-request-body.js';
import {bitcoinAmountToSats, satsToBtcString} from './bitcoin-amount.js';
import {
	buildP2trKeyPathTransferDraft,
	buildP2wpkhTransferDraft,
	destinationChainIdForBitcoinNetwork,
	fetchAddressUtxos,
	fetchBitcoinFeeRatesMerged,
	mergeBitcoinTransferExtraJSON,
	resolveBitcoinFeeRateSatPerVbyte,
	type BitcoinPublicNetwork,
	type BitcoinTransferFeeSpeedTier,
	type BitcoinTransferScriptType,
} from './bitcoin-transfer-draft.js';
import {getBitcoinSecurityAvailability} from './bitcoin-security-default.js';

export const CreateBitcoinTransferInputSchema = z
	.object({
		amount: z.string().min(1),
		unit: z.enum(['sats', 'btc']),
		securityCheck: z.boolean(),
		toAddress: z.string().optional(),
		toContactName: z.string().optional(),
		network: z.enum(['mainnet', 'testnet', 'signet']).optional(),
		fromAddress: z.string().optional(),
		keyGenId: z.string().optional(),
		scriptType: z.enum(['p2wpkh', 'p2tr']).optional(),
		purpose: z.string().max(256).optional(),
		feeSpeedTier: z.enum(['slow', 'normal', 'fast', 'advanced']).optional(),
		feeRateSatPerVbyteAdvanced: z.string().optional(),
	})
	.strict();

export const CreateBitcoinTransferResultSchema = z
	.object({
		requestId: z.string(),
		destinationAddress: z.string(),
		amountSats: z.string(),
		amountBtc: z.string(),
		scriptType: z.enum(['p2wpkh', 'p2tr']),
		network: z.enum(['mainnet', 'testnet', 'signet']),
		bitcoinSecurityCheck: z.boolean(),
		txid: z.string(),
		fromAddress: z.string(),
		keyGenId: z.string(),
		note: z.string(),
	})
	.strict();

type ScriptType = BitcoinTransferScriptType;

function recordOf(value: KeyGenResultById): Record<string, unknown> {
	return value as Record<string, unknown>;
}

function field(rec: Record<string, unknown>, name: string): string {
	const want = name.toLowerCase();
	for (const [key, value] of Object.entries(rec)) {
		if (key.toLowerCase() === want && typeof value === 'string' && value.trim()) {
			return value.trim();
		}
	}
	return '';
}

function stringList(rec: Record<string, unknown>, name: string): string[] {
	const want = name.toLowerCase();
	for (const [key, value] of Object.entries(rec)) {
		if (key.toLowerCase() !== want || !Array.isArray(value)) continue;
		const out: string[] = [];
		for (const item of value) {
			if (typeof item === 'string' && item.trim()) out.push(item.trim());
		}
		return out;
	}
	return [];
}

function scriptTypeOfAddress(address: string): ScriptType | null {
	const text = address.trim().toLowerCase();
	if (/^(bc1p|tb1p)/.test(text)) return 'p2tr';
	if (/^(bc1q|tb1q)/.test(text)) return 'p2wpkh';
	return null;
}

function networkHint(address: string): 'mainnet' | 'test-or-signet' | null {
	const text = address.trim().toLowerCase();
	if (text.startsWith('bc1')) return 'mainnet';
	if (text.startsWith('tb1')) return 'test-or-signet';
	return null;
}

function scriptTypeForKey(keyType: string): ScriptType | null {
	const text = keyType.trim().toLowerCase();
	if (text === 'bitcoin-taproot') return 'p2tr';
	if (text === 'secp256k1') return 'p2wpkh';
	return null;
}

function addressFor(
	rec: Record<string, unknown>,
	network: BitcoinPublicNetwork,
	scriptType: ScriptType,
): string {
	const prefix = scriptType === 'p2tr' ? 'bitcoinp2tr' : 'bitcoinp2wpkh';
	return field(rec, `${prefix}${network}`);
}

function jsNetwork(network: BitcoinPublicNetwork): bitcoin.Network {
	return network === 'mainnet' ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
}

function decodeFirstOutput(
	unsignedTxHex: string,
	network: BitcoinPublicNetwork,
): {address: string; sats: bigint} {
	const tx = bitcoin.Transaction.fromHex(unsignedTxHex.replace(/^0x/i, '').trim());
	const output = tx.outs[0];
	if (!output) throw new Error('The unsigned transaction has no outputs.');
	const address = bitcoin.address.fromOutputScript(output.script, jsNetwork(network));
	return {address, sats: BigInt(output.value)};
}

type SelectedKey = {
	keyGenId: string;
	pubKey: string;
	keyList: string[];
	fromAddress: string;
	scriptType: ScriptType;
	gate: number | undefined;
};

async function loadKey(
	config: NodeSdkConfig,
	keyGenId: string,
): Promise<SdkResult<KeyGenResultById>> {
	return fetchKeyGenResult(config, keyGenId);
}

function selectFromResult(
	keyGenId: string,
	result: KeyGenResultById,
	network: BitcoinPublicNetwork,
	scriptType: ScriptType | undefined,
	fromAddress: string | undefined,
): SdkResult<SelectedKey> {
	const rec = recordOf(result);
	const keyType = field(rec, 'keytype');
	const keyScript = scriptTypeForKey(keyType);
	const named = fromAddress?.trim() ?? '';
	const namedScript = named ? scriptTypeOfAddress(named) : null;
	if (named && !namedScript) {
		return {
			ok: false,
			reason: 'The sender address must be native SegWit (bc1q / tb1q) or Taproot (bc1p / tb1p). Legacy and wrapped SegWit are not supported.',
		};
	}
	const script = scriptType ?? namedScript ?? keyScript;
	if (!script) {
		return {
			ok: false,
			reason: 'Name scriptType p2wpkh or p2tr. This KeyGen is not a secp256k1 or bitcoin-taproot key.',
		};
	}
	if (keyScript && keyScript !== script) {
		return {
			ok: false,
			reason:
				script === 'p2tr'
					? 'A Taproot send uses the bitcoin-taproot key, not the secp256k1 key.'
					: 'A SegWit send uses the secp256k1 key, not the bitcoin-taproot key.',
		};
	}
	if (namedScript && namedScript !== script) {
		return {ok: false, reason: 'The sender address type does not match scriptType.'};
	}
	const owned = addressFor(rec, network, script);
	const sender = named || owned;
	if (!sender) {
		return {
			ok: false,
			reason: `This KeyGen has no ${script} address on ${network}.`,
		};
	}
	if (named && owned && named.toLowerCase() !== owned.toLowerCase()) {
		return {
			ok: false,
			reason: `Sender ${named} is not this KeyGen's ${script} address (${owned}).`,
		};
	}
	const pubKey = field(rec, 'pubkeyhex');
	if (!pubKey) {
		return {ok: false, reason: 'This KeyGen result has no public key.'};
	}
	const keyList = stringList(rec, 'keylist');
	if (keyList.length === 0) {
		return {ok: false, reason: 'This KeyGen result has no key list.'};
	}
	const gateRaw = rec.gate ?? rec.Gate;
	const gate = typeof gateRaw === 'number' ? gateRaw : undefined;
	const id = field(rec, 'requestid') || keyGenId;
	return {
		ok: true,
		data: {keyGenId: id, pubKey, keyList, fromAddress: sender, scriptType: script, gate},
	};
}

async function resolveKey(
	config: NodeSdkConfig,
	input: {
		keyGenId?: string;
		fromAddress?: string;
		scriptType?: ScriptType;
		network: BitcoinPublicNetwork;
	},
): Promise<SdkResult<SelectedKey>> {
	if (input.keyGenId?.trim()) {
		const loaded = await loadKey(config, input.keyGenId.trim());
		if (!loaded.ok) return loaded;
		return selectFromResult(
			input.keyGenId.trim(),
			loaded.data,
			input.network,
			input.scriptType,
			input.fromAddress,
		);
	}
	const named = input.fromAddress?.trim() ?? '';
	if (named) {
		const listed = await listKeyGenRequests(config, {filter: 'success', pagenum: 0, pagesize: 0});
		if (!listed.ok) return listed;
		const matches: SelectedKey[] = [];
		for (const request of listed.data.requests.slice(0, 40)) {
			const loaded = await loadKey(config, request.requestid);
			if (!loaded.ok) continue;
			const selected = selectFromResult(
				request.requestid,
				loaded.data,
				input.network,
				input.scriptType,
				named,
			);
			if (selected.ok) matches.push(selected.data);
		}
		if (matches.length === 0) {
			return {
				ok: false,
				reason: `No KeyGen on this node owns ${named} as a ${input.scriptType ?? 'SegWit or Taproot'} address. Pass keyGenId for the key that spends it.`,
			};
		}
		if (matches.length > 1) {
			return {
				ok: false,
				reason: `More than one KeyGen owns ${named}. Pass keyGenId.`,
			};
		}
		return {ok: true, data: matches[0]!};
	}
	const preferred = await getPreferredKeyGen(config);
	if (!preferred.ok) return preferred;
	if (!preferred.data.keyGenId.trim()) {
		return {
			ok: false,
			reason: 'No preferred KeyGen is set. Name fromAddress or keyGenId for the Bitcoin key that should spend.',
		};
	}
	const loaded = await loadKey(config, preferred.data.keyGenId);
	if (!loaded.ok) return loaded;
	return selectFromResult(
		preferred.data.keyGenId,
		loaded.data,
		input.network,
		input.scriptType,
		undefined,
	);
}

function resolveNetwork(
	network: BitcoinPublicNetwork | undefined,
	addresses: string[],
): SdkResult<BitcoinPublicNetwork> {
	let hint: 'mainnet' | 'test-or-signet' | null = null;
	for (const address of addresses) {
		const next = networkHint(address);
		if (!next) continue;
		if (hint && hint !== next) {
			return {ok: false, reason: 'Sender and destination are on different Bitcoin networks.'};
		}
		hint = next;
	}
	const chosen = network ?? (hint === 'mainnet' ? 'mainnet' : undefined);
	if (!chosen) {
		return {
			ok: false,
			reason: 'Name network as testnet or signet. This address is not mainnet.',
		};
	}
	if (hint === 'mainnet' && chosen !== 'mainnet') {
		return {ok: false, reason: `This address is mainnet, not ${chosen}.`};
	}
	if (hint === 'test-or-signet' && chosen === 'mainnet') {
		return {ok: false, reason: 'This address is testnet or signet, not mainnet.'};
	}
	return {ok: true, data: chosen};
}

export async function createBitcoinTransfer(
	config: NodeSdkConfig,
	input: unknown,
): Promise<SdkResult<z.infer<typeof CreateBitcoinTransferResultSchema>>> {
	const parsed = CreateBitcoinTransferInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid Bitcoin transfer input. amount, unit (sats or btc), and securityCheck are required.'};
	}
	let amountSats: bigint;
	try {
		amountSats = bitcoinAmountToSats(parsed.data.amount, parsed.data.unit);
	} catch (error) {
		return {ok: false, reason: error instanceof Error ? error.message : 'Invalid amount.'};
	}

	const recipient = await resolveTransferRecipient(config, {
		toAddress: parsed.data.toAddress,
		toContactName: parsed.data.toContactName,
		chainType: 'bitcoin',
		chainIdLabel: parsed.data.network
			? destinationChainIdForBitcoinNetwork(parsed.data.network)
			: undefined,
	});
	if (!recipient.ok) return recipient;
	const destination = recipient.data.trim();

	const network = resolveNetwork(parsed.data.network, [
		parsed.data.fromAddress ?? '',
		destination,
	]);
	if (!network.ok) return network;

	const key = await resolveKey(config, {
		keyGenId: parsed.data.keyGenId,
		fromAddress: parsed.data.fromAddress,
		scriptType: parsed.data.scriptType,
		network: network.data,
	});
	if (!key.ok) return key;

	if (parsed.data.securityCheck) {
		const availability = await getBitcoinSecurityAvailability(config, {
			network: network.data,
			keyGenId: key.data.keyGenId,
		});
		if (!availability.ok) return availability;
		if (!availability.data.available) {
			return {
				ok: false,
				reason:
					availability.data.message?.trim() ||
					'No node in this signing group has a Bitcoin Core that is online and caught up. Add Bitcoin Core on a node in the group and wait until it is up to date.',
			};
		}
	}

	const chainLabel = destinationChainIdForBitcoinNetwork(network.data);
	if (!parsed.data.network) {
		const pinned = await resolveTransferRecipient(config, {
			toAddress: parsed.data.toAddress,
			toContactName: parsed.data.toContactName,
			chainType: 'bitcoin',
			chainIdLabel: chainLabel,
		});
		if (!pinned.ok) return pinned;
		if (pinned.data.trim().toLowerCase() !== destination.toLowerCase()) {
			return {
				ok: false,
				reason: 'The address book contact does not match this Bitcoin network. Pass network or toAddress.',
			};
		}
	}

	let utxos;
	let fees;
	try {
		utxos = await fetchAddressUtxos(network.data, key.data.fromAddress);
		fees = await fetchBitcoinFeeRatesMerged(network.data);
	} catch (error) {
		return {ok: false, reason: error instanceof Error ? error.message : 'Could not load Bitcoin UTXOs or fees.'};
	}
	const tier: BitcoinTransferFeeSpeedTier = parsed.data.feeSpeedTier ?? 'normal';
	const feeRate = resolveBitcoinFeeRateSatPerVbyte(
		fees,
		tier,
		parsed.data.feeRateSatPerVbyteAdvanced,
	);
	let draft;
	try {
		const params = {
			network: network.data,
			fromAddress: key.data.fromAddress,
			toAddress: destination,
			amountSats,
			feeRateSatPerVbyte: feeRate,
			utxoPool: utxos,
		};
		draft =
			key.data.scriptType === 'p2tr'
				? buildP2trKeyPathTransferDraft(params)
				: buildP2wpkhTransferDraft(params);
	} catch (error) {
		return {ok: false, reason: error instanceof Error ? error.message : 'Could not build the Bitcoin transaction.'};
	}

	let decoded;
	try {
		decoded = decodeFirstOutput(draft.unsignedTxHex, network.data);
	} catch (error) {
		return {ok: false, reason: error instanceof Error ? error.message : 'Could not decode the Bitcoin transaction.'};
	}
	if (decoded.address.toLowerCase() !== destination.toLowerCase() || decoded.sats !== amountSats) {
		return {
			ok: false,
			reason: 'The built transaction output does not match the destination and amount.',
		};
	}

	const extraJSON = mergeBitcoinTransferExtraJSON('', {
		bitcoinTransfer: true,
		bitcoinScriptType: key.data.scriptType,
		bitcoinNetwork: network.data,
		fromAddress: key.data.fromAddress,
		amountSats: amountSats.toString(),
		amountDisplayUnit: parsed.data.unit,
		selectedUtxos: draft.selectedUtxos,
		vbytesEstimate: draft.vbytesEstimate,
		feeRateSatPerVbyteInitial: draft.feeRateSatPerVbyte,
		feeSpeedTier: tier,
		...(tier === 'advanced' && parsed.data.feeRateSatPerVbyteAdvanced?.trim()
			? {feeRateSatPerVbyteAdvanced: parsed.data.feeRateSatPerVbyteAdvanced.trim()}
			: {}),
		knownDestinationName: (parsed.data.toContactName ?? '').trim(),
		...(parsed.data.securityCheck ? {bitcoinSecurityCheck: true} : {}),
	});
	const bodyForSign: Record<string, unknown> = {
		keyList: key.data.keyList,
		pubKey: key.data.pubKey,
		msgHash: draft.msgHashHex,
		msgRaw: `0x${draft.unsignedTxHex}`,
		destinationChainID: chainLabel,
		destinationAddress: decoded.address,
		destinationContract: decoded.address,
		signatureText: JSON.stringify({signature: 'transfer', names: ['to', 'value']}),
		bitcoinTransfer: true,
		value: amountSats.toString(),
		txParams: {
			txType: 'bitcoin',
			gasLimit: String(draft.vbytesEstimate),
			feeRateSatPerVbyte: String(draft.feeRateSatPerVbyte),
			vbytesEstimate: String(draft.vbytesEstimate),
			feeSats: String(draft.feeSats),
		},
		extraJSON,
		purpose: (parsed.data.purpose ?? '').trim().slice(0, 256),
	};
	const posted = await signAndSubmitMultiSignRequest(config, bodyForSign);
	if (!posted.ok) return posted;
	const gate = key.data.gate;
	const note =
		gate != null && gate > 1
			? `This key needs ${gate} agreements. Agree on this node, and tell the user while other parties still have to agree. Get Sig only on the originator, then broadcast_sign_result.`
			: 'Agree on this node if it has not agreed yet. Get Sig only on the originator, then broadcast_sign_result.';
	return {
		ok: true,
		data: {
			requestId: posted.data.requestId,
			destinationAddress: decoded.address,
			amountSats: decoded.sats.toString(),
			amountBtc: satsToBtcString(decoded.sats),
			scriptType: key.data.scriptType,
			network: network.data,
			bitcoinSecurityCheck: parsed.data.securityCheck,
			txid: bitcoin.Transaction.fromHex(draft.unsignedTxHex).getId(),
			fromAddress: key.data.fromAddress,
			keyGenId: key.data.keyGenId,
			note,
		},
	};
}
