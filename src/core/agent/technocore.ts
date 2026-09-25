import {managementGet, managementPost} from '../../api/management-api.js';
import type {NodeSdkConfig} from '../../config/schema.js';
import {
	AGENT_TECHNOCORE_API_PATHS,
	AgentTechnocoreStatusSchema,
	DEFAULT_MANAGEMENT_SIGNING,
	TechnocoreAnnounceInputSchema,
	TechnocoreAnnounceResultSchema,
	TechnocoreReadRoomInputSchema,
	TechnocoreReadRoomResultSchema,
	TechnocoreSignInputSchema,
	TechnocoreSignResultSchema,
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

export type AgentTechnocoreStatus = z.infer<typeof AgentTechnocoreStatusSchema>;
export type TechnocoreAnnounceInput = z.infer<typeof TechnocoreAnnounceInputSchema>;
export type TechnocoreAnnounceResult = z.infer<typeof TechnocoreAnnounceResultSchema>;
export type TechnocoreSignInput = z.infer<typeof TechnocoreSignInputSchema>;
export type TechnocoreSignResult = z.infer<typeof TechnocoreSignResultSchema>;
export type TechnocoreReadRoomInput = z.infer<typeof TechnocoreReadRoomInputSchema>;
export type TechnocoreReadRoomResult = z.infer<typeof TechnocoreReadRoomResultSchema>;

const DEFAULT_ROOM = 'continuum-mpa';

/** Canonical JSON must match mpc-auth marshalAgentTechnocoreAnnounceSignBody field order. */
export function agentTechnocoreAnnounceMessageToSign(
	nonce: number,
	nodeKey: string,
	text: string,
	room?: string,
): string {
	const body: Record<string, unknown> = {
		action: 'agentTechnocoreAnnounce',
		clientSig: '',
		nonce,
		nodeKey,
	};
	const trimmedRoom = room?.trim();
	if (trimmedRoom) {
		body.room = trimmedRoom;
	}
	body.text = text;
	return JSON.stringify(body);
}

/** Canonical JSON must match mpc-auth marshalAgentTechnocoreSignSignBody field order. */
export function agentTechnocoreSignMessageToSign(
	nonce: number,
	nodeKey: string,
	payload: string,
): string {
	return JSON.stringify({
		action: 'agentTechnocoreSign',
		clientSig: '',
		nonce,
		nodeKey,
		payload,
	});
}

export async function getAgentTechnocoreStatus(
	config: NodeSdkConfig,
): Promise<SdkResult<AgentTechnocoreStatus>> {
	const result = await managementGet<unknown>(
		config,
		AGENT_TECHNOCORE_API_PATHS.status,
	);
	if (!result.ok) {
		return result;
	}
	const data =
		result.data && typeof result.data === 'object' && !Array.isArray(result.data)
			? (result.data as Record<string, unknown>)
			: {};
	const parsed = AgentTechnocoreStatusSchema.safeParse({
		did: String(data.did ?? data.DID ?? '').trim(),
		room: String(data.room ?? data.Room ?? DEFAULT_ROOM).trim() || DEFAULT_ROOM,
		posting: Boolean(data.posting ?? data.Posting),
		keyPresent: Boolean(data.keyPresent ?? data.KeyPresent),
		keyMasked: String(data.keyMasked ?? data.KeyMasked ?? '').trim(),
		updatedAt: String(data.updatedAt ?? data.UpdatedAt ?? '').trim(),
	});
	if (!parsed.success) {
		return {ok: false, reason: 'Technocore status response failed validation.'};
	}
	return {ok: true, data: parsed.data};
}

export async function buildTechnocoreAnnounce(
	config: NodeSdkConfig,
	input: TechnocoreAnnounceInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = TechnocoreAnnounceInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid Technocore announce input.'};
	}
	return buildManagementPostRequest(
		config,
		{
			path: AGENT_TECHNOCORE_API_PATHS.announce,
			buildRequestFields: () => {
				const fields: Record<string, unknown> = {text: parsed.data.text};
				if (parsed.data.room) {
					fields.room = parsed.data.room;
				}
				return fields;
			},
		},
		signing,
	);
}

/** POST /agentTechnocoreAnnounce — node signs with the stored Ed25519 key. Never returns the private key. */
export async function announceTechnocore(
	config: NodeSdkConfig,
	input: TechnocoreAnnounceInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		result: TechnocoreAnnounceResult;
		selectedSigningKey?: ReturnType<typeof toSelectedSigner>;
		signingMessage: string;
	}>
