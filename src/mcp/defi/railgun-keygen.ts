import {randomBytes} from 'node:crypto';
import {english, generateMnemonic} from 'viem/accounts';
import type {NodeSdkConfig} from '../../config/schema.js';
import {fetchKeyGenResult} from '../../core/keygen-read.js';
import {
	agreeKeyGenRailgunSpend,
	fetchKeyGenRailgun,
	fetchKeyGenRailgunViewingKey,
	proposeKeyGenRailgunSpend,
	putKeyGenRailgunBalances,
	putKeyGenRailgunWallet,
	type RailgunKeyGenBalance,
	type RailgunKeyGenPublic,
	type RailgunSpendStatus,
} from '../../core/railgun-keygen-store.js';
import {combineShares, railgunSigningQuorum, splitSecret} from '../../core/shamir.js';
import {resolveChainRegistryEntry} from '../../core/registry/networks.js';
import {chainDetailFromRegistry} from './input-adapter.js';

const RAILGUN_MODULE = '@continuumdao/ctm-mpc-defi/protocols/evm/railgun';

type RailgunModule = {
	createRailgunBrowserWallet: (args: {
		encryptionKey: string;
		mnemonic: string;
		chainId: number;
	}) => Promise<{walletId: string; encryptionKey: string; railgunAddress: string}>;
	railgunShareableViewingKey: (walletId: string) => Promise<string>;
	openRailgunViewOnlyWallet: (args: {
		encryptionKey: string;
		shareableViewingKey: string;
		chainId: number;
	}) => Promise<{walletId: string; railgunAddress: string}>;
	discardRailgunWallet: (walletId: string) => Promise<void>;
	scanRailgunPrivateBalances: (args: {
		chainId: number;
		rpcUrl: string;
		walletId: string;
	}) => Promise<{scanStatus: string; balances: RailgunKeyGenBalance[]}>;
	railgunPrivateTransfer: (args: Record<string, unknown>) => Promise<{txHash: string}>;
	railgunUnshield: (args: Record<string, unknown>) => Promise<{txHash: string}>;
};

async function railgunModule(): Promise<RailgunModule> {
	return (await import(RAILGUN_MODULE as string)) as RailgunModule;
}

async function chainRpc(config: NodeSdkConfig, chainId: number) {
	const chain = await resolveChainRegistryEntry(config, chainId);
	if (!chain.ok) throw new Error(chain.reason);
	const rpcUrl = String(chain.data.rpcGateway ?? '').trim();
	if (!rpcUrl) {
		throw new Error(`Chain registry entry for chainId ${chainId} has no rpcGateway.`);
	}
	return {rpcUrl, chainDetail: chainDetailFromRegistry(chain.data)};
}

function chainSnapshot(record: RailgunKeyGenPublic, chainId: number) {
	return record.chains.find((chain) => chain.chainId === chainId);
}

function keyGenNodes(record: {keylist?: readonly string[]; KeyList?: readonly string[]}): string[] {
	const raw = record.keylist ?? record.KeyList ?? [];
	return [...raw].map((key) => String(key).trim()).filter(Boolean).sort();
}

export async function ensureRailgunKeyGenWallet(
	config: NodeSdkConfig,
	keyGenId: string,
	options: {chainId?: number} = {},
): Promise<{railgunAddress: string; created: boolean}> {
	const existing = await fetchKeyGenRailgun(config, keyGenId);
	if (!existing.ok) throw new Error(existing.reason);
	if (existing.data.walletConfigured && existing.data.railgunAddress && existing.data.quorum >= 2) {
		return {railgunAddress: existing.data.railgunAddress, created: false};
	}
	const kg = await fetchKeyGenResult(config, keyGenId);
	if (!kg.ok) throw new Error(kg.reason);
	const nodes = keyGenNodes(kg.data);
	const keyType = String(kg.data.KeyType ?? kg.data.keyType ?? '');
	const threshold = Number(kg.data.Threshold ?? kg.data.threshold);
	const quorum = railgunSigningQuorum(keyType, threshold);
	if (!Number.isFinite(quorum) || quorum < 2 || nodes.length < quorum) {
		throw new Error('This KeyGen needs a signing quorum of at least 2 so no single node can spend the 0zk wallet.');
	}
	const mnemonic = generateMnemonic(english);
	const railgun = await railgunModule();
	const created = await railgun.createRailgunBrowserWallet({
		encryptionKey: randomBytes(32).toString('hex'),
		mnemonic,
		chainId: options.chainId && options.chainId > 0 ? options.chainId : 1,
	});
	const viewingKey = await railgun.railgunShareableViewingKey(created.walletId);
	await railgun.discardRailgunWallet(created.walletId);
	const shares = splitSecret(new TextEncoder().encode(mnemonic), quorum, nodes.length);
	const stored = await putKeyGenRailgunWallet(config, {
		keyGenId,
		railgunAddress: created.railgunAddress,
		viewingKey,
		viewEncryptionKey: randomBytes(32).toString('hex'),
		shares: nodes.map((nodeKey, index) => ({nodeKey, share: shares[index]!})),
	});
	if (!stored.ok) throw new Error(stored.reason);
	return {railgunAddress: stored.data.railgunAddress, created: true};
}

