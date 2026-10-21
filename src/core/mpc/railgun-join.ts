import {listKeyGenRequests} from '../keygen.js';
import {
	agreeKeyGenRailgunSpend,
	executeKeyGenRailgunSpend,
	fetchKeyGenRailgun,
	rejectKeyGenRailgunSpend,
	type RailgunKeyGenSpend,
} from '../railgun-keygen-store.js';
import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../result.js';

const RAILGUN_SPEND_AGREE_ID = /^RailgunSpend:(KeyGen[^:]+):([a-f0-9]{32})$/i;

export type RailgunSpendAgreeId = {
	keyGenId: string;
	spendId: string;
};

export function parseRailgunSpendAgreeId(raw: string): RailgunSpendAgreeId | null {
	const match = RAILGUN_SPEND_AGREE_ID.exec(raw.trim());
	if (!match?.[1] || !match[2]) return null;
	return {keyGenId: match[1], spendId: match[2].toLowerCase()};
}

export function railgunSpendAgreeId(keyGenId: string, spendId: string): string {
	return `RailgunSpend:${keyGenId}:${spendId}`;
}

export function railgunSpendJoinOpen(spend: Pick<RailgunKeyGenSpend, 'status' | 'deadline'>, now = Date.now()): boolean {
	if (spend.status !== 'pending' && spend.status !== '') return false;
	const deadline = spend.deadline.trim();
	if (!deadline) return true;
	const parsed = Date.parse(deadline);
	return Number.isNaN(parsed) || parsed > now;
}

export type RailgunJoinSummary = {
	requestId: string;
	status: 'pending' | 'ready';
	lifecycleStatus: 'pending' | 'ready';
	getSigTriggered: false;
	destinationChainId: string;
	keyGenId: string;
	proposalUsedCustomGas: false;
	isBatch: false;
	batchLength: 1;
	joinAgreedCount: number;
	joinKeyCount: number;
	localJoinAgreed: boolean;
	isOriginatorLocal: boolean;
	localAgreementPending: boolean;
	isExpired: false;
	agreementKind: 'railgun_spend';
	railgunKind: string;
	amountWei: string;
	tokenAddress: string;
	recipientAddress: string;
	memoText?: string;
	deadline?: string;
	proposedAt?: string;
};

export type RailgunJoinCheck = {
	requestId: string;
	localJoinAgreed: boolean;
	isOriginatorLocal: boolean;
	localAgreementPending: boolean;
	joinAgreedCount: number;
	joinKeyCount: number;
	note: string;
	agreementKind: 'railgun_spend';
};

function kindLabel(kind: string): string {
	if (kind === 'transfer') return 'Private transfer';
	if (kind === 'unshield') return 'Unshield';
	return 'Railgun spend';
}

function joinNote(spend: RailgunKeyGenSpend, localPending: boolean): string {
	const memo = spend.memoText.trim() ? ` Memo: ${spend.memoText.trim()}.` : '';
	const proposed = spend.createdAt.trim() ? ` Proposed ${spend.createdAt.trim()}.` : '';
	const deadline = spend.deadline.trim() ? ` Deadline ${spend.deadline.trim()}.` : ' Deadline not set.';
	const action = localPending
		? ' This node has not agreed. Confirm the amount, token, and destination with the user, then call sign_request_agree with this requestId. accept false rejects it. Do not call trigger_sign_result or get_sign_request_by_id.'
		: ' This node already agreed.';
	return `${kindLabel(spend.kind)} of ${spend.amountWei} base units of ${spend.tokenAddress} to ${spend.recipientAddress}.${memo}${proposed}${deadline} ${spend.approvals.length}/${spend.quorum} agreed.${action}`;
}

function summaryFor(
	keyGenId: string,
	spend: RailgunKeyGenSpend,
	localNodeId: string,
): {summary: RailgunJoinSummary; check: RailgunJoinCheck} {
	const localJoinAgreed = spend.approvals.includes(localNodeId);
	const requestId = railgunSpendAgreeId(keyGenId, spend.spendId);
	const summary: RailgunJoinSummary = {
		requestId,
		status: 'pending',
		lifecycleStatus: 'pending',
		getSigTriggered: false,
		destinationChainId: String(spend.chainId),
		keyGenId,
		proposalUsedCustomGas: false,
		isBatch: false,
		batchLength: 1,
		joinAgreedCount: spend.approvals.length,
		joinKeyCount: spend.quorum,
		localJoinAgreed,
		isOriginatorLocal: spend.originator === localNodeId,
		localAgreementPending: !localJoinAgreed,
		isExpired: false,
		agreementKind: 'railgun_spend',
		railgunKind: spend.kind,
		amountWei: spend.amountWei,
		tokenAddress: spend.tokenAddress,
		recipientAddress: spend.recipientAddress,
		...(spend.memoText.trim() ? {memoText: spend.memoText.trim()} : {}),
		...(spend.deadline.trim() ? {deadline: spend.deadline.trim()} : {}),
		...(spend.createdAt.trim() ? {proposedAt: spend.createdAt.trim()} : {}),
	};
	return {
		summary,
		check: {
			requestId,
			localJoinAgreed,
			isOriginatorLocal: summary.isOriginatorLocal,
			localAgreementPending: summary.localAgreementPending,
			joinAgreedCount: summary.joinAgreedCount,
			joinKeyCount: summary.joinKeyCount,
			note: joinNote(spend, summary.localAgreementPending),
			agreementKind: 'railgun_spend',
		},
	};
}