> {
	const built = await buildTechnocoreAnnounce(config, input, signing);
	if (!built.ok) {
		return built;
	}
	const nonce = Number(built.data.unsignedBody.nonce);
	const nodeKey = String(built.data.unsignedBody.nodeKey ?? '');
	const text = String(built.data.unsignedBody.text ?? '');
	const room = String(built.data.unsignedBody.room ?? '').trim();
	const messageToSign = agentTechnocoreAnnounceMessageToSign(
		nonce,
		nodeKey,
		text,
		room || undefined,
	);
	const signed = await managementSign(config, signing, built.data.unsignedBody, {
		messageToSign,
	});
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
	const parsed = TechnocoreAnnounceResultSchema.safeParse({
		did: String(data.did ?? data.DID ?? '').trim(),
		room: String(data.room ?? data.Room ?? '').trim(),
		status: Number(data.status ?? data.Status ?? 0),
		body: String(data.body ?? data.Body ?? ''),
	});
	if (!parsed.success) {
		return {ok: false, reason: 'Technocore announce response failed validation.'};
	}
	return {
		ok: true,
		data: {
			result: parsed.data,
			selectedSigningKey: built.data.selectedSigningKey
				? toSelectedSigner(built.data.selectedSigningKey)
				: undefined,
			signingMessage: messageToSign,
		},
	};
}

export async function buildTechnocoreSign(
	config: NodeSdkConfig,
	input: TechnocoreSignInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = TechnocoreSignInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid Technocore sign input.'};
	}
	return buildManagementPostRequest(
		config,
		{
			path: AGENT_TECHNOCORE_API_PATHS.sign,
			buildRequestFields: () => ({payload: parsed.data.payload}),
		},
		signing,
	);
}

/** POST /agentTechnocoreSign — detached signature. Never returns the private key. Does not post. */
export async function signTechnocore(
	config: NodeSdkConfig,
	input: TechnocoreSignInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		result: TechnocoreSignResult;
		selectedSigningKey?: ReturnType<typeof toSelectedSigner>;
		signingMessage: string;
	}>
> {
	const built = await buildTechnocoreSign(config, input, signing);
	if (!built.ok) {
		return built;
	}
	const nonce = Number(built.data.unsignedBody.nonce);
	const nodeKey = String(built.data.unsignedBody.nodeKey ?? '');
	const payload = String(built.data.unsignedBody.payload ?? '');
	const messageToSign = agentTechnocoreSignMessageToSign(nonce, nodeKey, payload);
	const signed = await managementSign(config, signing, built.data.unsignedBody, {
		messageToSign,
	});
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
	const parsed = TechnocoreSignResultSchema.safeParse({
		did: String(data.did ?? data.DID ?? '').trim(),
		signature: String(data.signature ?? data.Signature ?? '').trim(),
	});
	if (!parsed.success) {
		return {ok: false, reason: 'Technocore sign response failed validation.'};
	}
	return {
		ok: true,
		data: {
			result: parsed.data,
			selectedSigningKey: built.data.selectedSigningKey
				? toSelectedSigner(built.data.selectedSigningKey)
				: undefined,
			signingMessage: messageToSign,
		},
	};
}

/** Public Technocore room read. No node key; never requests the private key. */
export async function readTechnocoreRoom(
	input: TechnocoreReadRoomInput = {},
): Promise<SdkResult<TechnocoreReadRoomResult>> {
	const parsed = TechnocoreReadRoomInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid Technocore room input.'};
	}
	const room = (parsed.data.room ?? DEFAULT_ROOM).replace(/[^a-zA-Z0-9._-]/g, '');
	if (!room) {
		return {ok: false, reason: 'room is required.'};
	}
	try {
		const response = await fetch(`https://technocore.chat/r/${room}`, {
			headers: {accept: 'application/json, text/plain;q=0.9'},
		});
		const body = await response.text();
		const result = TechnocoreReadRoomResultSchema.safeParse({
			room,
			status: response.status,
			body: body.slice(0, 32_768),
		});
		if (!result.success) {
			return {ok: false, reason: 'Technocore room response failed validation.'};
		}
		return {ok: true, data: result.data};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {ok: false, reason: message};
	}
}
