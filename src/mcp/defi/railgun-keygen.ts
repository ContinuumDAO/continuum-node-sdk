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
	type RailgunKeyGenChain,
	type RailgunKeyGenPublic,
	type RailgunSpendStatus,
} from '../../core/railgun-keygen-store.js';
import {combineShares, railgunSigningQuorum, splitSecret} from '../../core/shamir.js';
import {resolveRailgunContactRecipient} from '../../core/mpc/resolve-recipient.js';
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
		onProgress?: (progress: number) => void;
	}) => Promise<{scanStatus: string; balances: RailgunKeyGenBalance[]; settled?: boolean}>;
	scanSpendingWalletNotes: (args: {chainId: number; rpcUrl: string; walletId: string}) => Promise<void>;
	railgunPrivateTransfer: (args: Record<string, unknown>) => Promise<{txHash: string}>;
	railgunUnshield: (args: Record<string, unknown>) => Promise<{txHash: string}>;
	quoteRailgunFee: (args: Record<string, unknown>) => Promise<{
		kind: string;
		amountWei: string;
		protocolFeeBasisPoints: string;
		protocolFeeWei: string;
		receivedWei: string;
		broadcasterFeeWei: string;
		broadcasterTokenAddress: string;
		totalDebitWei: string;
		broadcasterError?: string;
	}>;
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

function shieldSignatureField(signature: string | undefined): {shieldSignature?: string} {
	const trimmed = signature?.trim() ?? '';
	return trimmed ? {shieldSignature: trimmed} : {};
}

function keyGenNodes(record: {keylist?: readonly string[]; KeyList?: readonly string[]}): string[] {
	const raw = record.keylist ?? record.KeyList ?? [];
	return [...raw].map((key) => String(key).trim()).filter(Boolean).sort();
}

