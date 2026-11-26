import assert from 'node:assert/strict';
import test from 'node:test';
import {summarizeInstantHooks} from '../dist/core/agent/cron-jobs.js';

test('summarizeInstantHooks separates agree and broadcast and keeps an unset hook inactive', () => {
	const report = summarizeInstantHooks([
		{
			id: 'agree-1',
			name: 'auto-accept-sign-request',
			enabled: false,
			instantHook: true,
			telegramNotify: true,
		},
		{
			id: 'broadcast-1',
			name: 'auto-sign-and-broadcast',
			enabled: true,
			instantHook: false,
			telegramNotify: false,
		},
		{
			id: 'other',
			name: 'notify-forum-replies',
			enabled: true,
			instantHook: false,
			telegramNotify: true,
		},
	]);

	assert.equal(report.signRequestAgree.set, true);
	assert.equal(report.signRequestAgree.active, false);
	assert.equal(report.signRequestAgree.telegramNotify, true);
	assert.equal(report.signRequestAgree.jobName, 'auto-accept-sign-request');
	assert.equal(report.signRequestAgree.jobs.length, 4);
	const accept = report.signRequestAgree.jobs.find(job => job.name === 'auto-accept-sign-request');
	assert.deepEqual(accept, {
		name: 'auto-accept-sign-request',
		id: 'agree-1',
		installed: true,
		set: true,
		active: false,
		telegramNotify: true,
	});
	const missing = report.signRequestAgree.jobs.find(job => job.name === 'reject-all-sign-request');
	assert.equal(missing?.installed, false);
	assert.equal(missing?.set, false);

	assert.equal(report.signAndBroadcast.set, false);
	assert.equal(report.signAndBroadcast.active, false);
	assert.equal(report.signAndBroadcast.telegramNotify, false);
	assert.equal(report.signAndBroadcast.jobName, null);
	assert.deepEqual(report.signAndBroadcast.jobs[0], {
		name: 'auto-sign-and-broadcast',
		id: 'broadcast-1',
		installed: true,
		set: false,
		active: true,
		telegramNotify: false,
	});
});

test('summarizeInstantHooks marks a set and enabled broadcast hook active', () => {
	const report = summarizeInstantHooks([
		{
			id: 'broadcast-1',
			name: 'auto-sign-and-broadcast',
			enabled: true,
			instantHook: true,
			telegramNotify: false,
		},
	]);
	assert.equal(report.signAndBroadcast.set, true);
	assert.equal(report.signAndBroadcast.active, true);
	assert.equal(report.signAndBroadcast.telegramNotify, false);
	assert.equal(report.signAndBroadcast.jobName, 'auto-sign-and-broadcast');
	assert.equal(report.signRequestAgree.set, false);
	assert.equal(report.signRequestAgree.jobName, null);
});
