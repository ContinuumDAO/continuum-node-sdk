import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	buildManagementQueryPath,
	managementGet,
	managementPost,
} from '../api/management-api.js';
import {
	DEFAULT_MANAGEMENT_SIGNING,
	DeleteKeyGenMessageDataSchema,
	DeleteKeyGenMessageInputSchema,
	GetKeyGenMessageByIdQuerySchema,
	GetKeyGenMessageThreadQuerySchema,
	KeyGenMessageSchema,
	KeyGenMessageWithRepliesSchema,
	ListKeyGenMessagesDataSchema,
	ListKeyGenMessagesQuerySchema,
	MarkKeyGenMessageReadDataSchema,
	MarkKeyGenMessageReadInputSchema,
	MarkKeyGenMessageReadOutputSchema,
	MultiDeleteKeyGenMessagesDataSchema,
	MultiDeleteKeyGenMessagesInputSchema,
	MultiMarkKeyGenMessagesReadDataSchema,
	MultiMarkKeyGenMessagesReadInputSchema,
	MultiMarkKeyGenMessagesReadOutputSchema,
	DeleteKeyGenMessageOutputSchema,
	MultiDeleteKeyGenMessagesOutputSchema,
	SelectedSigningKeySchema,
	SendKeyGenMessageInputSchema,
	type DeleteKeyGenMessageData,
	type DeleteKeyGenMessageInput,
	type GetKeyGenMessageByIdQuery,
	type GetKeyGenMessageThreadQuery,
	type KeyGenMessageWithReplies,
	type ListKeyGenMessagesQuery,
	type ManagementSigningMethod,
	type MarkKeyGenMessageReadInput,
	type MarkKeyGenMessageReadOutput,
	type MultiDeleteKeyGenMessagesData,
	type MultiDeleteKeyGenMessagesInput,
	type MultiMarkKeyGenMessagesReadData,
	type MultiMarkKeyGenMessagesReadInput,
	type MultiMarkKeyGenMessagesReadOutput,
	type DeleteKeyGenMessageOutput,
	type MultiDeleteKeyGenMessagesOutput,
	type SendKeyGenMessageInput,
} from '../schemas/extended.js';
import type {SdkResult} from './result.js';
import {clarifyKeyGenLookupError, parseKeyGenRequestId} from './keygen-id.js';
import {
	buildManagementPostRequest,
	managementSign,
	toSelectedSigner,
	type BuiltManagementPostRequest,
} from './management-signer.js';
import {mpcAuthEnvelopeData} from './mpc/sign-request-utils.js';

function parseKeyGenMessage(raw: unknown): z.infer<typeof KeyGenMessageSchema> | null {
	const data = mpcAuthEnvelopeData(raw) ?? raw;
	const parsed = KeyGenMessageSchema.safeParse(data);
	if (parsed.success) {
		return parsed.data;
	}
	if (!data || typeof data !== 'object' || Array.isArray(data)) {
		return null;
	}
	const row = data as Record<string, unknown>;
	const normalized = {
		id: String(row.id ?? row.Id ?? '').trim(),
		keyGenId: String(row.keyGenId ?? row.KeyGenId ?? '').trim(),
		senderNodeKey: String(row.senderNodeKey ?? row.SenderNodeKey ?? '').trim(),
		title: String(row.title ?? row.Title ?? '').trim() || undefined,
		replyTo: String(row.replyTo ?? row.ReplyTo ?? '').trim() || undefined,
		body: String(row.body ?? row.Body ?? ''),
		createdAt: String(row.createdAt ?? row.CreatedAt ?? '').trim(),
		read: row.read ?? row.Read,
	};
	const retry = KeyGenMessageSchema.safeParse(normalized);
	return retry.success ? retry.data : null;
}