export async function ensureRailgunKeyGenWallet(
	config: NodeSdkConfig,
	keyGenId: string,
	options: {chainId?: number} = {},
): Promise<{railgunAddress: string; created: boolean; shieldSignature?: string}> {
	const existing = await fetchKeyGenRailgun(config, keyGenId);
	if (!existing.ok) throw new Error(existing.reason);
	if (existing.data.walletConfigured && existing.data.railgunAddress && existing.data.quorum >= 2) {
		return {
			railgunAddress: existing.data.railgunAddress,
			created: false,
			...shieldSignatureField(existing.data.shieldSignature),
		};
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

const RAILGUN_CACHED_SCAN_WAIT_MS = 5000;

const RAILGUN_SCAN_STILL_RUNNING_NOTE =
	'Showing the last private balances. The note scan is still running on this node.';

const RAILGUN_SCAN_PROGRESS_NOTE = 'Scanning private notes on this node.';

function progressPercent(progress: number): number {
	if (!Number.isFinite(progress) || progress < 0) return 0;
	const fraction = progress > 1 && progress <= 100 ? progress / 100 : progress;
	return Math.max(0, Math.min(100, Math.round(fraction * 100)));
}

function scanningNote(percent: number | null): string {
	return percent == null ? RAILGUN_SCAN_PROGRESS_NOTE : `${RAILGUN_SCAN_PROGRESS_NOTE} ${percent}%`;
}

const RAILGUN_SCAN_UNFINISHED_NOTE = 'Showing the last private balances. The note scan did not finish.';

type RailgunKeyGenScanResult = {
	railgunAddress: string;
	walletConfigured: boolean;
	chainId: number;
	scanned: boolean;
	scanStatus: string;
	balances: RailgunKeyGenBalance[];
	notes: string;
	shieldSignature?: string;
};

const railgunScansInFlight = new Map<string, Promise<RailgunKeyGenScanResult>>();

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function storedBalancesAreReusable(chain: RailgunKeyGenChain | undefined): chain is RailgunKeyGenChain {
	return !!chain && chain.balances.length > 0 && (chain.scanStatus === 'ready' || chain.scanStatus === 'empty');
}

function unconfiguredScan(chainId: number): RailgunKeyGenScanResult {
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

function scanResultFromChain(
	record: RailgunKeyGenPublic,
	chainId: number,
	chain: {scanStatus: string; balances: RailgunKeyGenBalance[]},
	notes: string,
): RailgunKeyGenScanResult {
	return {
		railgunAddress: record.railgunAddress,
		walletConfigured: true,
		chainId,
		scanned: true,
		scanStatus: chain.scanStatus,
		balances: chain.balances,
		notes,
		...shieldSignatureField(record.shieldSignature),
	};
}

async function keepStoredRailgunScan(
	config: NodeSdkConfig,
	keyGenId: string,
	chainId: number,
	record: RailgunKeyGenPublic,
	notes: string,
): Promise<RailgunKeyGenScanResult> {
	const chain = chainSnapshot(record, chainId);
	if (!storedBalancesAreReusable(chain)) throw new Error('Railgun note scan stopped before it finished.');
	const updatedAt = new Date().toISOString();
	const saved = await putKeyGenRailgunBalances(config, {
		keyGenId,
		chainId,
		scanStatus: chain.scanStatus,
		balances: chain.balances,
		notes,
		updatedAt,
	});
	if (!saved.ok) throw new Error(saved.reason);
	return scanResultFromChain(record, chainId, chain, notes);
}

async function persistRailgunKeyGenScan(
	config: NodeSdkConfig,
	keyGenId: string,
	chainId: number,
): Promise<RailgunKeyGenScanResult> {
	const record = await fetchKeyGenRailgun(config, keyGenId);
	if (!record.ok) throw new Error(record.reason);
	if (!record.data.walletConfigured) return unconfiguredScan(chainId);
	const wallet = await fetchKeyGenRailgunViewingKey(config, keyGenId);
	if (!wallet.ok) throw new Error(wallet.reason);
	const railgun = await railgunModule();
	const opened = await railgun.openRailgunViewOnlyWallet({
		encryptionKey: wallet.data.encryptionKey,
		shareableViewingKey: wallet.data.shareableViewingKey,
		chainId,
	});
	const {rpcUrl} = await chainRpc(config, chainId);
	const priorBalances = chainSnapshot(record.data, chainId)?.balances ?? [];
	let closed = false;
	let tail = Promise.resolve();
	let lastPct = -1;
	let lastAt = 0;
	const enqueue = (task: () => Promise<void>) => {
		tail = tail.then(task, task).then(
			() => undefined,
			() => undefined,
		);
	};
	const saveScanning = (percent: number | null) => {
		enqueue(async () => {
			if (closed) return;
			await putKeyGenRailgunBalances(config, {
				keyGenId,
				chainId,
				scanStatus: 'scanning',
				balances: priorBalances,
				notes: scanningNote(percent),
				updatedAt: new Date().toISOString(),
			}).catch(() => undefined);
		});
	};
	saveScanning(null);
	let scanned: {scanStatus: string; balances: RailgunKeyGenBalance[]; settled?: boolean};
	try {
		scanned = await railgun.scanRailgunPrivateBalances({
			chainId,
			rpcUrl,
			walletId: opened.walletId,
			onProgress: (progress) => {
				if (closed) return;
				const pct = progressPercent(progress);
				const now = Date.now();
				if (pct === lastPct) return;
				if (lastAt !== 0 && now - lastAt < 3000 && pct - lastPct < 5) return;
				lastPct = pct;
				lastAt = now;
				saveScanning(pct);
			},
		});
	} catch (err) {
		closed = true;
		await tail;
		if (storedBalancesAreReusable(chainSnapshot(record.data, chainId))) {
			return keepStoredRailgunScan(config, keyGenId, chainId, record.data, RAILGUN_SCAN_UNFINISHED_NOTE);
		}
		throw err;
	}
	closed = true;
	await tail;
	const stored = chainSnapshot(record.data, chainId);
	if (scanned.settled === false && scanned.balances.length === 0 && storedBalancesAreReusable(stored)) {
		return keepStoredRailgunScan(config, keyGenId, chainId, record.data, RAILGUN_SCAN_UNFINISHED_NOTE);
	}
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
		...shieldSignatureField(record.data.shieldSignature),
	};
}

export async function scanRailgunKeyGenBalances(
	config: NodeSdkConfig,
	keyGenId: string,
	chainId: number,
): Promise<RailgunKeyGenScanResult> {
	const record = await fetchKeyGenRailgun(config, keyGenId);
	if (!record.ok) throw new Error(record.reason);
	if (!record.data.walletConfigured) return unconfiguredScan(chainId);
	const flightKey = `${keyGenId}:${chainId}`;
	let job = railgunScansInFlight.get(flightKey);
	if (!job) {
		job = persistRailgunKeyGenScan(config, keyGenId, chainId).finally(() => {
			if (railgunScansInFlight.get(flightKey) === job) railgunScansInFlight.delete(flightKey);
		});
		railgunScansInFlight.set(flightKey, job);
		void job.catch(() => undefined);
	}
	const stored = chainSnapshot(record.data, chainId);
	if (!storedBalancesAreReusable(stored)) return job;
	const outcome = await Promise.race([
		job.then(
			(value) => ({kind: 'done' as const, value}),
			() => ({kind: 'failed' as const}),
		),
		delay(RAILGUN_CACHED_SCAN_WAIT_MS).then(() => ({kind: 'wait' as const})),
	]);
	if (outcome.kind === 'done') return outcome.value;
	return scanResultFromChain(
		record.data,
		chainId,
		stored,
		outcome.kind === 'failed' ? RAILGUN_SCAN_UNFINISHED_NOTE : RAILGUN_SCAN_STILL_RUNNING_NOTE,
	);
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
		...shieldSignatureField(record.data.shieldSignature),
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
		purpose?: string;
	},
): Promise<RailgunSpendStatus & {fee?: Record<string, unknown>}> {
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
		purpose: args.purpose,
	});
	if (!proposed.ok) throw new Error(proposed.reason);
	const agreed = await agreeKeyGenRailgunSpend(config, args.keyGenId, spendId);
	if (!agreed.ok) throw new Error(agreed.reason);
	let fee: Record<string, unknown> | undefined;
	try {
		fee = await quoteRailgunKeyGenFee(config, {
			keyGenId: args.keyGenId,
			chainId: args.chainId,
			kind,
			tokenAddress: args.tokenAddress,
			amountWei: args.amountWei,
			recipientAddress,
			memoText: args.memoText,
		});
	} catch (err) {
		fee = {
			kind,
			amountWei: args.amountWei,
			protocolFeeBasisPoints: '0',
			protocolFeeWei: '0',
			receivedWei: args.amountWei,
			broadcasterFeeWei: '0',
			broadcasterTokenAddress: '',
			totalDebitWei: args.amountWei,
			broadcasterError: err instanceof Error ? err.message : 'Fee quote is not available.',
		};
	}
	return {...agreed.data, ...(fee ? {fee} : {})};
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
		await railgun.scanSpendingWalletNotes({
			chainId: body.chainId,
			rpcUrl,
			walletId: created.walletId,
		});
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

