import type {NodeSdkConfig} from '../../config/schema.js';
import {
	DEFAULT_MANAGEMENT_SIGNING,
	type ManagementSigningMethod,
} from '../../schemas/extended.js';
import {fetchKeyGenResult} from '../keygen.js';
import {setForumSession} from '../agent/forum-session.js';
import type {SdkResult} from '../result.js';
import {executorAddressFromKeyGen} from './context.js';
import {eip712SignatureHexFromResult, getEip712Delivery} from './eip712-sign-request.js';
import {keyGenIdFromRecord} from './sign-request-utils.js';

const DEFAULT_FORUM_URL = 'https://forum.continuumdao.org';

export const FORUM_LOGIN_DELIVERY_KIND = 'forumLogin';

function forumOrigin(delivery: Record<string, unknown>): string {
	const explicit = typeof delivery.forum === 'string' ? delivery.forum.trim() : '';
	return (explicit || DEFAULT_FORUM_URL).replace(/\/+$/, '');
}

/**
 * Exchange a forum sign-in signature for a ticket and store it on this node.
 * That is what the dashboard does when Execute delivers a forumLogin leg.
 */
export async function deliverForumLoginSignature(args: {
	config: NodeSdkConfig;
	signRequestDetail: Record<string, unknown>;
	signResult: Record<string, unknown>;
	signing?: ManagementSigningMethod;
}): Promise<SdkResult<string>> {
	const delivery = getEip712Delivery(args.signRequestDetail);
	if (!delivery || delivery.kind !== FORUM_LOGIN_DELIVERY_KIND) {
		return {ok: false, reason: 'Sign request is not a forum login delivery.'};
	}
	const signature = eip712SignatureHexFromResult(args.signResult);
	if (!signature) {
		return {ok: false, reason: 'Sign result missing r, s, v for forum login.'};
	}
	const keyGenId = keyGenIdFromRecord(args.signRequestDetail);
	if (!keyGenId) {
		return {ok: false, reason: 'Forum login is missing a KeyGen id.'};
	}
	const kg = await fetchKeyGenResult(args.config, keyGenId);
	if (!kg.ok) return kg;
	const address = executorAddressFromKeyGen(kg.data);
	if (!address) {
		return {ok: false, reason: 'Forum login KeyGen is missing an ethereum address.'};
	}
	const forum = forumOrigin(delivery);
	let body: {
		completeUrl?: string;
		ticket?: string;
		username?: string;
		uid?: number;
		status?: {message?: string};
	};
	try {
		const res = await fetch(`${forum}/api/continuum/eip712/ticket`, {
			method: 'POST',
			headers: {Accept: 'application/json', 'Content-Type': 'application/json'},
			body: JSON.stringify({address, signature}),
		});
		body = (await res.json()) as typeof body;
		if (!res.ok || !body.ticket) {
			return {ok: false, reason: body.status?.message || 'Forum ticket failed.'};
		}
	} catch (error) {
		return {ok: false, reason: error instanceof Error ? error.message : 'Forum ticket failed.'};
	}
	const stored = await setForumSession(
		args.config,
		{
			address,
			ticket: body.ticket,
			...(body.username ? {username: body.username} : {}),
			...(body.uid != null ? {uid: body.uid} : {}),
		},
		args.signing ?? DEFAULT_MANAGEMENT_SIGNING,
	);
	if (!stored.ok) return stored;
	const who = body.username?.trim() || address;
	return {ok: true, data: `Forum signed in as ${who}.`};
}