export async function scanRailgunKeyGenBalances(
	config: NodeSdkConfig,
	keyGenId: string,
	chainId: number,
): Promise<{
	railgunAddress: string;
	walletConfigured: boolean;
	chainId: number;
	scanned: boolean;
	scanStatus: string;
	balances: RailgunKeyGenBalance[];
	notes: string;
}> {
	const record = await fetchKeyGenRailgun(config, keyGenId);
	if (!record.ok) throw new Error(record.reason);
	if (!record.data.walletConfigured) {
		return {
			railgunAddress: '',
			walletConfigured: false,
			chainId,
			scanned: false,
			scanStatus: 'unscanned',
			balances: [],
			notes: 'Call ctm_railgun_ensure_wallet before reading shielded balances.',
		};
	}
	const wallet = await fetchKeyGenRailgunViewingKey(config, keyGenId);
	if (!wallet.ok) throw new Error(wallet.reason);
	const railgun = await railgunModule();
	const opened = await railgun.openRailgunViewOnlyWallet({
		encryptionKey: wallet.data.encryptionKey,
		shareableViewingKey: wallet.data.shareableViewingKey,
		chainId,
	});
	const {rpcUrl} = await chainRpc(config, chainId);
	const scanned = await railgun.scanRailgunPrivateBalances({
		chainId,
		rpcUrl,
		walletId: opened.walletId,
	});
	const notes =
		scanned.balances.length === 0
			? 'No private balance on this chain yet.'
			: 'Private balances from this KeyGen scan.';
	const updatedAt = new Date().toISOString();
	const saved = await putKeyGenRailgunBalances(config, {
		keyGenId,
		chainId,
		scanStatus: scanned.scanStatus,
		balances: scanned.balances,
		notes,
		updatedAt,
	});
	if (!saved.ok) throw new Error(saved.reason);
	return {
		railgunAddress: record.data.railgunAddress,
		walletConfigured: true,
		chainId,
		scanned: true,
		scanStatus: scanned.scanStatus,
		balances: scanned.balances,
		notes,
	};
}

export async function readRailgunKeyGenBalances(
	config: NodeSdkConfig,
	keyGenId: string,
	chainId: number,
	refresh: boolean,
) {
	if (refresh) return scanRailgunKeyGenBalances(config, keyGenId, chainId);
	const record = await fetchKeyGenRailgun(config, keyGenId);
	if (!record.ok) throw new Error(record.reason);
	const chain = chainSnapshot(record.data, chainId);
	if (!record.data.walletConfigured) {
		return {
			railgunAddress: '',
			walletConfigured: false,
			chainId,
			scanned: false,
			scanStatus: 'unscanned',
			balances: [],
			notes: 'Call ctm_railgun_ensure_wallet before reading shielded balances.',
		};
	}
	if (!chain || chain.scanStatus === 'scanning' || chain.scanStatus === '') {
		return scanRailgunKeyGenBalances(config, keyGenId, chainId);
	}
	return {
		railgunAddress: record.data.railgunAddress,
		walletConfigured: true,
		chainId,
		scanned: chain.scanStatus === 'ready' || chain.scanStatus === 'empty',
		scanStatus: chain.scanStatus,
		balances: chain.balances,
		notes: chain.notes || 'Private balances stored on this KeyGen.',
	};
}

async function spend(
	config: NodeSdkConfig,
	kind: 'transfer' | 'unshield',
	args: {
		keyGenId: string;
		chainId: number;
		tokenAddress: string;
		amountWei: string;
		recipientAddress?: string;
		memoText?: string;
	},
): Promise<RailgunSpendStatus> {
	let recipientAddress = (args.recipientAddress ?? '').trim();
	if (kind === 'unshield' && !recipientAddress) {
		const kg = await fetchKeyGenResult(config, args.keyGenId);
		if (!kg.ok) throw new Error(kg.reason);
		recipientAddress = String(kg.data.ethereumaddress ?? kg.data.EthereumAddress ?? '').trim();
	}
	if (!recipientAddress) throw new Error('Recipient address is required.');
	const spendId = randomBytes(16).toString('hex');
	const proposed = await proposeKeyGenRailgunSpend(config, {
		keyGenId: args.keyGenId,
		spendId,
		kind,
		chainId: args.chainId,
		tokenAddress: args.tokenAddress,
		amountWei: args.amountWei,
		recipientAddress,
		memoText: args.memoText,
	});
	if (!proposed.ok) throw new Error(proposed.reason);
	const agreed = await agreeKeyGenRailgunSpend(config, args.keyGenId, spendId);
	if (!agreed.ok) throw new Error(agreed.reason);
	return agreed.data;
}