const railgunViewWallets = new Map<
	string,
	Promise<{walletId: string; encryptionKey: string; railgunAddress: string}>
>();

async function railgunViewWalletForQuote(config: NodeSdkConfig, keyGenId: string, chainId: number) {
	let pending = railgunViewWallets.get(keyGenId);
	if (!pending) {
		pending = (async () => {
			const wallet = await fetchKeyGenRailgunViewingKey(config, keyGenId);
			if (!wallet.ok) throw new Error(wallet.reason);
			const railgun = await railgunModule();
			const opened = await railgun.openRailgunViewOnlyWallet({
				encryptionKey: wallet.data.encryptionKey,
				shareableViewingKey: wallet.data.shareableViewingKey,
				chainId,
			});
			return {
				walletId: opened.walletId,
				encryptionKey: wallet.data.encryptionKey,
				railgunAddress: opened.railgunAddress,
			};
		})();
		railgunViewWallets.set(keyGenId, pending);
		void pending.catch(() => {
			if (railgunViewWallets.get(keyGenId) === pending) railgunViewWallets.delete(keyGenId);
		});
	}
	return pending;
}

export async function quoteRailgunKeyGenFee(
	config: NodeSdkConfig,
	args: {
		keyGenId: string;
		chainId: number;
		kind: string;
		tokenAddress: string;
		amountWei: string;
		recipientAddress?: string;
		memoText?: string;
	},
) {
	const kind = args.kind.trim();
	if (kind !== 'shield' && kind !== 'transfer' && kind !== 'unshield') {
		throw new Error('kind must be shield, transfer, or unshield.');
	}
	const {rpcUrl, chainDetail} = await chainRpc(config, args.chainId);
	let recipientAddress = args.recipientAddress?.trim() ?? '';
	if (kind === 'transfer' && !recipientAddress.startsWith('0zk')) {
		const record = await fetchKeyGenRailgun(config, args.keyGenId);
		if (!record.ok) throw new Error(record.reason);
		if (record.data.walletConfigured) {
			try {
				const view = await railgunViewWalletForQuote(config, args.keyGenId, args.chainId);
				recipientAddress = view.railgunAddress;
			} catch {
				recipientAddress = record.data.railgunAddress || recipientAddress;
			}
		}
	}
	const railgun = await railgunModule();
	return railgun.quoteRailgunFee({
		kind,
		chainId: args.chainId,
		rpcUrl,
		chainDetail,
		tokenAddress: args.tokenAddress,
		amountWei: args.amountWei,
		recipientAddress,
		memoText: args.memoText,
	});
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
		purpose?: string;
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
		purpose?: string;
	},
) {
	return spend(config, 'unshield', args);
}