function parseKeyGenMessageThread(raw: unknown): KeyGenMessageWithReplies | null {
	const data = mpcAuthEnvelopeData(raw) ?? raw;
	const parsed = KeyGenMessageWithRepliesSchema.safeParse(data);
	if (parsed.success) {
		return parsed.data;
	}
	const base = parseKeyGenMessage(data);
	if (!base) {
		return null;
	}
	const row = (mpcAuthEnvelopeData(raw) ?? raw) as Record<string, unknown>;
	const repliesRaw = row.replies ?? row.Replies;
	const replies: KeyGenMessageWithReplies[] = [];
	if (Array.isArray(repliesRaw)) {
		for (const item of repliesRaw) {
			const reply = parseKeyGenMessageThread(item);
			if (reply) {
				replies.push(reply);
			}
		}
	}
	return replies.length > 0 ? {...base, replies} : base;
}

function buildSendMessageFields(
	input: SendKeyGenMessageInput,
	keyGenId: string,
): Record<string, unknown> {
	const fields: Record<string, unknown> = {
		keyGenId,
		body: input.body,
	};
	if (input.replyTo?.trim()) {
		fields.replyTo = input.replyTo.trim();
	} else if (input.title?.trim()) {
		fields.title = input.title.trim();
	}
	return fields;
}

function buildKeyGenMessageIdFields(
	keyGenId: string,
	messageId: string,
): Record<string, unknown> {
	return {
		keyGenId,
		messageId: messageId.trim(),
	};
}

function buildKeyGenMessageIdsFields(
	keyGenId: string,
	messageIds: readonly string[],
): Record<string, unknown> {
	return {
		keyGenId,
		messageIds: messageIds.map(id => id.trim()),
	};
}

function appendOptionalReadSignature(
	fields: Record<string, unknown>,
	signature: string | undefined,
): Record<string, unknown> {
	if (signature?.trim()) {
		return {...fields, signature: signature.trim()};
	}
	return fields;
}

function parseStringArray(raw: unknown): string[] {
	if (!Array.isArray(raw)) {
		return [];
	}
	const ids: string[] = [];
	for (const item of raw) {
		const id = String(item ?? '').trim();
		if (id) {
			ids.push(id);
		}
	}
	return ids;
}

function parseMarkMessageReadResponse(
	raw: unknown,
): z.infer<typeof MarkKeyGenMessageReadDataSchema> | null {
	const data = mpcAuthEnvelopeData(raw) ?? raw;
	if (typeof data !== 'string' || data.trim().toLowerCase() !== 'ok') {
		return null;
	}
	const parsed = MarkKeyGenMessageReadDataSchema.safeParse({message: 'ok'});
	return parsed.success ? parsed.data : null;
}

function parseSelectedSigningKey(
	option: Parameters<typeof toSelectedSigner>[0] | undefined,
): z.infer<typeof SelectedSigningKeySchema> | undefined {
	if (!option) {
		return undefined;
	}
	const parsed = SelectedSigningKeySchema.safeParse(toSelectedSigner(option));
	return parsed.success ? parsed.data : undefined;
}

function parseMultiMarkMessagesReadResponse(
	raw: unknown,
): MultiMarkKeyGenMessagesReadData | null {
	const data = mpcAuthEnvelopeData(raw) ?? raw;
	if (!data || typeof data !== 'object' || Array.isArray(data)) {
		return null;
	}
	const row = data as Record<string, unknown>;
	const markedRaw = row.marked ?? row.Marked;
	const marked =
		typeof markedRaw === 'number' && Number.isFinite(markedRaw) ? markedRaw : 0;
	const parsed = MultiMarkKeyGenMessagesReadDataSchema.safeParse({
		marked,
		notFound: parseStringArray(row.notFound ?? row.NotFound),
	});
	return parsed.success ? parsed.data : null;
}

