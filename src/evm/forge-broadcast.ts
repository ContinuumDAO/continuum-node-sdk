import {keccak256, serializeTransaction} from 'viem';
import {
	composeFeePayloadToTxParams,
	triggerTxParamsFromComposeBody,
	type ProposalTxParams,
} from './tx-params.js';

export type FoundryBroadcastTx = {
	from?: string;
	to?: string | null;
	gas?: string;
	value?: string;
	input?: string;
	data?: string;
	nonce?: string;
	chainId?: string;
	type?: string;
	maxFeePerGas?: string;
	maxPriorityFeePerGas?: string;
	gasPrice?: string;
};

export type FoundryBroadcastJson = {
	transactions: Array<{
		transaction?: FoundryBroadcastTx;
		tx?: FoundryBroadcastTx;
		[key: string]: unknown;
	}>;
	chain?: number;
	[key: string]: unknown;
};

export type SignRequestPayload = {
	endpoint: 'multiSignRequest';
	bodyForSign: Record<string, unknown>;
	messageToSign: string;
	chainId: string;
	count: number;
	triggerTxParams: ProposalTxParams;
	triggerMessageHash: string;
};

const BIGINT_0 = 0n;

function hexToBigInt(h: string | undefined): bigint {
	if (h === undefined || h === '') return BIGINT_0;
	const s = h.startsWith('0x') ? h : `0x${h}`;
	try {
		return BigInt(s);
	} catch {
		return BIGINT_0;
	}
}

function parseChainId(chainId: string | undefined): number {
	if (chainId === undefined || chainId === '') return 0;
	const t = String(chainId).trim();
	if (t.startsWith('0x') || t.startsWith('0X')) {
		const n = Number(hexToBigInt(t));
		return Number.isNaN(n) ? 0 : n;
	}
	const n = parseInt(t, 10);
	return Number.isNaN(n) ? 0 : n;
}

function normalizeTx(item: {
	transaction?: FoundryBroadcastTx;
	tx?: FoundryBroadcastTx;
}): FoundryBroadcastTx | null {
	const raw = item.transaction ?? item.tx;
	if (!raw || (raw.gas === undefined && raw.data === undefined && raw.input === undefined)) {
		return null;
	}
	return raw;
}

function toHex(s: string | undefined): `0x${string}` {
	if (s === undefined || s === '') return '0x';
	return s.startsWith('0x') ? (s as `0x${string}`) : (`0x${s}` as `0x${string}`);
}

function txToSigningHashAndRaw(tx: FoundryBroadcastTx): {
	messageHash: string;
	messageRaw: string;
} {
	const chainIdNum = parseChainId(tx.chainId);
	const nonce = hexToBigInt(tx.nonce);
	const gas = hexToBigInt(tx.gas);
	const value = hexToBigInt(tx.value ?? '0x0');
	const data = toHex(tx.data ?? tx.input ?? '');
	const to: `0x${string}` | undefined =
		tx.to && tx.to !== '0x'
			? tx.to.startsWith('0x')
				? (tx.to as `0x${string}`)
				: (`0x${tx.to}` as `0x${string}`)
			: undefined;
	const typeHex = tx.type;
	const isEip1559 =
		typeHex === '0x2' || typeHex === '0x02' || tx.maxFeePerGas !== undefined;

	if (isEip1559) {
		const maxFeePerGas = hexToBigInt(tx.maxFeePerGas);
		const maxPriorityFeePerGas = hexToBigInt(tx.maxPriorityFeePerGas);
		const serialized = serializeTransaction({
			type: 'eip1559',
			to,
			data,
			value,
			gas,
			nonce: Number(nonce),
			chainId: chainIdNum || 1,
			maxFeePerGas: maxFeePerGas || 0n,
			maxPriorityFeePerGas: maxPriorityFeePerGas || 0n,
		});
		const hash = keccak256(serialized);
		return {
			messageHash: hash.startsWith('0x') ? hash.slice(2) : hash,
			messageRaw: serialized,
		};
	}

	const gasPrice = hexToBigInt(tx.gasPrice);
	const serialized = serializeTransaction({
		type: 'legacy',
		to,
		data,
		value,
		gas,
		nonce: Number(nonce),
		chainId: chainIdNum || 1,
		gasPrice: gasPrice || 0n,
	});
	const hash = keccak256(serialized);
	return {
		messageHash: hash.startsWith('0x') ? hash.slice(2) : hash,
		messageRaw: serialized,
	};
}