export async function completeRailgunKeyGenSpend(
	config: NodeSdkConfig,
	body: {
		keyGenId: string;
		spendId: string;
		kind: string;
		chainId: number;
		tokenAddress: string;
		amountWei: string;
		recipientAddress: string;
		memoText?: string;
		shares: readonly string[];
	},
): Promise<{txHash: string}> {
	const mnemonic = combineShares(body.shares);
	const railgun = await railgunModule();
	const created = await railgun.createRailgunBrowserWallet({
		encryptionKey: randomBytes(32).toString('hex'),
		mnemonic,
		chainId: body.chainId,
	});
	try {
		const {rpcUrl, chainDetail} = await chainRpc(config, body.chainId);
		const actionArgs = {
			chainId: body.chainId,
			rpcUrl,
			chainDetail,
			tokenAddress: body.tokenAddress,
			amountWei: body.amountWei,
			recipientAddress: body.recipientAddress,
			memoText: body.memoText,
		};
		const result =
			body.kind === 'unshield'
				? await railgun.railgunUnshield(actionArgs)
				: await railgun.railgunPrivateTransfer(actionArgs);
		await scanRailgunKeyGenBalances(config, body.keyGenId, body.chainId).catch(() => undefined);
		return result;
	} finally {
		await railgun.discardRailgunWallet(created.walletId).catch(() => undefined);
	}
}

export function railgunKeyGenTransfer(
	config: NodeSdkConfig,
	args: {
		keyGenId: string;
		chainId: number;
		tokenAddress: string;
		amountWei: string;
		recipientAddress: string;
		memoText?: string;
	},
) {
	return spend(config, 'transfer', args);
}

export function railgunKeyGenUnshield(
	config: NodeSdkConfig,
	args: {
		keyGenId: string;
		chainId: number;
		tokenAddress: string;
		amountWei: string;
		recipientAddress?: string;
	},
) {
	return spend(config, 'unshield', args);
}

export async function runRailgunKeyGenTool(
	config: NodeSdkConfig,
	toolName: string,
	input: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
	const keyGenId = String(input.keyGenId ?? '').trim();
	const chainId = Number(input.chainId);
	if (toolName === 'ctm_railgun_ensure_wallet') {
		if (!keyGenId) throw new Error('keyGenId is required.');
		return ensureRailgunKeyGenWallet(config, keyGenId, {
			chainId: Number.isFinite(chainId) ? chainId : undefined,
		});
	}
	if (toolName === 'ctm_railgun_agree_spend') {
		if (!keyGenId) throw new Error('keyGenId is required.');
		const spendId = String(input.spendId ?? '').trim();
		if (!spendId) throw new Error('spendId is required.');
		const agreed = await agreeKeyGenRailgunSpend(config, keyGenId, spendId);
		if (!agreed.ok) throw new Error(agreed.reason);
		return agreed.data;
	}
	if (!keyGenId) throw new Error('keyGenId is required.');
	if (!Number.isFinite(chainId) || chainId <= 0) throw new Error('chainId must be a positive integer.');
	if (toolName === 'ctm_railgun_fetch_private_balances') {
		const refresh = input.refresh === true || input.refresh === 'true';
		return readRailgunKeyGenBalances(config, keyGenId, chainId, refresh);
	}
	if (toolName === 'ctm_railgun_private_transfer') {
		return railgunKeyGenTransfer(config, {
			keyGenId,
			chainId,
			tokenAddress: String(input.tokenAddress ?? ''),
			amountWei: String(input.amountWei ?? ''),
			recipientAddress: String(input.recipientAddress ?? ''),
			memoText: typeof input.memoText === 'string' ? input.memoText : undefined,
		});
	}
	if (toolName === 'ctm_railgun_unshield') {
		return railgunKeyGenUnshield(config, {
			keyGenId,
			chainId,
			tokenAddress: String(input.tokenAddress ?? ''),
			amountWei: String(input.amountWei ?? ''),
			recipientAddress: typeof input.recipientAddress === 'string' ? input.recipientAddress : undefined,
		});
	}
	return null;
}
