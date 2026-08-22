import assert from 'node:assert/strict';
import {test} from 'node:test';
import {signedMessageForConfigUpdateImplement} from '../dist/api/config-update.js';
import type {NodeSdkConfig} from '../dist/config/schema.js';
import {
	DEFAULT_PEER_MANAGEMENT_HTTP_PORT,
	buildSetConfiguredNodes,
	buildSetMqttTlsKey,
	extractIpv4Host,
	isUnsetRelayPlaceholderAddress,
	isValidIpv4,
	peerAddressForConfigWrite,
} from '../dist/core/node-config.js';

function makeConfig(): NodeSdkConfig {
	return {
		node: {
			baseUrl: 'http://127.0.0.1',
			managementPort: 3000,
			mpcConfigPath: '/tmp/continuum-node-sdk-node-config-test',
		},
		signer: {
			defaultKey: 'bootstrap',
			defaultKeyPath: null,
		},
	};
}
import {
	GetMqttTlsPublicKeyDataSchema,
	SetConfiguredNodesInputSchema,
	SetMqttTlsKeyInputSchema,
} from '../dist/schemas/extended.js';
import {TOOL_GROUP_BY_NAME} from '../dist/mcp/deferred/tool-group-map.js';

test('isValidIpv4 accepts public-looking addresses and rejects junk', () => {
	assert.equal(isValidIpv4('203.0.113.10'), true);
	assert.equal(isValidIpv4('0.0.0.0'), true);
	assert.equal(isValidIpv4('256.1.1.1'), false);
	assert.equal(isValidIpv4('not-an-ip'), false);
});

test('unset relay placeholder is 0.0.0.0 host', () => {
	assert.equal(isUnsetRelayPlaceholderAddress('0.0.0.0:8081'), true);
	assert.equal(isUnsetRelayPlaceholderAddress('203.0.113.10:8081'), false);
});

test('peerAddressForConfigWrite uses default management port 8081', () => {
	assert.equal(DEFAULT_PEER_MANAGEMENT_HTTP_PORT, 8081);
	assert.equal(peerAddressForConfigWrite('203.0.113.10'), '203.0.113.10:8081');
	assert.equal(peerAddressForConfigWrite('203.0.113.10', 8080), '203.0.113.10:8080');
	assert.equal(extractIpv4Host('203.0.113.10:8081'), '203.0.113.10');
});

test('SetConfiguredNodesInputSchema requires IPv4 peers', () => {
	assert.equal(
		SetConfiguredNodesInputSchema.safeParse({peers: ['203.0.113.10', '203.0.113.11']})
			.success,
		true,
	);
	assert.equal(
		SetConfiguredNodesInputSchema.safeParse({peers: ['relay.example']}).success,
		false,
	);
	assert.equal(SetConfiguredNodesInputSchema.safeParse({peers: []}).success, false);
});

test('SetMqttTlsKeyInputSchema requires PEM text', () => {
	assert.equal(SetMqttTlsKeyInputSchema.safeParse({caCertPem: ''}).success, false);
	assert.equal(
		SetMqttTlsKeyInputSchema.safeParse({
			caCertPem: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n',
		}).success,
		true,
	);
});

test('GetMqttTlsPublicKeyDataSchema matches GET /getMSQTTKey shape', () => {
	const parsed = GetMqttTlsPublicKeyDataSchema.safeParse({
		path: '/mosquitto/config/certs/ca.crt',
		caCertPem: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n',
	});
	assert.equal(parsed.success, true);
});

test('signedMessageForConfigUpdateImplement prefixes sha256 of YAML', async () => {
	const msg = await signedMessageForConfigUpdateImplement('hello: world\n');
	assert.match(msg, /^configUpdateImplement\|[0-9a-f]{64}$/);
});

test('buildSetConfiguredNodes rejects unset relay placeholder', async () => {
	const built = await buildSetConfiguredNodes(makeConfig(), {peers: ['0.0.0.0']});
	assert.equal(built.ok, false);
	if (built.ok) return;
	assert.match(built.reason, /placeholder/i);
});

test('buildSetMqttTlsKey rejects non-PEM', async () => {
	const built = await buildSetMqttTlsKey(makeConfig(), {caCertPem: 'not-a-cert'});
	assert.equal(built.ok, false);
	if (built.ok) return;
	assert.match(built.reason, /PEM-encoded CERTIFICATE/i);
});

test('node_config tools are mapped to the node_config group', () => {
	assert.equal(TOOL_GROUP_BY_NAME['get_mqtt_tls_public_key'], 'node_config');
	assert.equal(TOOL_GROUP_BY_NAME['set_mqtt_tls_key'], 'node_config');
	assert.equal(TOOL_GROUP_BY_NAME['set_configured_nodes'], 'node_config');
	assert.equal(TOOL_GROUP_BY_NAME['get_maintenance_restart_gate'], 'node_config');
});
