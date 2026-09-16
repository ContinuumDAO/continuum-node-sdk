import assert from 'node:assert/strict';
import {test} from 'node:test';
import {HealthSchema} from '../dist/schemas/extended.js';

/** Shape from a live healthy GET /health (management port) on 2026-09-16. */
const liveHealthyHealth = {
	mongodb: {connected: true, error: ''},
	mqtt: {
		caFile: '/mosquitto/config/certs/ca.crt',
		channels: 6,
		connected: true,
		errors: [] as string[],
	},
	status: 'healthy',
	subscriptions: [
		{
			groupId: 'bootstrap_372f57df98cbae82',
			brokers: ['ssl://mosquitto:8883'],
			topics: ['22c8d11c6a78c22a254247c51d4f7ddac6da216811c4fe3128038e86d4f0ed8b4d9636b4b54f54e0496e37c6464f53099bd9f8c9f3ada4dce5a0404f69e7a1db'],
			clientId:
				'22c8d11c6a78c22a254247c51d4f7ddac6da216811c4fe3128038e86d4f0ed8b4d9636b4b54f54e0496e37c6464f53099bd9f8c9f3ada4dce5a0404f69e7a1db',
			isConnected: true,
		},
	],
	timestamp: 1_789_578_581,
	vpn: {
		active: false,
		available: true,
		directWireGuardBlocked: false,
		obfuscation: 'none',
		profile: '',
	},
};

test('HealthSchema accepts a live healthy /health payload that omits mqtt.warnings', () => {
	const parsed = HealthSchema.safeParse(liveHealthyHealth);
	assert.equal(parsed.success, true, parsed.success ? '' : JSON.stringify(parsed.error.issues));
	if (!parsed.success) return;
	assert.equal(parsed.data.status, 'healthy');
	assert.equal(parsed.data.mqtt.connected, true);
	assert.equal(parsed.data.mqtt.warnings, undefined);
	assert.equal(parsed.data.mqtt.caFile, '/mosquitto/config/certs/ca.crt');
	assert.equal(parsed.data.vpn?.available, true);
});

test('HealthSchema still accepts mqtt.warnings when the node is degraded', () => {
	const parsed = HealthSchema.safeParse({
		...liveHealthyHealth,
		status: 'unhealthy',
		mqtt: {
			connected: false,
			channels: 0,
			errors: ['no MQTT subscriptions found'],
			warnings: ['no MQTT subscriptions found'],
		},
		subscriptions: [],
	});
	assert.equal(parsed.success, true, parsed.success ? '' : JSON.stringify(parsed.error.issues));
});
