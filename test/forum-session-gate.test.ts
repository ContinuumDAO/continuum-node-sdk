import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
	decideForumSignInGate,
	decideForumWriteGate,
	FORUM_TICKET_WRITE_TOOLS,
	forumMeIsLoggedIn,
	forumSessionAddressFromInput,
	isForumTicketWriteTool,
} from '../src/mcp/defi/forum-session-gate.ts';

describe('forum session gate', () => {
	it('treats proposal, idea, reply, react, mailbox, and inbox writes as ticket writes', () => {
		assert.equal(isForumTicketWriteTool('ctm_continuum_dao_forum_create_topic'), true);
		assert.equal(isForumTicketWriteTool('ctm_continuum_dao_forum_create_idea'), true);
		assert.equal(isForumTicketWriteTool('ctm_continuum_dao_forum_reply'), true);
		assert.equal(isForumTicketWriteTool('ctm_continuum_dao_mpa_mailbox_send'), true);
		assert.equal(isForumTicketWriteTool('ctm_continuum_dao_forum_fetch_thread'), false);
		assert.equal(FORUM_TICKET_WRITE_TOOLS.has('ctm_continuum_dao_forum_sign_out'), true);
	});

	it('reuses a live node session and refuses a dead one before a write', () => {
		assert.deepEqual(
			decideForumWriteGate({
				sessionChecked: true,
				sessionFound: true,
				sessionTicket: 'node-ticket',
				callerTicket: 'stale',
				meLoggedIn: true,
			}),
			{kind: 'use', ticket: 'node-ticket'},
		);
		const dead = decideForumWriteGate({
			sessionChecked: true,
			sessionFound: true,
			sessionTicket: 'node-ticket',
			callerTicket: '',
			meLoggedIn: false,
		});
		assert.equal(dead.kind, 'refuse');
	});

	it('accepts a caller ticket only after forum_me says logged in', () => {
		assert.deepEqual(
			decideForumWriteGate({
				sessionChecked: false,
				sessionFound: false,
				sessionTicket: '',
				callerTicket: 'live',
				meLoggedIn: true,
			}),
			{kind: 'use', ticket: 'live'},
		);
		assert.equal(
			decideForumWriteGate({
				sessionChecked: false,
				sessionFound: false,
				sessionTicket: '',
				callerTicket: '',
				meLoggedIn: false,
			}).kind,
			'refuse',
		);
	});

	it('blocks a new EIP-712 sign-in when the node session is live', () => {
		assert.deepEqual(
			decideForumSignInGate({
				sessionFound: true,
				sessionTicket: 'node-ticket',
				meLoggedIn: true,
			}),
			{kind: 'reuse', ticket: 'node-ticket'},
		);
		assert.deepEqual(
			decideForumSignInGate({
				sessionFound: true,
				sessionTicket: 'dead',
				meLoggedIn: false,
			}),
			{kind: 'proceed'},
		);
	});

	it('reads a KeyGen address and forum_me loggedIn', () => {
		assert.equal(
			forumSessionAddressFromInput({address: '0xabc'}),
			null,
		);
		assert.equal(
			forumSessionAddressFromInput({
				address: '0x0000000000000000000000000000000000000001',
			}),
			'0x0000000000000000000000000000000000000001',
		);
		assert.equal(forumMeIsLoggedIn({loggedIn: true}), true);
		assert.equal(forumMeIsLoggedIn({loggedIn: false}), false);
	});
});
