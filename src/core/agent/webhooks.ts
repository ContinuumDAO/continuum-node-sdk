import type {NodeSdkConfig} from '../../config/schema.js';
import {
	buildManagementQueryPath,
	managementGet,
	managementPost,
} from '../../api/management-api.js';
import {
	AGENT_WEBHOOK_API_PATHS,
	AddWebhookFromCatalogInputSchema,
	AddWebhookInputSchema,
	AgentWebhookDetailSchema,
	AgentWebhookSummarySchema,
	AgentWebhookCatalogItemSchema,
	DEFAULT_MANAGEMENT_SIGNING,
	GetWebhookQuerySchema,
	ListWebhooksDataSchema,
	UpdateWebhookInputSchema,
	WebhookRefInputSchema,
	type AddWebhookFromCatalogInput,
	type AddWebhookInput,
	type ManagementSigningMethod,
	type UpdateWebhookInput,
} from '../../schemas/extended.js';
import type {SdkResult} from '../result.js';
import {
	buildManagementPostRequest,
	managementSign,
	toSelectedSigner,
	type BuiltManagementPostRequest,
} from '../management-signer.js';
import {z} from 'zod';

export type AgentWebhookSummary = z.infer<typeof AgentWebhookSummarySchema>;
export type AgentWebhookDetail = z.infer<typeof AgentWebhookDetailSchema>;
export type ListWebhooksData = z.infer<typeof ListWebhooksDataSchema>;

const WEBHOOK_NAME_RE = /^[a-z][a-z0-9_-]*$/;

export function normalizeWebhookName(raw: string): string {
	return raw
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_-]/g, '-')
		.replace(/^-+/, '')
		.replace(/-+/g, '-');
}

export function validateWebhookName(name: string): string | null {
	const normalized = normalizeWebhookName(name);
	if (!normalized) {
		return 'Webhook name is required.';
	}
	if (normalized.length > 64) {
		return 'Webhook name must be at most 64 characters.';
	}
	if (!WEBHOOK_NAME_RE.test(normalized)) {
		return 'Webhook name must start with a-z and use only a-z, 0-9, hyphen, and underscore.';
	}
	return null;
}

function parseWebhookType(raw: unknown): z.infer<
	typeof AgentWebhookSummarySchema
>['type'] {
	const t = String(raw ?? 'generic').trim().toLowerCase();
	if (
		t === 'github' ||
		t === 'gmail' ||
		t === 'proton' ||
		t === 'stripe' ||
		t === 'slack' ||
		t === 'telegram'
	) {
		return t;
	}
	return 'generic';
}

function parseWebhookSummary(raw: unknown): AgentWebhookSummary | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return null;
	}
	const o = raw as Record<string, unknown>;
	const parsed = AgentWebhookSummarySchema.safeParse({
		id: String(o.id ?? o.Id ?? '').trim(),
		name: String(o.name ?? o.Name ?? '').trim(),
		enabled: Boolean(o.enabled ?? o.Enabled ?? false),
		type: parseWebhookType(o.type ?? o.Type),
		conversationId: String(o.conversationId ?? o.ConversationId ?? '').trim(),
		inboundUrl: String(o.inboundUrl ?? o.InboundUrl ?? '').trim() || undefined,
		secretEnvVar: String(o.secretEnvVar ?? o.SecretEnvVar ?? '').trim() || undefined,
		secretConfigured: Boolean(o.secretConfigured ?? o.SecretConfigured ?? false),
		telegramBotTokenEnvVar:
			String(o.telegramBotTokenEnvVar ?? o.TelegramBotTokenEnvVar ?? '').trim() ||
			undefined,
		telegramBotTokenConfigured: Boolean(
			o.telegramBotTokenConfigured ?? o.TelegramBotTokenConfigured ?? false,
		),
		catalog: Boolean(o.catalog ?? o.Catalog ?? false),
		createdAt: String(o.createdAt ?? o.CreatedAt ?? '').trim() || undefined,
		updatedAt: String(o.updatedAt ?? o.UpdatedAt ?? '').trim() || undefined,
		lastTriggeredAt:
			String(o.lastTriggeredAt ?? o.LastTriggeredAt ?? '').trim() || undefined,
	});
	return parsed.success ? parsed.data : null;
}