function toAddress(tx: FoundryBroadcastTx): string {
	const t = tx.to;
	if (t === undefined || t === null || t === '') return '';
	const s = typeof t === 'string' ? t.trim() : '';
	return s.startsWith('0x') ? s : `0x${s}`;
}

function txFieldInt(hex: string | undefined): number {
	if (hex === undefined || hex === '') return 0;
	return Number(hexToBigInt(hex));
}

function legacyFromTxDict(tx: FoundryBroadcastTx): boolean {
	if (tx.type === '0x2' || tx.type === '0x02') return false;
	if (tx.maxFeePerGas != null || tx.maxPriorityFeePerGas != null) return false;
	return true;
}

export function proposalTxParamsFromUnsignedTx(
	tx: FoundryBroadcastTx,
	legacy: boolean,
): ProposalTxParams {
	const n = Number(hexToBigInt(tx.nonce));
	const gasLim = txFieldInt(tx.gas);
	if (legacy) {
		return {
			nonce: n,
			gasLimit: String(gasLim),
			txType: 'legacy',
			gasPrice: String(txFieldInt(tx.gasPrice)),
		};
	}
	return {
		nonce: n,
		gasLimit: String(gasLim),
		txType: 'eip1559',
		maxFeePerGas: String(txFieldInt(tx.maxFeePerGas)),
		maxPriorityFeePerGas: String(txFieldInt(tx.maxPriorityFeePerGas)),
	};
}

function firstTxComposeFeeFields(tx: FoundryBroadcastTx): Record<string, unknown> {
	const n = Number(hexToBigInt(tx.nonce));
	const gl = txFieldInt(tx.gas);
	if (tx.type === '0x2' || tx.type === '0x02' || tx.maxFeePerGas != null) {
		return {
			txNonce: n,
			txGasLimit: String(gl),
			txMaxFeePerGas: String(txFieldInt(tx.maxFeePerGas)),
			txMaxPriorityFeePerGas: String(txFieldInt(tx.maxPriorityFeePerGas)),
		};
	}
	return {
		txNonce: n,
		txGasLimit: String(gl),
		txGasPrice: String(txFieldInt(tx.gasPrice)),
	};
}

function firstCalldataCompactFromTx(tx: FoundryBroadcastTx): string {
	const raw = tx.data ?? tx.input ?? '0x';
	const with0x =
		typeof raw === 'string' && raw.startsWith('0x')
			? raw
			: `0x${String(raw).replace(/^0x/, '')}`;
	return with0x.length >= 2 && with0x.startsWith('0x') ? with0x.slice(2) : with0x;
}

export function broadcastWithOverrideSender(
	broadcast: FoundryBroadcastJson,
	overrideSender: string,
	firstNonce: number,
): FoundryBroadcastJson {
	const sender = overrideSender.startsWith('0x')
		? overrideSender
		: `0x${overrideSender}`;
	const txs = broadcast.transactions ?? [];
	const newTransactions = txs.map((item, i) => {
		const raw = item.transaction ?? item.tx;
		if (
			!raw ||
			(raw.gas === undefined && raw.data === undefined && raw.input === undefined)
		) {
			return item;
		}
		const next = {...raw, from: sender, nonce: String(firstNonce + i)};
		if (item.transaction) return {...item, transaction: next};
		if (item.tx) return {...item, tx: next};
		return {...item, transaction: next};
	});
	return {...broadcast, transactions: newTransactions};
}

