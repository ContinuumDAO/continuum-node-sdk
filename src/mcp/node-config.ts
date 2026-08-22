import type { McpServer } from "@modelcontextprotocol/server";
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	getMaintenanceRestartGate,
	getMqttTlsPublicKey,
	setConfiguredNodes,
	setMqttTlsKey,
} from '../core/node-config.js';
import {SelectedSigningKeySchema} from '../schemas/extended.js';
import {
	GetMqttTlsPublicKeyDataSchema,
	MaintenanceRestartGateDataSchema,
	SetConfiguredNodesDataSchema,
	SetConfiguredNodesInputSchema,
	SetMqttTlsKeyDataSchema,
	SetMqttTlsKeyInputSchema,
} from '../schemas/extended.js';
import {camelToSnake, wrapSdk} from './tool-utils.js';

export function registerNodeConfigTools(
	server: McpServer,
	config: NodeSdkConfig,
): void {
	server.registerTool(
		camelToSnake('getMqttTlsPublicKey'),
		{
			description:
				'Fetch this node’s MQTT broker TLS CA certificate (GET /getMSQTTKey). Use on the relay to export the invite secret for peers. Search tags: mqtt, tls, relay, ca cert, peers.',
			inputSchema: z.object({}).strict(),
			outputSchema: GetMqttTlsPublicKeyDataSchema,
		},
		async () => wrapSdk(getMqttTlsPublicKey(config)),
	);

	server.registerTool(
		camelToSnake('setMqttTlsKey'),
		{
			description:
				'Write the MQTT broker TLS CA PEM on this node (POST /postMSQTTKey, management-signed over the PEM bytes). Use on peers after get_mqtt_tls_public_key on the relay. Restart the node (docker compose on the host) after apply. Search tags: mqtt, tls, set mqtt key, peer, relay.',
			inputSchema: SetMqttTlsKeyInputSchema,
			outputSchema: SetMqttTlsKeyDataSchema.extend({
				selectedSigningKey: SelectedSigningKeySchema.optional(),
				signingMessage: z.string(),
			}),
		},
		async ({caCertPem}: {caCertPem: string}) =>
			wrapSdk(setMqttTlsKey(config, {caCertPem})),
	);

	server.registerTool(
		camelToSnake('setConfiguredNodes'),
		{
			description:
				'Set the relay (first IPv4) and peer IPv4 list via POST /configUpdatePlan + /configUpdateImplement. Every collaborating node must use the same first/relay address. Do not pass 0.0.0.0. Restart the node after apply. Search tags: peers, relay, peer ip, configured nodes, mqtt relay.',
			inputSchema: SetConfiguredNodesInputSchema,
			outputSchema: SetConfiguredNodesDataSchema.extend({
				selectedSigningKey: SelectedSigningKeySchema.optional(),
				signingMessage: z.string(),
			}),
		},
		async ({
			peers,
			managementHttpPort,
		}: {
			peers: string[];
			managementHttpPort?: number;
		}) => wrapSdk(setConfiguredNodes(config, {peers, managementHttpPort})),
	);

	server.registerTool(
		camelToSnake('getMaintenanceRestartGate'),
		{
			description:
				'Read whether it is safe to restart the node process (GET /maintenance/restartGate). This tool does not restart anything — run `docker compose restart` on the VPS as the operator after peer/MQTT config. Search tags: restart, compose, drain, maintenance.',
			inputSchema: z.object({}).strict(),
			outputSchema: MaintenanceRestartGateDataSchema,
		},
		async () => wrapSdk(getMaintenanceRestartGate(config)),
	);
}