function parseDeleteMessageResponse(raw: unknown): DeleteKeyGenMessageData | null {
	const data = mpcAuthEnvelopeData(raw) ?? raw;
	if (!data || typeof data !== 'object' || Array.isArray(data)) {
		return null;
	}
	const row = data as Record<string, unknown>;
	const deletedRaw = row.deleted ?? row.Deleted;
	const deleted =
		typeof deletedRaw === 'number' && Number.isFinite(deletedRaw) ? deletedRaw : 0;
	const parsed = DeleteKeyGenMessageDataSchema.safeParse({deleted});
	return parsed.success ? parsed.data : null;
}

function parseMultiDeleteMessagesResponse(
	raw: unknown,
): MultiDeleteKeyGenMessagesData | null {
	const data = mpcAuthEnvelopeData(raw) ?? raw;
	if (!data || typeof data !== 'object' || Array.isArray(data)) {
		return null;
	}
	const row = data as Record<string, unknown>;
	const deletedRaw = row.deleted ?? row.Deleted;
	const deleted =
		typeof deletedRaw === 'number' && Number.isFinite(deletedRaw) ? deletedRaw : 0;
	const parsed = MultiDeleteKeyGenMessagesDataSchema.safeParse({
		deleted,
		notFound: parseStringArray(row.notFound ?? row.NotFound),
		forbidden: parseStringArray(row.forbidden ?? row.Forbidden),
	});
	return parsed.success ? parsed.data : null;
}

type KeyGenMessagingSignedPostMeta = {
	selectedSigningKey?: z.infer<typeof SelectedSigningKeySchema>;
	signingMessage: string;
};

async function executeKeyGenMessagingSignedPost<T>(
	config: NodeSdkConfig,
	built: SdkResult<BuiltManagementPostRequest>,
	signing: ManagementSigningMethod,
	parseResponse: (raw: unknown) => T | null,
	invalidReason: string,
): Promise<SdkResult<{result: T} & KeyGenMessagingSignedPostMeta>> {
	if (!built.ok) {
		return built;
	}
	const signed = await managementSign(config, signing, built.data.unsignedBody);
	if (!signed.ok) {
		return signed;
	}
	const posted = await managementPost<unknown>(config, built.data.path, signed.data);
	if (!posted.ok) {
		return posted;
	}
	const result = parseResponse(posted.data);
	if (result === null) {
		return {ok: false, reason: invalidReason};
	}
	const selectedSigningKey = parseSelectedSigningKey(built.data.selectedSigningKey);
	if (built.data.selectedSigningKey && !selectedSigningKey) {
		return {ok: false, reason: 'Invalid selected signing key.'};
	}
	return {
		ok: true,
		data: {
			result,
			selectedSigningKey,
			signingMessage: built.data.canonicalJson,
		},
	};
}

export async function buildSendKeyGenMessage(
	config: NodeSdkConfig,
	input: SendKeyGenMessageInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = SendKeyGenMessageInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.issues[0]?.message ?? 'Invalid send message input.'};
	}
	const keyGenId = parseKeyGenRequestId(parsed.data.keyGenId);
	if (!keyGenId.ok) {
		return keyGenId;
	}
	return buildManagementPostRequest(
		config,
		{
			path: '/sendMessage',
			buildRequestFields: () => buildSendMessageFields(parsed.data, keyGenId.data),
		},
		signing,
	);
}

/** POST /sendMessage — top-level or reply in a KeyGen channel (management-signed). */
export async function sendKeyGenMessage(
	config: NodeSdkConfig,
	input: SendKeyGenMessageInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		message: z.infer<typeof KeyGenMessageSchema>;
		selectedSigningKey?: ReturnType<typeof toSelectedSigner>;
		signingMessage: string;
	}>
