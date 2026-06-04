import type {AddWebhookFromCatalogInput} from '../../schemas/extended.js';

/**
 * Bundled optional webhook catalog (keep in sync with mpc-config agent_llm_config.defaults/hooks/webhooks.json).
 *
 * Secrets: WEBHOOK_SECRET_* and TELEGRAM_BOT_TOKEN via add_environment_variable only.
 * The AI agent must not receive Variable values — only names in list/get responses.
 */
export const BUNDLED_WEBHOOK_TEMPLATES: readonly AddWebhookFromCatalogInput[] = [
	{name: 'generic_inbound'},
	{name: 'github_events'},
	{name: 'gmail_inbox'},
	{name: 'proton_inbox'},
	{name: 'stripe_events'},
	{name: 'slack_events'},
	{name: 'telegram_updates'},
] as const;

export function listBundledWebhookTemplates(): readonly AddWebhookFromCatalogInput[] {
	return BUNDLED_WEBHOOK_TEMPLATES;
}
