import type {NodeSdkConfig} from '../../config/schema.js';
import {
	clearForumSession,
	clearForumSessionByTicket,
	getForumSession,
} from '../../core/agent/forum-session.js';
import {
	decideForumSignInGate,
	decideForumWriteGate,
	forumMeIsLoggedIn,
	forumSessionAddressFromInput,
	forumSignInReusePayload,
} from './forum-session-gate.js';
import {importDefiHandler} from './import-map.js';

async function forumMeLoggedIn(ticket: string, forumUrl: unknown): Promise<boolean> {
	const me = await importDefiHandler('protocols/evm/continuum-dao', 'continuumDaoForumMe');
	const body = await me({
		ticket,
		...(typeof forumUrl === 'string' && forumUrl.trim() ? {forumUrl: forumUrl.trim()} : {}),
	});
	return forumMeIsLoggedIn(body);
}

/** Load the node forum session and attach a live ticket, or refuse the write. */
export async function gateForumWriteInput(
	config: NodeSdkConfig,
	input: Record<string, unknown>,
): Promise<{ok: true; input: Record<string, unknown>} | {ok: false; reason: string}> {
	const address = forumSessionAddressFromInput(input);
	const callerTicket = String(input.ticket ?? '').trim();
	const forumUrl = input.forumUrl;
	let sessionFound = false;
	let sessionTicket = '';
	let meLoggedIn = false;
	let sessionChecked = false;

	if (address) {
		const session = await getForumSession(config, address);
		if (!session.ok) return session;
		sessionChecked = true;
		sessionFound = session.data.found === true;
		sessionTicket = String(session.data.ticket ?? '').trim();
		if (sessionFound && sessionTicket) {
			try {
				meLoggedIn = await forumMeLoggedIn(sessionTicket, forumUrl);
			} catch (error) {
				return {
					ok: false,
					reason: error instanceof Error ? error.message : 'Forum session check failed.',
				};
			}
			if (!meLoggedIn) {
				await clearForumSession(config, address).catch(() => undefined);
			}
		}
	} else if (callerTicket) {
		try {
			meLoggedIn = await forumMeLoggedIn(callerTicket, forumUrl);
		} catch (error) {
			return {
				ok: false,
				reason: error instanceof Error ? error.message : 'Forum session check failed.',
			};
		}
	}

	const decision = decideForumWriteGate({
		sessionChecked,
		sessionFound,
		sessionTicket,
		callerTicket,
		meLoggedIn,
	});
	if (decision.kind === 'refuse') return {ok: false, reason: decision.reason};
	return {ok: true, input: {...input, ticket: decision.ticket}};
}

export async function gateForumSignIn(
	config: NodeSdkConfig,
	address: string,
	forumUrl: unknown,
): Promise<
	| {kind: 'proceed'}
	| {kind: 'reuse'; payload: Record<string, unknown>}
	| {kind: 'error'; reason: string}
> {
	const session = await getForumSession(config, address);
	if (!session.ok) return {kind: 'error', reason: session.reason};
	const sessionFound = session.data.found === true;
	const sessionTicket = String(session.data.ticket ?? '').trim();
	let meLoggedIn = false;
	if (sessionFound && sessionTicket) {
		try {
			meLoggedIn = await forumMeLoggedIn(sessionTicket, forumUrl);
		} catch (error) {
			return {
				kind: 'error',
				reason: error instanceof Error ? error.message : 'Forum session check failed.',
			};
		}
		if (!meLoggedIn) {
			await clearForumSession(config, address).catch(() => undefined);
		}
	}
	const decision = decideForumSignInGate({sessionFound, sessionTicket, meLoggedIn});
	if (decision.kind === 'proceed') return {kind: 'proceed'};
	return {
		kind: 'reuse',
		payload: forumSignInReusePayload({
			address,
			ticket: decision.ticket,
			username: session.data.username,
			uid: session.data.uid,
		}),
	};
}

/** Drop the node copy after Forum sign-out. Address, ticket, or both. */
export async function clearNodeForumSessionAfterSignOut(
	config: NodeSdkConfig,
	input: Record<string, unknown>,
): Promise<{ok: true} | {ok: false; reason: string}> {
	const address = forumSessionAddressFromInput(input);
	const ticket = String(input.ticket ?? '').trim();
	if (!address && !ticket) {
		return {ok: false, reason: 'Forum signed out, but no address or ticket was available to clear the node session.'};
	}
	if (address) {
		const cleared = await clearForumSession(config, address);
		if (!cleared.ok) return cleared;
	}
	if (ticket) {
		const cleared = await clearForumSessionByTicket(config, ticket);
		if (!cleared.ok) return cleared;
	}
	return {ok: true};
}
