import {
	buildManagementQueryPath,
	managementGet,
	managementPost,
} from '../api/management-api.js';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	buildManagementPostRequest,
	managementSign,
	DEFAULT_MANAGEMENT_SIGNING,
} from './management-signer.js';
import type {SdkResult} from './result.js';

export type RailgunKeyGenBalance = {
	tokenAddress: string;
	spendable: string;
	pending: string;
	symbol?: string;
};

export type RailgunKeyGenChain = {
	chainId: number;
	scanStatus: string;
	balances: RailgunKeyGenBalance[];
	notes?: string;
	updatedAt: string;
};

export type RailgunKeyGenSpend = {
	spendId: string;
	status: string;
	kind: string;
	chainId: number;
	tokenAddress: string;
	amountWei: string;
	recipientAddress: string;
	memoText: string;
	originator: string;
	createdAt: string;
	deadline: string;
	approvals: string[];
	quorum: number;
	txHash: string;
	error: string;
};

export type RailgunKeyGenPublic = {
	walletConfigured: boolean;
	railgunAddress: string;
	shieldSignature: string;
	walletId: string;
	quorum: number;
	chains: RailgunKeyGenChain[];
	spends: RailgunKeyGenSpend[];
	updatedAt: string;
};

export type RailgunKeyGenViewingKey = {
	shareableViewingKey: string;
	encryptionKey: string;
	railgunAddress: string;
};