export async function storedRailgunShieldSignature(
	config: NodeSdkConfig,
	keyGenId: string,
): Promise<string> {
	const record = await fetchKeyGenRailgun(config, keyGenId);
	if (!record.ok) return '';
	return record.data.shieldSignature.trim();
}

export function railgunShieldMultisignFollowUp(bodyForSign: Record<string, unknown>): string | null {
	const raw = bodyForSign.extraJSON;
	if (typeof raw !== 'string' || !raw.trim()) return null;
	try {
		const extra = JSON.parse(raw) as {signRequestKind?: string; delivery?: {kind?: string}};
		if (extra.signRequestKind === 'personal_sign' && extra.delivery?.kind === 'railgun_shield_signature') {
			return 'This request signs the Railgun shield key. sign_request_agree, then trigger_sign_result. The signature is stored on the KeyGen. Call ctm_railgun_build_shield_multisign again with the same amount and 0zk address. Do not pass shieldSignature.';
		}
	} catch {
		return null;
	}
	return null;
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
		const thoughts = typeof input.thoughts === 'string' ? input.thoughts : undefined;
		const agreed = await agreeKeyGenRailgunSpend(config, keyGenId, spendId, thoughts);
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
		let recipientAddress = String(input.recipientAddress ?? '').trim();
		const contactName = String(input.toContactName ?? '').trim();
		if (contactName) {
			const resolved = await resolveRailgunContactRecipient(config, {toContactName: contactName, chainId});
			if (!resolved.ok) throw new Error(resolved.reason);
			if (recipientAddress && recipientAddress !== resolved.data) {
				throw new Error(
					`recipientAddress does not match the 0zk address saved for "${contactName}". Pass toContactName on its own.`,
				);
			}
			recipientAddress = resolved.data;
		}
		if (!recipientAddress) {
			throw new Error('Provide recipientAddress (a 0zk address) or toContactName.');
		}
		return railgunKeyGenTransfer(config, {
			keyGenId,
			chainId,
			tokenAddress: String(input.tokenAddress ?? ''),
			amountWei: String(input.amountWei ?? ''),
			recipientAddress,
			memoText: typeof input.memoText === 'string' ? input.memoText : undefined,
			purpose: typeof input.purpose === 'string' ? input.purpose : undefined,
		});
	}
	if (toolName === 'ctm_railgun_unshield') {
		return railgunKeyGenUnshield(config, {
			keyGenId,
			chainId,
			tokenAddress: String(input.tokenAddress ?? ''),
			amountWei: String(input.amountWei ?? ''),
			recipientAddress: typeof input.recipientAddress === 'string' ? input.recipientAddress : undefined,
			purpose: typeof input.purpose === 'string' ? input.purpose : undefined,
		});
	}
	if (toolName === 'ctm_railgun_fee_quote') {
		return quoteRailgunKeyGenFee(config, {
			keyGenId,
			chainId,
			kind: String(input.kind ?? ''),
			tokenAddress: String(input.tokenAddress ?? ''),
			amountWei: String(input.amountWei ?? '0'),
			recipientAddress: typeof input.recipientAddress === 'string' ? input.recipientAddress : undefined,
			memoText: typeof input.memoText === 'string' ? input.memoText : undefined,
		});
	}
	return null;
}