function parseWebhookDetail(raw: unknown): AgentWebhookDetail | null {
	const summary = parseWebhookSummary(raw);
	if (!summary || !raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return null;
	}
	const o = raw as Record<string, unknown>;
	const parsed = AgentWebhookDetailSchema.safeParse({
		...summary,
		prompt: String(o.prompt ?? o.Prompt ?? '').trim(),
	});
	return parsed.success ? parsed.data : null;
}

export async function listWebhooks(
	config: NodeSdkConfig,
): Promise<SdkResult<ListWebhooksData>> {
	const result = await managementGet<unknown>(config, AGENT_WEBHOOK_API_PATHS.list);
	if (!result.ok) {
		return result;
	}
	const data =
		result.data && typeof result.data === 'object' && !Array.isArray(result.data)
			? (result.data as Record<string, unknown>)
			: {};
	const parseRows = (raw: unknown): AgentWebhookSummary[] => {
		if (!Array.isArray(raw)) {
			return [];
		}
		const out: AgentWebhookSummary[] = [];
		for (const item of raw) {
			const row = parseWebhookSummary(item);
			if (row) {
				out.push(row);
			}
		}
		return out;
	};
	const activeWebhooks = parseRows(
		data.activeWebhooks ?? data.ActiveWebhooks ?? data.webhooks ?? data.Webhooks,
	);
	const webhooks = parseRows(data.webhooks ?? data.Webhooks ?? activeWebhooks);
	const catalogRaw = data.availableCatalog ?? data.AvailableCatalog;
	const availableCatalog = Array.isArray(catalogRaw)
		? catalogRaw.flatMap(item => {
				if (!item || typeof item !== 'object' || Array.isArray(item)) {
					return [];
				}
				const o = item as Record<string, unknown>;
				const parsed = AgentWebhookCatalogItemSchema.safeParse({
						name: String(o.name ?? o.Name ?? '').trim(),
						type: parseWebhookType(o.type ?? o.Type),
						prompt: String(o.prompt ?? o.Prompt ?? '').trim() || undefined,
						enabled: Boolean(o.enabled ?? o.Enabled ?? false),
					});
				return parsed.success ? [parsed.data] : [];
			})
		: [];
	const payload = {
		activeWebhooks: activeWebhooks.length > 0 ? activeWebhooks : webhooks,
		availableCatalog,
		webhooks: webhooks.length > 0 ? webhooks : activeWebhooks,
	};
	const validated = ListWebhooksDataSchema.safeParse(payload);
	if (!validated.success) {
		return {ok: false, reason: 'List webhooks response failed validation.'};
	}
	return {ok: true, data: validated.data};
}

export async function getWebhook(
	config: NodeSdkConfig,
	query: z.infer<typeof GetWebhookQuerySchema>,
): Promise<
	SdkResult<{webhook: AgentWebhookDetail; inboundUrl?: string}>
> {
	const parsedQuery = GetWebhookQuerySchema.safeParse(query);
	if (!parsedQuery.success) {
		return {ok: false, reason: 'Invalid get webhook query.'};
	}
	const path = buildManagementQueryPath(AGENT_WEBHOOK_API_PATHS.get, {
		id: parsedQuery.data.id,
	});
	const result = await managementGet<unknown>(config, path);
	if (!result.ok) {
		return result;
	}
	const data =
		result.data && typeof result.data === 'object' && !Array.isArray(result.data)
			? (result.data as Record<string, unknown>)
			: {};
	const webhook = parseWebhookDetail(data.webhook ?? data.Webhook);
	if (!webhook) {
		return {ok: false, reason: 'Webhook response failed validation.'};
	}
	const inboundUrl =
		String(data.inboundUrl ?? data.InboundUrl ?? webhook.inboundUrl ?? '').trim() ||
		undefined;
	return {ok: true, data: {webhook, inboundUrl}};
}

async function postWebhookMutation<T>(
	config: NodeSdkConfig,
	built: SdkResult<BuiltManagementPostRequest>,
	signing: ManagementSigningMethod,
	parseData: (raw: unknown) => T | null,
	fallbackReason: string,
): Promise<
	SdkResult<
		T & {
			selectedSigningKey?: ReturnType<typeof toSelectedSigner>;
			signingMessage: string;
		}
	>
> {
	if (!built.ok) {
		return built;
	}
	const signed = await managementSign(config, signing, built.data.unsignedBody);
	if (!signed.ok) {
		return signed;
	}
	const posted = await managementPost<unknown>(
		config,
		built.data.path,
		signed.data,
	);
	if (!posted.ok) {
		return posted;
	}
	const parsed = parseData(posted.data);
	if (!parsed) {
		return {ok: false, reason: fallbackReason};
	}
	return {
		ok: true,
		data: {
			...parsed,
			selectedSigningKey: built.data.selectedSigningKey
				? toSelectedSigner(built.data.selectedSigningKey)
				: undefined,
			signingMessage: built.data.canonicalJson,
		},
	};
}

