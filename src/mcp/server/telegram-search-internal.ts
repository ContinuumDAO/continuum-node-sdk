import type {Express, Request, Response} from 'express';
import {
	runTelegramAuthScript,
	TELEGRAM_SEARCH_DEFAULT_SESSION_PATH,
	type TelegramAuthScriptResult,
} from '../../core/agent/telegram-search-auth.js';

type AuthRequestBody = {
	action?: string;
	phone?: string;
	code?: string;
	phoneCodeHash?: string;
	password?: string;
	apiId?: string;
	apiHash?: string;
	sessionPath?: string;
};

function sessionPathFromBody(body: AuthRequestBody): string {
	const raw = String(body.sessionPath ?? '').trim();
	return raw || TELEGRAM_SEARCH_DEFAULT_SESSION_PATH;
}

function credentialsFromBody(body: AuthRequestBody): {ok: true; data: {apiId: string; apiHash: string; sessionPath: string}} | {ok: false; error: string} {
	const apiId = String(body.apiId ?? '').trim();
	const apiHash = String(body.apiHash ?? '').trim();
	if (!apiId || !apiHash) {
		return {ok: false, error: 'apiId and apiHash are required'};
	}
	return {ok: true, data: {apiId, apiHash, sessionPath: sessionPathFromBody(body)}};
}

export function mountTelegramSearchInternalRoutes(app: Express): void {
	app.post('/internal/telegram-search/auth', (req: Request, res: Response) => {
		void (async () => {
			const body = (req.body ?? {}) as AuthRequestBody;
			const creds = credentialsFromBody(body);
			if (!creds.ok) {
				res.status(400).json({ok: false, error: 'INVALID_REQUEST', message: creds.error});
				return;
			}

			const action = String(body.action ?? '').trim();
			const payload: Record<string, unknown> = {action};
			if (action === 'send_code') {
				payload.phone = String(body.phone ?? '').trim();
			} else if (action === 'sign_in') {
				payload.phone = String(body.phone ?? '').trim();
				payload.code = String(body.code ?? '').trim();
				payload.phone_code_hash = String(body.phoneCodeHash ?? '').trim();
				const password = String(body.password ?? '').trim();
				if (password) {
					payload.password = password;
				}
			}

			const ran = await runTelegramAuthScript(payload, creds.data);
			if (!ran.ok) {
				res.status(502).json({ok: false, error: 'SCRIPT_FAILED', message: ran.reason});
				return;
			}
			const data: TelegramAuthScriptResult = ran.data;
			if (data.ok === false) {
				res.status(200).json(data);
				return;
			}
			res.status(200).json({ok: true, ...data});
		})().catch((err: unknown) => {
			const message = err instanceof Error ? err.message : String(err);
			res.status(500).json({ok: false, error: 'INTERNAL_ERROR', message});
		});
	});
}