export function generateSignRequestWithFoundryScript(
	broadcast: FoundryBroadcastJson,
	options: {
		destinationChainID?: string;
		keyList?: string[];
		pubKey?: string;
		destinationAddress?: string;
		destinationAddresses?: string[];
		signatureTexts?: string[];
		extraJSON?: string;
		signatureText?: string;
		purpose?: string;
	} = {},
): SignRequestPayload {
	const txs = broadcast.transactions ?? [];
	const entries: {
		tx: FoundryBroadcastTx;
		messageHash: string;
		messageRaw: string;
		to: string;
	}[] = [];
	let chainIdStr = options.destinationChainID ?? '';

	for (const item of txs) {
		const tx = normalizeTx(item);
		if (!tx) continue;
		if (
			!chainIdStr &&
			(tx.chainId !== undefined || (broadcast as {chain?: number}).chain !== undefined)
		) {
			const c = tx.chainId ?? (broadcast as {chain?: number}).chain;
			if (typeof c === 'number') chainIdStr = String(c);
			else if (typeof c === 'string') chainIdStr = String(hexToBigInt(c));
		}
		const {messageHash, messageRaw} = txToSigningHashAndRaw(tx);
		entries.push({tx, messageHash, messageRaw, to: toAddress(tx)});
	}

	if (entries.length === 0) {
		if (isDryRunBroadcast(broadcast)) {
			throw new Error(
				'This file is a dry-run output (no transaction data). Run with --broadcast and the Anvil default key (or any throwaway key) to produce a full broadcast file, then use "Override sender" in the import modal to set your KeyGen address.',
			);
		}
		throw new Error('No valid transactions found in broadcast JSON');
	}
	if (!chainIdStr) chainIdStr = '0';

	const ANVIL_SIMULATION_CHAIN_ID = '364865';
	if (chainIdStr.trim() === ANVIL_SIMULATION_CHAIN_ID) {
		chainIdStr = options.destinationChainID ?? '0';
	}

	const destinationChainID = options.destinationChainID ?? chainIdStr;
	const safeDestinationChainID =
		destinationChainID.trim() === ANVIL_SIMULATION_CHAIN_ID
			? (options.destinationChainID ?? '0')
			: destinationChainID;

	const proposalRows = entries.map(e =>
		proposalTxParamsFromUnsignedTx(e.tx, legacyFromTxDict(e.tx)),
	);

	if (entries.length === 1) {
		const e0 = entries[0]!;
		const bodyForSign: Record<string, unknown> = {};
		if (options.keyList) bodyForSign.keyList = options.keyList;
		if (options.pubKey) bodyForSign.pubKey = options.pubKey;
		bodyForSign.msgHash = e0.messageHash;
		bodyForSign.msgRaw = e0.messageRaw;
		bodyForSign.destinationChainID = safeDestinationChainID;
		const destSingle = (options.destinationAddress ?? e0.to) || undefined;
		if (destSingle) {
			bodyForSign.destinationAddress = destSingle;
			bodyForSign.destinationContract = destSingle;
		}
		if (options.signatureText !== undefined) {
			bodyForSign.signatureText = options.signatureText;
		}
		bodyForSign.extraJSON = options.extraJSON ?? '';
		Object.assign(bodyForSign, firstTxComposeFeeFields(e0.tx));
		if (options.purpose) bodyForSign.purpose = options.purpose;
		bodyForSign.txParams = proposalRows[0];
		const messageToSign = JSON.stringify(bodyForSign);
		return {
			endpoint: 'multiSignRequest',
			bodyForSign,
			messageToSign,
			chainId: safeDestinationChainID,
			count: 1,
			triggerTxParams: triggerTxParamsFromComposeBody(bodyForSign),
			triggerMessageHash: e0.messageHash,
		};
	}

	const e0 = entries[0]!;
	const bodyForSign: Record<string, unknown> = {};
	if (options.keyList) bodyForSign.keyList = options.keyList;
	if (options.pubKey) bodyForSign.pubKey = options.pubKey;
	bodyForSign.msgHash = e0.messageHash;
	bodyForSign.msgRaw = firstCalldataCompactFromTx(e0.tx);
	bodyForSign.messageHashes = entries.map(x => x.messageHash);
	bodyForSign.messageRawBatch = entries.map(x => x.messageRaw);
	bodyForSign.destinationChainID = safeDestinationChainID;
	const destAddresses = options.destinationAddresses ?? entries.map(x => x.to);
	const sigTexts = options.signatureTexts ?? entries.map(() => '');
	const batchMeta = entries.map((_, i) => ({
		destinationAddress: destAddresses[i] ?? '',
		signatureText: sigTexts[i] ?? '',
	}));
	let extraJSON = options.extraJSON ?? '{}';
	try {
		const parsed = JSON.parse(extraJSON) as Record<string, unknown>;
		parsed.batchMeta = batchMeta;
		extraJSON = JSON.stringify(parsed);
	} catch {
		extraJSON = JSON.stringify({batchMeta});
	}
	bodyForSign.extraJSON = extraJSON;
	bodyForSign.destinationAddress = destAddresses[0] || e0.to || undefined;
	bodyForSign.signatureText = sigTexts[0] || undefined;
	Object.assign(bodyForSign, firstTxComposeFeeFields(e0.tx));
	if (options.purpose) bodyForSign.purpose = options.purpose;
	bodyForSign.proposalTxParams = proposalRows;
	const messageToSign = JSON.stringify(bodyForSign);
	return {
		endpoint: 'multiSignRequest',
		bodyForSign,
		messageToSign,
		chainId: safeDestinationChainID,
		count: entries.length,
		triggerTxParams: triggerTxParamsFromComposeBody(bodyForSign),
		triggerMessageHash: e0.messageHash,
	};
}