function parseWebhookMutationResponse(raw: unknown): {
	webhook: AgentWebhookDetail;
	secretEnvVar?: string;
	inboundUrl?: string;
} | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return null;
	}
	const o = raw as Record<string, unknown>;
	const webhook = parseWebhookDetail(o.webhook ?? o.Webhook);
	if (!webhook) {
		return null;
	}
	return {
		webhook,
		secretEnvVar:
			String(o.secretEnvVar ?? o.SecretEnvVar ?? '').trim() || undefined,
		inboundUrl: String(o.inboundUrl ?? o.InboundUrl ?? '').trim() || undefined,
	};
}

export async function buildAddWebhook(
	config: NodeSdkConfig,
	input: AddWebhookInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = AddWebhookInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid add webhook input.'};
	}
	const nameErr = validateWebhookName(parsed.data.name);
	if (nameErr) {
		return {ok: false, reason: nameErr};
	}
	return buildManagementPostRequest(
		config,
		{
			path: AGENT_WEBHOOK_API_PATHS.add,
			buildRequestFields: () => ({
				name: normalizeWebhookName(parsed.data.name),
				type: parsed.data.type,
				prompt: parsed.data.prompt.trim(),
				...(parsed.data.enabled !== undefined
					? {enabled: parsed.data.enabled}
					: {}),
			}),
		},
		signing,
	);
}

export async function addWebhook(
	config: NodeSdkConfig,
	input: AddWebhookInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
) {
	const built = await buildAddWebhook(config, input, signing);
	return postWebhookMutation(
		config,
		built,
		signing,
		parseWebhookMutationResponse,
		'Add webhook response failed validation.',
	);
}

export async function buildAddWebhookFromCatalog(
	config: NodeSdkConfig,
	input: AddWebhookFromCatalogInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = AddWebhookFromCatalogInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid add webhook from catalog input.'};
	}
	const nameErr = validateWebhookName(parsed.data.name);
	if (nameErr) {
		return {ok: false, reason: nameErr};
	}
	return buildManagementPostRequest(
		config,
		{
			path: AGENT_WEBHOOK_API_PATHS.addFromCatalog,
			buildRequestFields: () => ({
				name: normalizeWebhookName(parsed.data.name),
				...(parsed.data.enabled !== undefined
					? {enabled: parsed.data.enabled}
					: {}),
			}),
		},
		signing,
	);
}

export async function addWebhookFromCatalog(
	config: NodeSdkConfig,
	input: AddWebhookFromCatalogInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
) {
	const built = await buildAddWebhookFromCatalog(config, input, signing);
	return postWebhookMutation(
		config,
		built,
		signing,
		parseWebhookMutationResponse,
		'Add webhook from catalog response failed validation.',
	);
}

export async function buildUpdateWebhook(
	config: NodeSdkConfig,
	input: UpdateWebhookInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = UpdateWebhookInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid update webhook input.'};
	}
	return buildManagementPostRequest(
		config,
		{
			path: AGENT_WEBHOOK_API_PATHS.update,
			buildRequestFields: () => ({
				id: parsed.data.id.trim(),
				...(parsed.data.prompt !== undefined
					? {prompt: parsed.data.prompt.trim()}
					: {}),
				...(parsed.data.type !== undefined ? {type: parsed.data.type} : {}),
			}),
		},
		signing,
	);
}

export async function updateWebhook(
	config: NodeSdkConfig,
	input: UpdateWebhookInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
) {
	const built = await buildUpdateWebhook(config, input, signing);
	return postWebhookMutation(
		config,
		built,
		signing,
		parseWebhookMutationResponse,
		'Update webhook response failed validation.',
	);
}

async function buildWebhookRefPost(
	config: NodeSdkConfig,
	path: string,
	input: z.infer<typeof WebhookRefInputSchema>,
	signing: ManagementSigningMethod,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = WebhookRefInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid webhook reference input.'};
	}
	if (parsed.data.name) {
		const nameErr = validateWebhookName(parsed.data.name);
		if (nameErr) {
			return {ok: false, reason: nameErr};
		}
	}
	return buildManagementPostRequest(
		config,
		{
			path,
			buildRequestFields: () => ({
				...(parsed.data.id ? {id: parsed.data.id.trim()} : {}),
				...(parsed.data.name
					? {name: normalizeWebhookName(parsed.data.name)}
					: {}),
			}),
		},
		signing,
	);
}