export async function listRailgunSpendsAwaitingJoin(
	config: NodeSdkConfig,
	localNodeId: string,
): Promise<{summaries: RailgunJoinSummary[]; checks: RailgunJoinCheck[]}> {
	const listed = await listKeyGenRequests(config, {filter: 'success', pagenum: 0, pagesize: 0});
	if (!listed.ok) return {summaries: [], checks: []};
	const keyGenIds = [
		...new Set(
			listed.data.requests
				.map((request) => request.requestid?.trim() ?? '')
				.filter((id) => id.length > 0),
		),
	];
	const records = await Promise.all(
		keyGenIds.map(async (keyGenId) => ({keyGenId, record: await fetchKeyGenRailgun(config, keyGenId)})),
	);
	const summaries: RailgunJoinSummary[] = [];
	const checks: RailgunJoinCheck[] = [];
	for (const {keyGenId, record} of records) {
		if (!record.ok || !record.data.walletConfigured) continue;
		for (const spend of record.data.spends) {
			if (!railgunSpendJoinOpen(spend)) continue;
			const row = summaryFor(keyGenId, spend, localNodeId);
			summaries.push(row.summary);
			checks.push(row.check);
		}
	}
	return {summaries, checks};
}

export async function signRailgunSpendAgree(
	config: NodeSdkConfig,
	requestId: string,
	accept: boolean,
): Promise<SdkResult<{message: string}>> {
	const parsed = parseRailgunSpendAgreeId(requestId);
	if (!parsed) return {ok: false, reason: 'Invalid Railgun spend agreement ID.'};
	if (!accept) return rejectKeyGenRailgunSpend(config, parsed.keyGenId, parsed.spendId);
	const agreed = await agreeKeyGenRailgunSpend(config, parsed.keyGenId, parsed.spendId);
	if (!agreed.ok) return agreed;
	const reached = agreed.data.quorum > 0 && agreed.data.approvals >= agreed.data.quorum;
	return {
		ok: true,
		data: {
			message: reached
				? `Railgun spend reached quorum (${agreed.data.approvals}/${agreed.data.quorum}). The originator executes it from the Execute tab, or with broadcast_sign_result on this requestId. There is no Get Sig step.`
				: `Railgun spend agreed (${agreed.data.approvals}/${agreed.data.quorum}).`,
		},
	};
}

function railgunSpendReady(spend: Pick<RailgunKeyGenSpend, 'status' | 'deadline'>, now = Date.now()): boolean {
	if (spend.status !== 'ready' && spend.status !== 'executing' && spend.status !== 'failed') return false;
	const deadline = spend.deadline.trim();
	if (!deadline) return true;
	const parsed = Date.parse(deadline);
	return Number.isNaN(parsed) || parsed > now;
}

export async function listRailgunSpendsReadyToExecute(
	config: NodeSdkConfig,
	localNodeId: string,
): Promise<{summaries: RailgunJoinSummary[]}> {
	const listed = await listKeyGenRequests(config, {filter: 'success', pagenum: 0, pagesize: 0});
	if (!listed.ok) return {summaries: []};
	const keyGenIds = [
		...new Set(
			listed.data.requests
				.map((request) => request.requestid?.trim() ?? '')
				.filter((id) => id.length > 0),
		),
	];
	const records = await Promise.all(
		keyGenIds.map(async (keyGenId) => ({keyGenId, record: await fetchKeyGenRailgun(config, keyGenId)})),
	);
	const summaries: RailgunJoinSummary[] = [];
	for (const {keyGenId, record} of records) {
		if (!record.ok || !record.data.walletConfigured) continue;
		for (const spend of record.data.spends) {
			if (!railgunSpendReady(spend) || spend.originator.trim().toLowerCase() !== localNodeId.trim().toLowerCase()) continue;
			const row = summaryFor(keyGenId, spend, localNodeId);
			row.summary.status = 'ready';
			row.summary.lifecycleStatus = 'ready';
			summaries.push(row.summary);
		}
	}
	return {summaries};
}

export async function executeRailgunSpend(
	config: NodeSdkConfig,
	requestId: string,
): Promise<SdkResult<{requestId: string; txHashes: string[]; status: 'executed'}>> {
	const parsed = parseRailgunSpendAgreeId(requestId);
	if (!parsed) return {ok: false, reason: 'Invalid Railgun spend agreement ID.'};
	const executed = await executeKeyGenRailgunSpend(config, parsed.keyGenId, parsed.spendId);
	if (!executed.ok) return executed;
	const txHash = executed.data.txHash?.trim() ?? '';
	if (!txHash) return {ok: false, reason: executed.data.error?.trim() || 'Railgun spend did not return a transaction hash.'};
	return {ok: true, data: {requestId, txHashes: [txHash], status: 'executed'}};
}