> {
	const built = await buildSendKeyGenMessage(config, input, signing);
	if (!built.ok) {
		return built;
	}
	const signed = await managementSign(config, signing, built.data.unsignedBody);
	if (!signed.ok) {
		return signed;
	}
	const posted = await managementPost<unknown>(config, built.data.path, signed.data);
	if (!posted.ok) {
		return posted;
	}
	const message = parseKeyGenMessage(posted.data);
	if (!message) {
		return {ok: false, reason: 'Invalid sendMessage response.'};
	}
	const selectedSigningKey = parseSelectedSigningKey(built.data.selectedSigningKey);
	if (built.data.selectedSigningKey && !selectedSigningKey) {
		return {ok: false, reason: 'Invalid selected signing key.'};
	}
	const output = z
		.object({
			message: KeyGenMessageSchema,
			selectedSigningKey: SelectedSigningKeySchema.optional(),
			signingMessage: z.string(),
		})
		.strict()
		.safeParse({
			message,
			selectedSigningKey,
			signingMessage: built.data.canonicalJson,
		});
	if (!output.success) {
		return {ok: false, reason: 'Invalid sendMessage response.'};
	}
	return {ok: true, data: output.data};
}

/** GET /listMessages — paginated KeyGen channel messages. */
export async function listKeyGenMessages(
	config: NodeSdkConfig,
	query: ListKeyGenMessagesQuery,
): Promise<SdkResult<z.infer<typeof ListKeyGenMessagesDataSchema>>> {
	const parsed = ListKeyGenMessagesQuerySchema.safeParse(query);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid list messages query.'};
	}
	const keyGenId = parseKeyGenRequestId(parsed.data.keyGenId);
	if (!keyGenId.ok) {
		return keyGenId;
	}
	const path = buildManagementQueryPath('/listMessages', {
		keyGenId: keyGenId.data,
		unread: parsed.data.unread === undefined ? undefined : String(parsed.data.unread),
		top_level: parsed.data.topLevel === undefined ? undefined : String(parsed.data.topLevel),
		fromTime: parsed.data.fromTime,
		toTime: parsed.data.toTime,
		pagenum: parsed.data.pagenum === undefined ? undefined : String(parsed.data.pagenum),
		pagesize: parsed.data.pagesize === undefined ? undefined : String(parsed.data.pagesize),
	});
	const raw = await managementGet<unknown>(config, path);
	if (!raw.ok) {
		return {ok: false, reason: clarifyKeyGenLookupError(raw.reason)};
	}
	const data = mpcAuthEnvelopeData(raw.data) ?? raw.data;
	if (!data || typeof data !== 'object' || Array.isArray(data)) {
		return {ok: false, reason: 'Invalid listMessages response.'};
	}
	const row = data as Record<string, unknown>;
	const listRaw = row.list ?? row.List;
	const totalRaw = row.total ?? row.Total;
	const list: z.infer<typeof KeyGenMessageSchema>[] = [];
	if (Array.isArray(listRaw)) {
		for (const item of listRaw) {
			const message = parseKeyGenMessage(item);
			if (message) {
				list.push(message);
			}
		}
	}
	const total =
		typeof totalRaw === 'number' && Number.isFinite(totalRaw) ? totalRaw : list.length;
	const result = ListKeyGenMessagesDataSchema.safeParse({list, total});
	if (!result.success) {
		return {ok: false, reason: 'Invalid listMessages response.'};
	}
	return {ok: true, data: result.data};
}

/** GET /getMessageById — single KeyGen channel message. */
export async function getKeyGenMessageById(
	config: NodeSdkConfig,
	query: GetKeyGenMessageByIdQuery,
): Promise<SdkResult<z.infer<typeof KeyGenMessageSchema>>> {
	const parsed = GetKeyGenMessageByIdQuerySchema.safeParse(query);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid getMessageById query.'};
	}
	const keyGenId = parseKeyGenRequestId(parsed.data.keyGenId);
	if (!keyGenId.ok) {
		return keyGenId;
	}
	const path = buildManagementQueryPath('/getMessageById', {
		keyGenId: keyGenId.data,
		messageId: parsed.data.messageId.trim(),
	});
	const raw = await managementGet<unknown>(config, path);
	if (!raw.ok) {
		return {ok: false, reason: clarifyKeyGenLookupError(raw.reason)};
	}
	const message = parseKeyGenMessage(raw.data);
	if (!message) {
		return {ok: false, reason: 'Message not found or invalid response.'};
	}
	return {ok: true, data: message};
}