export async function buildActivateWebhook(
	config: NodeSdkConfig,
	input: z.infer<typeof WebhookRefInputSchema>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
) {
	return buildWebhookRefPost(
		config,
		AGENT_WEBHOOK_API_PATHS.activate,
		input,
		signing,
	);
}

export async function activateWebhook(
	config: NodeSdkConfig,
	input: z.infer<typeof WebhookRefInputSchema>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
) {
	const built = await buildActivateWebhook(config, input, signing);
	return postWebhookMutation(
		config,
		built,
		signing,
		raw => {
			const webhook = parseWebhookDetail(raw);
			return webhook ? {webhook} : null;
		},
		'Activate webhook response failed validation.',
	);
}

export async function buildDeactivateWebhook(
	config: NodeSdkConfig,
	input: z.infer<typeof WebhookRefInputSchema>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
) {
	return buildWebhookRefPost(
		config,
		AGENT_WEBHOOK_API_PATHS.deactivate,
		input,
		signing,
	);
}

export async function deactivateWebhook(
	config: NodeSdkConfig,
	input: z.infer<typeof WebhookRefInputSchema>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
) {
	const built = await buildDeactivateWebhook(config, input, signing);
	return postWebhookMutation(
		config,
		built,
		signing,
		raw => {
			const webhook = parseWebhookDetail(raw);
			return webhook ? {webhook} : null;
		},
		'Deactivate webhook response failed validation.',
	);
}

export async function buildRemoveWebhook(
	config: NodeSdkConfig,
	input: z.infer<typeof WebhookRefInputSchema>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
) {
	return buildWebhookRefPost(
		config,
		AGENT_WEBHOOK_API_PATHS.remove,
		input,
		signing,
	);
}

export async function removeWebhook(
	config: NodeSdkConfig,
	input: z.infer<typeof WebhookRefInputSchema>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		message: string;
		selectedSigningKey?: ReturnType<typeof toSelectedSigner>;
		signingMessage: string;
	}>
> {
	const built = await buildRemoveWebhook(config, input, signing);
	if (!built.ok) {
		return built;
	}
	const signed = await managementSign(config, signing, built.data.unsignedBody);
	if (!signed.ok) {
		return signed;
	}
	const posted = await managementPost<unknown>(
		config,
		built.data.path,
		signed.data,
	);
	if (!posted.ok) {
		return posted;
	}
	return {
		ok: true,
		data: {
			message: 'Webhook removed',
			selectedSigningKey: built.data.selectedSigningKey
				? toSelectedSigner(built.data.selectedSigningKey)
				: undefined,
			signingMessage: built.data.canonicalJson,
		},
	};
}

export async function buildRunWebhook(
	config: NodeSdkConfig,
	input: z.infer<typeof WebhookRefInputSchema>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
) {
	return buildWebhookRefPost(config, AGENT_WEBHOOK_API_PATHS.run, input, signing);
}

export async function runWebhook(
	config: NodeSdkConfig,
	input: z.infer<typeof WebhookRefInputSchema>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		status: 'started';
		selectedSigningKey?: ReturnType<typeof toSelectedSigner>;
		signingMessage: string;
	}>
> {
	const built = await buildRunWebhook(config, input, signing);
	if (!built.ok) {
		return built;
	}
	const signed = await managementSign(config, signing, built.data.unsignedBody);
	if (!signed.ok) {
		return signed;
	}
	const posted = await managementPost<unknown>(
		config,
		built.data.path,
		signed.data,
	);
	if (!posted.ok) {
		return posted;
	}
	const raw =
		posted.data && typeof posted.data === 'object' && !Array.isArray(posted.data)
			? (posted.data as Record<string, unknown>)
			: {};
	const status = String(raw.status ?? raw.Status ?? 'started').trim();
	if (status !== 'started') {
		return {ok: false, reason: 'Run webhook response failed validation.'};
	}
	return {
		ok: true,
		data: {
			status: 'started',
			selectedSigningKey: built.data.selectedSigningKey
				? toSelectedSigner(built.data.selectedSigningKey)
				: undefined,
			signingMessage: built.data.canonicalJson,
		},
	};
}