/** True if broadcast looks like dry-run output (only rpc per item, no tx payload). */
export function isDryRunBroadcast(broadcast: FoundryBroadcastJson): boolean {
	const txs = broadcast.transactions ?? [];
	if (txs.length === 0) return false;
	return txs.every(item => {
		const raw = item.transaction ?? item.tx;
		const hasRpc = 'rpc' in item && typeof item.rpc === 'string';
		const hasTx =
			raw &&
			(raw.gas !== undefined || raw.data !== undefined || raw.input !== undefined);
		return hasRpc && !hasTx;
	});
}

export type FoundryDryRunFileItem = {
	transaction?: FoundryBroadcastTx;
	transactionType?: string;
	contractAddress?: string;
	contractName?: string;
	function?: string;
	arguments?: unknown[];
	[key: string]: unknown;
};

export type FoundryDryRunFile = {
	transactions: FoundryDryRunFileItem[];
	chain?: number;
	[key: string]: unknown;
};

export type ChainFeeConfig = {
	legacy?: boolean;
	gasLimit?: number;
	gasPrice?: number;
	baseFeeMultiplier?: number;
	gasMultiplier?: number;
};

export type DryRunFeeParams = {
	isEip1559: boolean;
	baseFeeGwei?: number;
	priorityFeeGwei?: number;
	gasPriceGwei?: number;
};

/**
 * Augment a broadcast (e.g. from dry-run file) with gas/fee so serialized txs are valid.
 */
export function augmentBroadcastWithFees(
	broadcast: FoundryBroadcastJson,
	options: {chainDetail?: ChainFeeConfig; feeParams: DryRunFeeParams},
): FoundryBroadcastJson {
	const {chainDetail, feeParams} = options;
	const legacy = Boolean(chainDetail?.legacy) || !feeParams.isEip1559;
	const gasLimitConfig =
		chainDetail?.gasLimit != null && chainDetail.gasLimit > 0
			? chainDetail.gasLimit
			: undefined;
	const gasFeeMultiplier =
		chainDetail?.gasMultiplier != null
			? Number(chainDetail.gasMultiplier)
			: undefined;
	const basePct =
		chainDetail?.baseFeeMultiplier != null
			? Math.max(100, Number(chainDetail.baseFeeMultiplier))
			: 100;

	let gasPriceWei: bigint;
	let maxFeePerGasWei: bigint;
	let maxPriorityFeePerGasWei: bigint;
	if (legacy) {
		let gwei = feeParams.gasPriceGwei ?? 0;
		if (chainDetail?.gasPrice != null && chainDetail.gasPrice > 0) {
			gwei = Math.max(gwei, chainDetail.gasPrice);
		}
		if (gasFeeMultiplier != null && gasFeeMultiplier > 0) {
			gwei = (gwei * (100 + gasFeeMultiplier)) / 100;
		}
		gasPriceWei = BigInt(Math.ceil(Math.max(1, gwei) * 1e9));
	} else {
		const base = feeParams.baseFeeGwei ?? 0;
		const prio = Math.max(0, feeParams.priorityFeeGwei ?? 0);
		const priorityGwei = prio > 0 ? prio : 1;
		const baseComponent = (base * basePct) / 100;
		const maxFeeGwei = baseComponent + priorityGwei;
		maxFeePerGasWei = BigInt(Math.ceil(maxFeeGwei * 1e9));
		maxPriorityFeePerGasWei = BigInt(Math.ceil(priorityGwei * 1e9));
	}

	const toHexWei = (w: bigint) => (w >= 0 ? `0x${w.toString(16)}` : '0x0');

	const transactions = (broadcast.transactions ?? []).map(item => {
		const raw = item.transaction ?? item.tx;
		if (!raw) return item;
		const tx: FoundryBroadcastTx = {...raw};
		if (gasLimitConfig != null) {
			tx.gas = toHexWei(BigInt(gasLimitConfig));
		} else if (
			tx.gas === undefined ||
			tx.gas === '' ||
			hexToBigInt(tx.gas) === BIGINT_0
		) {
			tx.gas = '0x5208';
		}
		if (legacy) {
			tx.gasPrice = toHexWei(gasPriceWei);
			delete tx.type;
			delete tx.maxFeePerGas;
			delete tx.maxPriorityFeePerGas;
		} else {
			tx.type = '0x2';
			tx.maxFeePerGas = toHexWei(maxFeePerGasWei);
			tx.maxPriorityFeePerGas = toHexWei(maxPriorityFeePerGasWei);
			delete tx.gasPrice;
		}
		return {...item, transaction: tx};
	});

	return {...broadcast, transactions};
}

