import {getAddress, type Address} from 'viem';
import type {NodeSdkConfig} from '../../config/schema.js';
import {
	DEFAULT_MANAGEMENT_SIGNING,
	type ManagementSigningMethod,
} from '../../schemas/extended.js';
import type {SdkResult} from '../result.js';
import {createComposeMultiSignRequest} from './compose-request.js';
import {mpcGetSignRequestById, mpcGetSignResultById} from './client.js';
import {eip712SignatureHexFromResult, getEip712Delivery} from './eip712-sign-request.js';
import {listSignRequests} from './sign-request-lifecycle.js';
import {signResultExecutionState} from './sign-result-summary.js';
import {keyGenIdFromRecord} from './sign-request-utils.js';

/** The hook keeps the Permit2 signature on Execute until this transaction is on chain. */
export const PERMIT2_SUBMISSION_PENDING = 'Permit2 submission is in progress';

export function permit2SubmissionPurpose(requestId: string): string {
	return `Permit2 permit ${requestId.trim()}`;
}

export function signRequestPurposeText(row: unknown): string {
	if (!row || typeof row !== 'object') return '';
	const record = row as Record<string, unknown>;
	const purpose = record.Purpose ?? record.purpose;
	if (typeof purpose === 'string') return purpose;
	if (purpose && typeof purpose === 'object' && !Array.isArray(purpose)) {
		return Object.values(purpose as Record<string, unknown>)
			.map(value => String(value ?? '').trim())
			.filter(Boolean)
			.join(' | ');
	}
	return '';
}

function requestIdOf(row: unknown): string {
	if (!row || typeof row !== 'object') return '';
	const record = row as Record<string, unknown>;
	return String(record.requestid ?? record.requestId ?? record.RequestId ?? '').trim();
}

function pending(requestId: string): SdkResult<string> {
	return {ok: false, reason: `${PERMIT2_SUBMISSION_PENDING} for ${requestId}.`};
}

function chainIdOf(delivery: Record<string, unknown>, detail: Record<string, unknown>): number {
	const raw = delivery.chainId ?? detail.DestinationChainID ?? detail.destinationChainID;
	const chainId = typeof raw === 'number' ? raw : Number(raw);
	return Number.isFinite(chainId) ? chainId : NaN;
}

async function findPermit2Submission(
	config: NodeSdkConfig,
	purpose: string,
): Promise<SdkResult<string | null>> {
	for (const filter of ['live', 'pending', 'success'] as const) {
		const listed = await listSignRequests(config, {filter, pagenum: 0, pagesize: 100});
		if (!listed.ok) return listed;
		for (const row of listed.data.requests) {
			if (!signRequestPurposeText(row).includes(purpose)) continue;
			const id = requestIdOf(row);
			if (id) return {ok: true, data: id};
		}
	}
	return {ok: true, data: null};
}

async function executedHash(
	config: NodeSdkConfig,
	requestId: string,
): Promise<string | null> {
	const result = await mpcGetSignResultById(config, requestId);
	if (!result.ok) return null;
	const execution = signResultExecutionState(result.data);
	if (!execution.executedOnChain) return null;
	return execution.transactionHashes[0] ?? null;
}

async function broadcastSubmission(
	config: NodeSdkConfig,
	requestId: string,
	signing: ManagementSigningMethod,
): Promise<SdkResult<string>> {
	const req = await mpcGetSignRequestById(config, requestId);
	if (!req.ok) return req;
	const status = String(
		(req.data as Record<string, unknown>).status ??
			(req.data as Record<string, unknown>).Status ??
			'',
	).toLowerCase();
	if (status !== 'success') return pending(requestId);
	const {triggerSignResult} = await import('./trigger-sign-result.js');
	const triggered = await triggerSignResult(
		config,
		{requestId, feeSpeedTier: 'normal'},
		signing,
	);
	if (!triggered.ok) return triggered;
	if (!triggered.data.signed) {
		return {
			ok: false,
			reason: triggered.data.nonceQueueWarning || 'Permit2 transaction was not signed.',
		};
	}
	const {broadcastSignResult} = await import('./broadcast-sign-result.js');
	const broadcast = await broadcastSignResult(config, {requestId}, signing);
	if (!broadcast.ok) return broadcast;
	const hash = broadcast.data.txHashes.find(item => item.startsWith('0x'));
	return {ok: true, data: hash || broadcast.data.txHashes[0] || requestId};
}

