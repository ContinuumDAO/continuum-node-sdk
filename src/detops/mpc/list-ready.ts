import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../result.js';
import {ListReadyInputSchema, WaitReadyInputSchema} from './schemas.js';
import {mpcGetSignRequestById, mpcListSignRequestsReady} from './client.js';

export async function listSignRequestsReady(
	config: NodeSdkConfig,
	input: unknown = {},
): Promise<SdkResult<{requests: unknown[]}>> {
	const parsed = ListReadyInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid list ready input.'};
	}
	const raw = await mpcListSignRequestsReady(config, parsed.data);
	if (!raw.ok) return raw;
	return {ok: true, data: {requests: raw.data}};
}

export async function waitForSignRequestReady(
	config: NodeSdkConfig,
	input: unknown,
): Promise<SdkResult<{ready: boolean; detail?: unknown}>> {
	const parsed = WaitReadyInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid wait ready input.'};
	}
	const pollMs = parsed.data.pollMs ?? 5000;
	const timeoutMs = parsed.data.timeoutMs ?? 120_000;
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		const list = await mpcListSignRequestsReady(config);
		if (list.ok) {
			const found = list.data.find(row => {
				if (!row || typeof row !== 'object') return false;
				const r = row as Record<string, unknown>;
				const id = String(
					r.requestid ?? r.RequestId ?? r.requestId ?? '',
				).trim();
				return id === parsed.data.requestId;
			});
			if (found) {
				return {ok: true, data: {ready: true, detail: found}};
			}
		}
		const detail = await mpcGetSignRequestById(config, parsed.data.requestId);
		if (detail.ok) {
			const st = String(
				(detail.data as Record<string, unknown>).status ??
					(detail.data as Record<string, unknown>).Status ??
					'',
			).toLowerCase();
			if (st === 'success' || st === 'ready') {
				return {ok: true, data: {ready: true, detail: detail.data}};
			}
		}
		await new Promise(r => setTimeout(r, pollMs));
	}
	return {ok: true, data: {ready: false}};
}