/**
 * Parse Foundry dry-run file JSON (broadcast/.../dry-run/run-latest.json) and return a sign request payload.
 */
export function parseDryRunFileToSignRequestPayload(
	json: string | FoundryDryRunFile,
	options?: {
		chainDetail?: ChainFeeConfig;
		feeParams: DryRunFeeParams;
		firstNonce?: number;
	},
): SignRequestPayload | null {
	let file: FoundryDryRunFile;
	try {
		file = typeof json === 'string' ? (JSON.parse(json) as FoundryDryRunFile) : json;
	} catch {
		return null;
	}
	const items = file?.transactions;
	if (!Array.isArray(items) || items.length === 0) return null;
	const firstNonce = options?.firstNonce;
	let broadcast: FoundryBroadcastJson = {
		transactions: items.map((item, i) => {
			const tx = item.transaction ? {...item.transaction} : undefined;
			if (tx && firstNonce != null) {
				tx.nonce = `0x${(firstNonce + i).toString(16)}`;
			}
			return {transaction: tx ?? item.transaction};
		}),
		chain: file.chain,
	};
	if (options?.feeParams) {
		broadcast = augmentBroadcastWithFees(broadcast, {
			chainDetail: options.chainDetail,
			feeParams: options.feeParams,
		});
	}
	const signatureTexts = items.map(item => {
		const fn = item.function;
		if (fn && typeof fn === 'string') {
			const args = Array.isArray(item.arguments) ? item.arguments : [];
			const argsStr = args
				.map(a =>
					typeof a === 'string' && a.length > 42
						? `${a.slice(0, 10)}…${a.slice(-8)}`
						: String(a),
				)
				.join(', ');
			return argsStr ? `${fn}(${argsStr})` : fn;
		}
		const txType = String(item.transactionType ?? '').toUpperCase();
		if (txType === 'CREATE2' && item.contractName) {
			return `CREATE2 ${item.contractName}`;
		}
		if (txType === 'CREATE' && item.contractName) {
			return `CREATE ${item.contractName}`;
		}
		if (
			(txType === 'CREATE' || txType === 'CREATE2') &&
			item.contractAddress
		) {
			return txType === 'CREATE2'
				? 'CREATE2 (contract deploy)'
				: 'CREATE (contract deploy)';
		}
		const tx = item.transaction;
		const hasTo =
			tx &&
			tx.to != null &&
			String(tx.to).trim() !== '' &&
			String(tx.to).trim() !== '0x';
		const hasValue =
			tx && tx.value != null && hexToBigInt(tx.value) > BIGINT_0;
		if (hasTo && !item.contractAddress && hasValue) return 'transfer (value)';
		if (hasTo) return 'call';
		return '';
	});
	const destinationAddresses = items.map(item => {
		const tx = item.transaction;
		const to =
			tx &&
			tx.to != null &&
			String(tx.to).trim() !== '' &&
			String(tx.to).trim() !== '0x'
				? String(tx.to).trim()
				: item.contractAddress != null
					? String(item.contractAddress).trim()
					: '';
		if (!to) return '';
		return to.startsWith('0x') ? to : `0x${to}`;
	});
	const chainIdStr = file.chain != null ? String(file.chain) : '';
	if (!chainIdStr || chainIdStr.trim() === '364865') return null;
	try {
		return generateSignRequestWithFoundryScript(broadcast, {
			signatureTexts,
			signatureText: signatureTexts[0],
			destinationAddresses,
			destinationAddress: destinationAddresses[0],
			destinationChainID: chainIdStr.trim(),
		});
	} catch {
		return null;
	}
}