export type RailgunSpendStatus = {
	status: 'pending' | 'ready' | 'executing' | 'submitted' | 'failed';
	spendId: string;
	approvals: number;
	quorum: number;
	txHash?: string;
	error?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

function balanceFrom(raw: unknown): RailgunKeyGenBalance | null {
	const row = asRecord(raw);
	if (!row) return null;
	const tokenAddress = String(row.tokenAddress ?? '').trim();
	if (!tokenAddress) return null;
	const symbol = String(row.symbol ?? '').trim();
	return {
		tokenAddress,
		spendable: String(row.spendable ?? '0'),
		pending: String(row.pending ?? '0'),
		...(symbol ? {symbol} : {}),
	};
}

export function railgunKeyGenPublicFrom(raw: unknown): RailgunKeyGenPublic {
	const row = asRecord(raw) ?? {};
	const chainsRaw = Array.isArray(row.chains) ? row.chains : [];
	const chains: RailgunKeyGenChain[] = [];
	for (const item of chainsRaw) {
		const chain = asRecord(item);
		if (!chain) continue;
		const chainId = Number(chain.chainId);
		if (!Number.isFinite(chainId) || chainId <= 0) continue;
		const balances = Array.isArray(chain.balances)
			? chain.balances.map(balanceFrom).filter((entry): entry is RailgunKeyGenBalance => entry != null)
			: [];
		chains.push({
			chainId,
			scanStatus: String(chain.scanStatus ?? ''),
			balances,
			notes: String(chain.notes ?? ''),
			updatedAt: String(chain.updatedAt ?? ''),
		});
	}
	const spendsRaw = Array.isArray(row.spends) ? row.spends : [];
	const spends: RailgunKeyGenSpend[] = [];
	for (const item of spendsRaw) {
		const spend = asRecord(item);
		if (!spend) continue;
		const spendId = String(spend.spendId ?? '').trim();
		if (!spendId) continue;
		const approvals = Array.isArray(spend.approvals)
			? spend.approvals.map((key) => String(key)).filter(Boolean)
			: [];
		spends.push({
			spendId,
			status: String(spend.status ?? ''),
			kind: String(spend.kind ?? ''),
			chainId: Number(spend.chainId) || 0,
			tokenAddress: String(spend.tokenAddress ?? ''),
			amountWei: String(spend.amountWei ?? ''),
			recipientAddress: String(spend.recipientAddress ?? ''),
			memoText: String(spend.memoText ?? ''),
			originator: String(spend.originator ?? ''),
			createdAt: String(spend.createdAt ?? ''),
			deadline: String(spend.deadline ?? ''),
			approvals,
			quorum: Number(spend.quorum) || Number(row.quorum) || 0,
			txHash: String(spend.txHash ?? ''),
			error: String(spend.error ?? ''),
		});
	}
	return {
		walletConfigured: row.walletConfigured === true,
		railgunAddress: String(row.railgunAddress ?? ''),
		shieldSignature: String(row.shieldSignature ?? '').trim(),
		walletId: String(row.walletId ?? ''),
		quorum: Number(row.quorum) || 0,
		chains,
		spends,
		updatedAt: String(row.updatedAt ?? ''),
	};
}

async function signedPost<T>(
	config: NodeSdkConfig,
	path: string,
	fields: Record<string, unknown>,
	timeoutMs: number,
): Promise<SdkResult<T>> {
	const built = await buildManagementPostRequest(config, {
		path,
		buildRequestFields: () => fields,
	}, DEFAULT_MANAGEMENT_SIGNING);
	if (!built.ok) return built;
	const signed = await managementSign(config, DEFAULT_MANAGEMENT_SIGNING, built.data.unsignedBody);
	if (!signed.ok) return signed;
	return managementPost<T>(config, path, signed.data, {timeoutMs});
}

export async function fetchKeyGenRailgun(
	config: NodeSdkConfig,
	keyGenId: string,
): Promise<SdkResult<RailgunKeyGenPublic>> {
	const raw = await managementGet<unknown>(
		config,
		buildManagementQueryPath('/getKeyGenRailgun', {id: keyGenId}),
	);
	if (!raw.ok) return raw;
	return {ok: true, data: railgunKeyGenPublicFrom(raw.data)};
}

export async function putKeyGenRailgunWallet(
	config: NodeSdkConfig,
	wallet: {
		keyGenId: string;
		railgunAddress: string;
		viewingKey: string;
		viewEncryptionKey: string;
		shares: readonly {nodeKey: string; share: string}[];
	},
): Promise<SdkResult<{railgunAddress: string}>> {
	const shares = [...wallet.shares]
		.map((share) => ({nodeKey: share.nodeKey, share: share.share}))
		.sort((left, right) => (left.nodeKey < right.nodeKey ? -1 : left.nodeKey > right.nodeKey ? 1 : 0));
	const posted = await signedPost<{railgunAddress?: string}>(
		config,
		'/putKeyGenRailgunWallet',
		{
			keyGenId: wallet.keyGenId,
			railgunAddress: wallet.railgunAddress,
			shares,
			viewEncryptionKey: wallet.viewEncryptionKey,
			viewingKey: wallet.viewingKey,
		},
		20_000,
	);
	if (!posted.ok) return posted;
	return {
		ok: true,
		data: {railgunAddress: String(posted.data?.railgunAddress ?? wallet.railgunAddress)},
	};
}

function spendStatusFrom(raw: Record<string, unknown> | null, fallback?: RailgunSpendStatus): SdkResult<RailgunSpendStatus> {
	const row = raw ?? {};
	const status = String(row.status ?? fallback?.status ?? '');
	if (
		status !== 'pending' &&
		status !== 'ready' &&
		status !== 'executing' &&
		status !== 'submitted' &&
		status !== 'failed'
	) {
		return {ok: false, reason: 'Railgun spend status was not returned.'};
	}
	const txHash = String(row.txHash ?? '').trim();
	const error = String(row.error ?? '').trim();
	return {
		ok: true,
		data: {
			status,
			spendId: String(row.spendId ?? fallback?.spendId ?? ''),
			approvals: Number(row.approvals ?? 0),
			quorum: Number(row.quorum ?? 0),
			...(txHash ? {txHash} : {}),
			...(error ? {error} : {}),
		},
	};
}

export async function fetchKeyGenRailgunViewingKey(
	config: NodeSdkConfig,
	keyGenId: string,
): Promise<SdkResult<RailgunKeyGenViewingKey>> {
	const posted = await signedPost<Record<string, unknown>>(
		config,
		'/getKeyGenRailgunWallet',
		{keyGenId},
		20_000,
	);
	if (!posted.ok) return posted;
	const row = posted.data ?? {};
	const viewing = {
		shareableViewingKey: String(row.shareableViewingKey ?? ''),
		encryptionKey: String(row.encryptionKey ?? ''),
		railgunAddress: String(row.railgunAddress ?? ''),
	};
	if (!viewing.shareableViewingKey || !viewing.encryptionKey) {
		return {ok: false, reason: 'Railgun viewing key is not stored on this KeyGen.'};
	}
	return {ok: true, data: viewing};
}

export async function proposeKeyGenRailgunSpend(
	config: NodeSdkConfig,
	spend: {
		keyGenId: string;
		spendId: string;
		kind: 'transfer' | 'unshield';
		chainId: number;
		tokenAddress: string;
		amountWei: string;
		recipientAddress: string;
		memoText?: string;
	},
): Promise<SdkResult<RailgunSpendStatus>> {
	const posted = await signedPost<Record<string, unknown>>(
		config,
		'/keyGenRailgunSpendPropose',
		{
			amountWei: spend.amountWei,
			chainId: spend.chainId,
			keyGenId: spend.keyGenId,
			kind: spend.kind,
			memoText: spend.memoText ?? '',
			recipientAddress: spend.recipientAddress,
			spendId: spend.spendId,
			tokenAddress: spend.tokenAddress,
		},
		20_000,
	);
	if (!posted.ok) return posted;
	return spendStatusFrom(posted.data);
}

export async function agreeKeyGenRailgunSpend(
	config: NodeSdkConfig,
	keyGenId: string,
	spendId: string,
): Promise<SdkResult<RailgunSpendStatus>> {
	const posted = await signedPost<Record<string, unknown>>(
		config,
		'/keyGenRailgunSpendAgree',
		{keyGenId, spendId},
		20_000,
	);
	if (!posted.ok) return posted;
	return spendStatusFrom(posted.data);
}

export async function executeKeyGenRailgunSpend(
	config: NodeSdkConfig,
	keyGenId: string,
	spendId: string,
): Promise<SdkResult<RailgunSpendStatus>> {
	const posted = await signedPost<Record<string, unknown>>(
		config,
		'/keyGenRailgunSpendExecute',
		{keyGenId, spendId},
		390_000,
	);
	if (!posted.ok) return posted;
	return spendStatusFrom(posted.data);
}

export async function rejectKeyGenRailgunSpend(
	config: NodeSdkConfig,
	keyGenId: string,
	spendId: string,
): Promise<SdkResult<{message: string}>> {
	const posted = await signedPost<Record<string, unknown>>(
		config,
		'/keyGenRailgunSpendReject',
		{keyGenId, spendId},
		20_000,
	);
	if (!posted.ok) return posted;
	const status = String(posted.data.status ?? '').trim();
	if (status !== 'rejected') {
		return {ok: false, reason: 'Railgun spend was not rejected.'};
	}
	return {ok: true, data: {message: `Railgun spend ${spendId} rejected.`}};
}

export async function putKeyGenRailgunBalances(
	config: NodeSdkConfig,
	args: {
		keyGenId: string;
		chainId: number;
		scanStatus: string;
		balances: RailgunKeyGenBalance[];
		notes: string;
		updatedAt: string;
	},
): Promise<SdkResult<{ok: true}>> {
	const balances = args.balances.map((row) => ({
		tokenAddress: row.tokenAddress,
		spendable: row.spendable,
		pending: row.pending,
		...(row.symbol ? {symbol: row.symbol} : {}),
	}));
	const posted = await signedPost<unknown>(
		config,
		'/putKeyGenRailgunBalances',
		{
			balances,
			chainId: args.chainId,
			keyGenId: args.keyGenId,
			notes: args.notes,
			scanStatus: args.scanStatus,
			updatedAt: args.updatedAt,
		},
		20_000,
	);
	if (!posted.ok) return posted;
	return {ok: true, data: {ok: true}};
}