/**
 * Permit2.permit is an on-chain transaction. The EIP-712 signature is the permit
 * witness; the executor still has to sign the transaction that submits it.
 * This opens that transaction once, then broadcasts it when the KeyGen has agreed.
 */
export async function deliverPermit2Submit(args: {
	config: NodeSdkConfig;
	requestId: string;
	signRequestDetail: Record<string, unknown>;
	signResult: Record<string, unknown>;
	signing?: ManagementSigningMethod;
}): Promise<SdkResult<string>> {
	const signing = args.signing ?? DEFAULT_MANAGEMENT_SIGNING;
	const delivery = getEip712Delivery(args.signRequestDetail);
	if (!delivery || delivery.kind !== 'permit2_submit') {
		return {ok: false, reason: 'Sign request is not a Permit2 delivery.'};
	}
	const signature = eip712SignatureHexFromResult(args.signResult);
	if (!signature) {
		return {ok: false, reason: 'Sign result missing r, s, v for Permit2.'};
	}
	const permit2 = delivery.permit2;
	const owner = delivery.owner;
	const permitSingle = delivery.permitSingle;
	if (typeof permit2 !== 'string' || typeof owner !== 'string' || permitSingle == null || typeof permitSingle !== 'object') {
		return {ok: false, reason: 'Permit2 delivery missing permit2, owner, or permitSingle.'};
	}
	const details = (permitSingle as Record<string, unknown>).details;
	if (details == null || typeof details !== 'object') {
		return {ok: false, reason: 'Permit2 permitSingle.details missing.'};
	}
	const row = details as Record<string, unknown>;
	const ps = permitSingle as Record<string, unknown>;
	const chainId = chainIdOf(delivery, args.signRequestDetail);
	if (!Number.isFinite(chainId)) {
		return {ok: false, reason: 'Permit2 delivery is missing a chain id.'};
	}
	const keyGenId = keyGenIdFromRecord(args.signRequestDetail);
	if (!keyGenId) {
		return {ok: false, reason: 'Permit2 delivery is missing a KeyGen id.'};
	}
	const purpose = permit2SubmissionPurpose(args.requestId);
	const existing = await findPermit2Submission(args.config, purpose);
	if (!existing.ok) return existing;
	if (existing.data) {
		const hash = await executedHash(args.config, existing.data);
		if (hash) return {ok: true, data: hash};
		return broadcastSubmission(args.config, existing.data, signing);
	}

	const ownerAddr = getAddress(owner as Address);
	const token = getAddress(String(row.token) as Address);
	const spender = getAddress(String(ps.spender) as Address);
	const amount = String(row.amount ?? '0');
	const expiration = String(row.expiration ?? '0');
	const nonce = String(row.nonce ?? '0');
	const sigDeadline = String(ps.sigDeadline ?? '0');
	const created = await createComposeMultiSignRequest(args.config, {
		keyGenId,
		chainId,
		purpose,
		actions: [
			{
				signature: 'permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)',
				contractAddress: getAddress(permit2 as Address),
				args: [
					{name: 'owner', type: 'address', value: ownerAddr},
					{
						name: 'permitSingle',
						type: '((address,uint160,uint48,uint48),address,uint256)',
						value: JSON.stringify([[token, amount, expiration, nonce], spender, sigDeadline]),
					},
					{name: 'signature', type: 'bytes', value: signature},
				],
			},
		],
	});
	if (!created.ok) return created;
	return broadcastSubmission(args.config, created.data.requestId, signing);
}
