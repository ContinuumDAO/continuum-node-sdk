import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	activateWebhook,
	addWebhook,
	addWebhookFromCatalog,
	deactivateWebhook,
	getWebhook,
	listBundledWebhookTemplates,
	listWebhooks,
	removeWebhook,
	runWebhook,
	updateWebhook,
} from '../core/agent/webhooks.js';
import {
	AddWebhookFromCatalogInputSchema,
	AddWebhookInputSchema,
	AgentWebhookDetailSchema,
	AgentWebhookSummarySchema,
	GetWebhookQuerySchema,
	ListWebhooksDataSchema,
	RemoveWebhookInputSchema,
	RunWebhookOutputSchema,
	SelectedSigningKeySchema,
	UpdateWebhookInputSchema,
	WebhookRefInputSchema,
} from '../schemas/extended.js';
import {camelToSnake, wrapSdk} from './tool-utils.js';

const WEBHOOK_MUTATION_OUTPUT_SCHEMA = z
	.object({
		webhook: AgentWebhookDetailSchema,
		secretEnvVar: z.string().optional(),
		inboundUrl: z.string().optional(),
		selectedSigningKey: SelectedSigningKeySchema.optional(),
		signingMessage: z.string(),
	})
	.strict();

const WEBHOOK_REF_MUTATION_OUTPUT_SCHEMA = z
	.object({
		webhook: AgentWebhookDetailSchema,
		selectedSigningKey: SelectedSigningKeySchema.optional(),
		signingMessage: z.string(),
	})
	.strict();

const REMOVE_WEBHOOK_OUTPUT_SCHEMA = z
	.object({
		message: z.string(),
		selectedSigningKey: SelectedSigningKeySchema.optional(),
		signingMessage: z.string(),
	})
	.strict();

const RUN_WEBHOOK_OUTPUT_SCHEMA = z
	.object({
		status: z.literal('started'),
		selectedSigningKey: SelectedSigningKeySchema.optional(),
		signingMessage: z.string(),
	})
	.strict();

export function registerAgentWebhookTools(
	server: McpServer,
	config: NodeSdkConfig,
): void {
	server.registerTool(
		camelToSnake('listWebhooks'),
		{
			description:
				'List active inbound webhooks (GET /listWebhooks): activeWebhooks plus availableCatalog templates not yet added. Check secretConfigured before enabling. Secrets live in Variables (WEBHOOK_SECRET_*); use add_environment_variable.',
			inputSchema: z.object({}).strict(),
			outputSchema: ListWebhooksDataSchema,
		},
		async () => wrapSdk(listWebhooks(config)),
	);

	server.registerTool(
		camelToSnake('listBundledWebhookTemplates'),
		{
			description:
				'List bundled webhook template names shipped with mpc-config (hooks/webhooks.json parity). Use with list_webhooks availableCatalog, then add_webhook_from_catalog.',
			inputSchema: z.object({}).strict(),
			outputSchema: z.object({
				templates: z.array(AddWebhookFromCatalogInputSchema),
			}),
		},
		async () =>
			wrapSdk(
				Promise.resolve({
					ok: true as const,
					data: {templates: [...listBundledWebhookTemplates()]},
				}),
			),
	);

	server.registerTool(
		camelToSnake('getWebhook'),
		{
			description: 'Get one webhook by id (GET /getWebhookById), including prompt and inbound URL.',
			inputSchema: GetWebhookQuerySchema,
			outputSchema: z
				.object({
					webhook: AgentWebhookDetailSchema,
					inboundUrl: z.string().optional(),
				})
				.strict(),
		},
		async (query: z.infer<typeof GetWebhookQuerySchema>) =>
			wrapSdk(getWebhook(config, query)),
	);

	server.registerTool(
		camelToSnake('addWebhook'),
		{
			description:
				'Add a custom inbound webhook (POST /addWebhook, management-signed). Strict schema: name (a-z, digits, hyphen, underscore), type, prompt. Set WEBHOOK_SECRET_* via add_environment_variable before enabling. New jobs default enabled unless enabled:false.',
			inputSchema: AddWebhookInputSchema,
			outputSchema: WEBHOOK_MUTATION_OUTPUT_SCHEMA,
		},
		async (input: z.infer<typeof AddWebhookInputSchema>) =>
			wrapSdk(addWebhook(config, input)),
	);

	server.registerTool(
		camelToSnake('addWebhookFromCatalog'),
		{
			description:
				'Add a webhook from the bundled repository catalog by template name (POST /addWebhookFromCatalog). Creates WEBHOOK_SECRET_* automatically; replace with provider secret in Variables before enabling for stripe/slack/etc.',
			inputSchema: AddWebhookFromCatalogInputSchema,
			outputSchema: WEBHOOK_MUTATION_OUTPUT_SCHEMA,
		},
		async (input: z.infer<typeof AddWebhookFromCatalogInputSchema>) =>
			wrapSdk(addWebhookFromCatalog(config, input)),
	);

	server.registerTool(
		camelToSnake('updateWebhook'),
		{
			description:
				'Update webhook prompt and/or type (POST /updateWebhook). Does not change enabled — use activate_webhook or deactivate_webhook.',
			inputSchema: UpdateWebhookInputSchema,
			outputSchema: WEBHOOK_MUTATION_OUTPUT_SCHEMA,
		},
		async (input: z.infer<typeof UpdateWebhookInputSchema>) =>
			wrapSdk(updateWebhook(config, input)),
	);

	server.registerTool(
		camelToSnake('activateWebhook'),
		{
			description:
				'Enable an inbound webhook (POST /activateWebhook). Ensure WEBHOOK_SECRET_* (and TELEGRAM_BOT_TOKEN for telegram) are set first.',
			inputSchema: WebhookRefInputSchema,
			outputSchema: WEBHOOK_REF_MUTATION_OUTPUT_SCHEMA,
		},
		async (input: z.infer<typeof WebhookRefInputSchema>) =>
			wrapSdk(activateWebhook(config, input)),
	);

	server.registerTool(
		camelToSnake('deactivateWebhook'),
		{
			description:
				'Disable an inbound webhook without deleting it (POST /deactivateWebhook).',
			inputSchema: WebhookRefInputSchema,
			outputSchema: WEBHOOK_REF_MUTATION_OUTPUT_SCHEMA,
		},
		async (input: z.infer<typeof WebhookRefInputSchema>) =>
			wrapSdk(deactivateWebhook(config, input)),
	);

	server.registerTool(
		camelToSnake('removeWebhook'),
		{
			description: 'Remove a webhook by id or name (POST /removeWebhook). Deletes WEBHOOK_SECRET_* variable.',
			inputSchema: RemoveWebhookInputSchema,
			outputSchema: REMOVE_WEBHOOK_OUTPUT_SCHEMA,
		},
		async (input: z.infer<typeof RemoveWebhookInputSchema>) =>
			wrapSdk(removeWebhook(config, input)),
	);

	server.registerTool(
		camelToSnake('runWebhook'),
		{
			description:
				'Manually trigger a test webhook run (POST /runWebhook). Returns started immediately; agent turn runs async.',
			inputSchema: WebhookRefInputSchema,
			outputSchema: RUN_WEBHOOK_OUTPUT_SCHEMA,
		},
		async (input: z.infer<typeof WebhookRefInputSchema>) =>
			wrapSdk(runWebhook(config, input)),
	);
}