/** GET /getMessageThread — top-level message and nested replies (max depth 3). */
export async function getKeyGenMessageThread(
	config: NodeSdkConfig,
	query: GetKeyGenMessageThreadQuery,
): Promise<SdkResult<KeyGenMessageWithReplies>> {
	const parsed = GetKeyGenMessageThreadQuerySchema.safeParse(query);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid getMessageThread query.'};
	}
	const keyGenId = parseKeyGenRequestId(parsed.data.keyGenId);
	if (!keyGenId.ok) {
		return keyGenId;
	}
	const path = buildManagementQueryPath('/getMessageThread', {
		keyGenId: keyGenId.data,
		messageId: parsed.data.messageId.trim(),
	});
	const raw = await managementGet<unknown>(config, path);
	if (!raw.ok) {
		return {ok: false, reason: clarifyKeyGenLookupError(raw.reason)};
	}
	const thread = parseKeyGenMessageThread(raw.data);
	if (!thread) {
		return {ok: false, reason: 'Message thread not found or invalid response.'};
	}
	return {ok: true, data: thread};
}

export async function buildMarkKeyGenMessageRead(
	config: NodeSdkConfig,
	input: MarkKeyGenMessageReadInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = MarkKeyGenMessageReadInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.issues[0]?.message ?? 'Invalid mark read input.'};
	}
	const keyGenId = parseKeyGenRequestId(parsed.data.keyGenId);
	if (!keyGenId.ok) {
		return keyGenId;
	}
	return buildManagementPostRequest(
		config,
		{
			path: '/markMessageRead',
			buildRequestFields: () =>
				appendOptionalReadSignature(
					buildKeyGenMessageIdFields(keyGenId.data, parsed.data.messageId),
					parsed.data.signature,
				),
		},
		signing,
	);
}

/** POST /markMessageRead — add this node's read receipt (management-signed). */
export async function markKeyGenMessageRead(
	config: NodeSdkConfig,
	input: MarkKeyGenMessageReadInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<MarkKeyGenMessageReadOutput>> {
	const executed = await executeKeyGenMessagingSignedPost(
		config,
		await buildMarkKeyGenMessageRead(config, input, signing),
		signing,
		parseMarkMessageReadResponse,
		'Invalid markMessageRead response.',
	);
	if (!executed.ok) {
		return executed;
	}
	const output = MarkKeyGenMessageReadOutputSchema.safeParse({
		...executed.data.result,
		selectedSigningKey: executed.data.selectedSigningKey,
		signingMessage: executed.data.signingMessage,
	});
	if (!output.success) {
		return {ok: false, reason: 'Invalid markMessageRead response.'};
	}
	return {ok: true, data: output.data};
}

export async function buildMultiMarkKeyGenMessagesRead(
	config: NodeSdkConfig,
	input: MultiMarkKeyGenMessagesReadInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = MultiMarkKeyGenMessagesReadInputSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			reason: parsed.error.issues[0]?.message ?? 'Invalid multi mark read input.',
		};
	}
	const keyGenId = parseKeyGenRequestId(parsed.data.keyGenId);
	if (!keyGenId.ok) {
		return keyGenId;
	}
	return buildManagementPostRequest(
		config,
		{
			path: '/multiMarkMessagesRead',
			buildRequestFields: () =>
				appendOptionalReadSignature(
					buildKeyGenMessageIdsFields(keyGenId.data, parsed.data.messageIds),
					parsed.data.signature,
				),
		},
		signing,
	);
}

