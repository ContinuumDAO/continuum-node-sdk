import {managementPost} from '../../api/management-api.js';
import type {NodeSdkConfig} from '../../config/schema.js';
import {
	AGENT_TELEGRAM_API_PATHS,
	DEFAULT_MANAGEMENT_SIGNING,
	SendTelegramMessageInputSchema,
	SendTelegramMessageResultSchema,
	type ManagementSigningMethod,
} from '../../schemas/extended.js';
import type {SdkResult} from '../result.js';
import {
	buildManagementPostRequest,
	managementSign,
	toSelectedSigner,
	type BuiltManagementPostRequest,
} from '../management-signer.js';
import {z} from 'zod';
import {validateWebhookName, normalizeWebhookName} from './webhooks.js';
import {
	normalizeAgentEnvironmentVariableName,
	validateAgentEnvironmentVariableName,
} from './environment-variables.js';

export type SendTelegramMessageInput = z.infer<
	typeof SendTelegramMessageInputSchema
>;
export type SendTelegramMessageResult = z.infer<
	typeof SendTelegramMessageResultSchema
>;

export async function buildSendTelegramMessage(
	config: NodeSdkConfig,
	input: SendTelegramMessageInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = SendTelegramMessageInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid send Telegram message input.'};
	}
	let webhookName: string | undefined;
	if (parsed.data.webhookName) {
		const nameErr = validateWebhookName(parsed.data.webhookName);
		if (nameErr) {
			return {ok: false, reason: nameErr};
		}
		webhookName = normalizeWebhookName(parsed.data.webhookName);
	}
	let chatIdEnvVar: string | undefined;
	if (parsed.data.chatIdEnvVar) {
		const envErr = validateAgentEnvironmentVariableName(
			parsed.data.chatIdEnvVar,
		);
		if (envErr) {
			return {ok: false, reason: envErr};
		}
		chatIdEnvVar = normalizeAgentEnvironmentVariableName(
			parsed.data.chatIdEnvVar,
		);
	}
	return buildManagementPostRequest(
		config,
		{
			path: AGENT_TELEGRAM_API_PATHS.sendMessage,
			buildRequestFields: () => ({
				text: parsed.data.text,
				...(webhookName ? {webhookName} : {}),
				...(chatIdEnvVar ? {chatIdEnvVar} : {}),
			}),
		},
		signing,
	);
}

/** POST /sendTelegramMessage — push text to the stored operator Telegram chat. */
export async function sendTelegramMessage(
	config: NodeSdkConfig,
	input: SendTelegramMessageInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		result: SendTelegramMessageResult;
		selectedSigningKey?: ReturnType<typeof toSelectedSigner>;
		signingMessage: string;
	}>
> {
	const built = await buildSendTelegramMessage(config, input, signing);
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
	const data =
		posted.data && typeof posted.data === 'object' && !Array.isArray(posted.data)
			? (posted.data as Record<string, unknown>)
			: {};
	const parsed = SendTelegramMessageResultSchema.safeParse({
		sent: data.sent ?? data.Sent,
		chatId: Number(data.chatId ?? data.ChatID ?? data.ChatId),
		chunks: Number(data.chunks ?? data.Chunks),
	});
	if (!parsed.success) {
		return {ok: false, reason: 'Send Telegram message response failed validation.'};
	}
	return {
		ok: true,
		data: {
			result: parsed.data,
			selectedSigningKey: built.data.selectedSigningKey
				? toSelectedSigner(built.data.selectedSigningKey)
				: undefined,
			signingMessage: built.data.canonicalJson,
		},
	};
}
