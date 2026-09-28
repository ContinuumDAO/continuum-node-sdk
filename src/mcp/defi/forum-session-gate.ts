/** Forum writes and EIP-712 sign-in share one node-session decision. */

export const FORUM_SIGN_IN_MULTISIGN_TOOL = 'ctm_continuum_dao_build_forum_sign_in_multisign';

export const FORUM_TICKET_WRITE_TOOLS = new Set([
	'ctm_continuum_dao_forum_delete',
	'ctm_continuum_dao_forum_reply',
	'ctm_continuum_dao_forum_react',
	'ctm_continuum_dao_forum_create_topic',
	'ctm_continuum_dao_forum_create_idea',
	'ctm_continuum_dao_mpa_post_listing',
	'ctm_continuum_dao_mpa_reply',
	'ctm_continuum_dao_mpa_retract',
	'ctm_continuum_dao_mpa_flag',
	'ctm_continuum_dao_mpa_mailbox_list',
	'ctm_continuum_dao_mpa_mailbox_open',
	'ctm_continuum_dao_mpa_mailbox_send',
	'ctm_continuum_dao_technocore_bind',
	'ctm_continuum_dao_forum_unread',
	'ctm_continuum_dao_forum_mark_read',
	'ctm_continuum_dao_forum_mark_unread',
	'ctm_continuum_dao_forum_sign_out',
]);

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function isForumTicketWriteTool(name: string): boolean {
	return FORUM_TICKET_WRITE_TOOLS.has(name);
}

export function forumSessionAddressFromInput(input: Record<string, unknown>): string | null {
	const raw = String(input.address ?? input.executorAddress ?? '').trim();
	return ADDRESS_RE.test(raw) ? raw : null;
}

export function forumMeIsLoggedIn(body: unknown): boolean {
	if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
	return (body as {loggedIn?: unknown}).loggedIn === true;
}

export type ForumWriteGate =
	| {kind: 'use'; ticket: string}
	| {kind: 'refuse'; reason: string};

const SIGN_IN_NEXT =
	'Call ctm_continuum_dao_forum_sign_in_eligible, then ctm_continuum_dao_build_forum_sign_in_multisign only if eligible is true.';

export function decideForumWriteGate(args: {
	sessionChecked: boolean;
	sessionFound: boolean;
	sessionTicket: string;
	callerTicket: string;
	meLoggedIn: boolean;
}): ForumWriteGate {
	if (args.sessionChecked) {
		if (args.sessionFound && args.meLoggedIn && args.sessionTicket) {
			return {kind: 'use', ticket: args.sessionTicket};
		}
		return {
			kind: 'refuse',
			reason: `No live forum session on this node for this address. ${SIGN_IN_NEXT} Do not post until forum_me loggedIn is true.`,
		};
	}
	if (args.callerTicket && args.meLoggedIn) {
		return {kind: 'use', ticket: args.callerTicket};
	}
	if (args.callerTicket) {
		return {
			kind: 'refuse',
			reason: `Forum ticket is not logged in. Call get_forum_session for the KeyGen address. If loggedIn is false, ${SIGN_IN_NEXT} Do not post with this ticket.`,
		};
	}
	return {
		kind: 'refuse',
		reason:
			'Pass address (KeyGen) so this tool can load the node forum session, or pass ticket from get_forum_session. Do not call ctm_continuum_dao_build_forum_sign_in_multisign when that session is already logged in.',
	};
}

export type ForumSignInGate = {kind: 'proceed'} | {kind: 'reuse'; ticket: string};

export function decideForumSignInGate(args: {
	sessionFound: boolean;
	sessionTicket: string;
	meLoggedIn: boolean;
}): ForumSignInGate {
	if (args.sessionFound && args.meLoggedIn && args.sessionTicket) {
		return {kind: 'reuse', ticket: args.sessionTicket};
	}
	return {kind: 'proceed'};
}

export function forumSignInReusePayload(args: {
	address: string;
	ticket: string;
	username?: string;
	uid?: number;
}): Record<string, unknown> {
	return {
		alreadySignedIn: true,
		loggedIn: true,
		address: args.address,
		ticket: args.ticket,
		...(args.username ? {username: args.username} : {}),
		...(args.uid != null ? {uid: args.uid} : {}),
		message:
			'This KeyGen already has a live forum session on this node. Reuse ticket. Do not create another EIP-712 forum sign-in request.',
	};
}

export function forumSignInNodeKeyPresent(input: Record<string, unknown>): boolean {
	return typeof input.nodeKey === 'string' && input.nodeKey.trim() !== '';
}

/** KeyGen sign-in always carries this node's key. A caller-supplied key is left as-is. */
export function withForumSignInNodeKey(
	input: Record<string, unknown>,
	nodeKey: string,
): Record<string, unknown> {
	const key = nodeKey.trim();
	if (!key || forumSignInNodeKeyPresent(input)) {
		return input;
	}
	return {...input, nodeKey: key};
}