/** POST /multiMarkMessagesRead — batch mark messages read (management-signed). */
export async function multiMarkKeyGenMessagesRead(
	config: NodeSdkConfig,
	input: MultiMarkKeyGenMessagesReadInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<MultiMarkKeyGenMessagesReadOutput>> {
	const executed = await executeKeyGenMessagingSignedPost(
		config,
		await buildMultiMarkKeyGenMessagesRead(config, input, signing),
		signing,
		parseMultiMarkMessagesReadResponse,
		'Invalid multiMarkMessagesRead response.',
	);
	if (!executed.ok) {
		return executed;
	}
	const output = MultiMarkKeyGenMessagesReadOutputSchema.safeParse({
		...executed.data.result,
		selectedSigningKey: executed.data.selectedSigningKey,
		signingMessage: executed.data.signingMessage,
	});
	if (!output.success) {
		return {ok: false, reason: 'Invalid multiMarkMessagesRead response.'};
	}
	return {ok: true, data: output.data};
}

export async function buildDeleteKeyGenMessage(
	config: NodeSdkConfig,
	input: DeleteKeyGenMessageInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = DeleteKeyGenMessageInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.issues[0]?.message ?? 'Invalid delete message input.'};
	}
	const keyGenId = parseKeyGenRequestId(parsed.data.keyGenId);
	if (!keyGenId.ok) {
		return keyGenId;
	}
	return buildManagementPostRequest(
		config,
		{
			path: '/deleteMessage',
			buildRequestFields: () =>
				buildKeyGenMessageIdFields(keyGenId.data, parsed.data.messageId),
		},
		signing,
	);
}

/** POST /deleteMessage — soft-delete message and reply tree (originator only, management-signed). */
export async function deleteKeyGenMessage(
	config: NodeSdkConfig,
	input: DeleteKeyGenMessageInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<DeleteKeyGenMessageOutput>> {
	const executed = await executeKeyGenMessagingSignedPost(
		config,
		await buildDeleteKeyGenMessage(config, input, signing),
		signing,
		parseDeleteMessageResponse,
		'Invalid deleteMessage response.',
	);
	if (!executed.ok) {
		return executed;
	}
	const output = DeleteKeyGenMessageOutputSchema.safeParse({
		...executed.data.result,
		selectedSigningKey: executed.data.selectedSigningKey,
		signingMessage: executed.data.signingMessage,
	});
	if (!output.success) {
		return {ok: false, reason: 'Invalid deleteMessage response.'};
	}
	return {ok: true, data: output.data};
}

export async function buildMultiDeleteKeyGenMessages(
	config: NodeSdkConfig,
	input: MultiDeleteKeyGenMessagesInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = MultiDeleteKeyGenMessagesInputSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			reason: parsed.error.issues[0]?.message ?? 'Invalid multi delete messages input.',
		};
	}
	const keyGenId = parseKeyGenRequestId(parsed.data.keyGenId);
	if (!keyGenId.ok) {
		return keyGenId;
	}
	return buildManagementPostRequest(
		config,
		{
			path: '/multiDeleteMessages',
			buildRequestFields: () =>
				buildKeyGenMessageIdsFields(keyGenId.data, parsed.data.messageIds),
		},
		signing,
	);
}

/** POST /multiDeleteMessages — batch delete messages and reply trees (originator per id, management-signed). */
export async function multiDeleteKeyGenMessages(
	config: NodeSdkConfig,
	input: MultiDeleteKeyGenMessagesInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<MultiDeleteKeyGenMessagesOutput>> {
	const executed = await executeKeyGenMessagingSignedPost(
		config,
		await buildMultiDeleteKeyGenMessages(config, input, signing),
		signing,
		parseMultiDeleteMessagesResponse,
		'Invalid multiDeleteMessages response.',
	);
	if (!executed.ok) {
		return executed;
	}
	const output = MultiDeleteKeyGenMessagesOutputSchema.safeParse({
		...executed.data.result,
		selectedSigningKey: executed.data.selectedSigningKey,
		signingMessage: executed.data.signingMessage,
	});
	if (!output.success) {
		return {ok: false, reason: 'Invalid multiDeleteMessages response.'};
	}
	return {ok: true, data: output.data};
}
