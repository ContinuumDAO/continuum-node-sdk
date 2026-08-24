import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {SdkResult} from '../result.js';
import {TELEGRAM_SEARCH_ENV} from './telegram-search.js';

export const TELEGRAM_SEARCH_DEFAULT_SESSION_PATH =
	'/app/user_folder/data/telegram/continuum_search';

const moduleUrl = import.meta.url;

function packageRoot(): string {
	return path.resolve(path.dirname(fileURLToPath(moduleUrl)), '../../..');
}

function scriptDir(): string {
	return path.join(packageRoot(), 'scripts', 'telegram-search');
}

function resolvePythonExecutable(): string {
	return process.env[TELEGRAM_SEARCH_ENV.python]?.trim() || 'python3';
}

export type TelegramAuthScriptResult = {
	ok?: boolean;
	already_authorized?: boolean;
	phone_code_hash?: string;
	needs_password?: boolean;
	authorized?: boolean;
	username?: string;
	user_id?: number;
	first_name?: string;
	error?: string;
	message?: string;
};

function runAuthScript(
	payload: Record<string, unknown>,
	env: Record<string, string>,
): Promise<SdkResult<TelegramAuthScriptResult>> {
	return new Promise((resolve) => {
		const scriptPath = path.join(scriptDir(), 'auth_telegram.py');
		const python = resolvePythonExecutable();
		const child = spawn(python, [scriptPath], {
			env: {...process.env, ...env},
			stdio: ['pipe', 'pipe', 'pipe'],
		});

		let stdout = '';
		let stderr = '';
		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');
		child.stdout.on('data', (chunk: string) => {
			stdout += chunk;
		});
		child.stderr.on('data', (chunk: string) => {
			stderr += chunk;
		});
		child.on('error', (err) => {
			resolve({
				ok: false,
				reason: `Failed to start ${python} for Telegram auth: ${err.message}`,
			});
		});
		child.on('close', (code) => {
			if (code !== 0) {
				const detail = stderr.trim() || stdout.trim() || `exit ${code}`;
				resolve({ok: false, reason: `Telegram auth script failed: ${detail}`});
				return;
			}
			try {
				const parsed = JSON.parse(stdout || '{}') as TelegramAuthScriptResult;
				if (!parsed || typeof parsed !== 'object') {
					resolve({ok: false, reason: 'Telegram auth returned invalid JSON.'});
					return;
				}
				resolve({ok: true, data: parsed});
			} catch {
				resolve({ok: false, reason: 'Telegram auth returned invalid JSON.'});
			}
		});
		child.stdin.write(JSON.stringify(payload));
		child.stdin.end();
	});
}

export function ensureTelegramSessionDir(sessionPath: string): SdkResult<string> {
	const dir = path.dirname(sessionPath);
	try {
		fs.mkdirSync(dir, {recursive: true, mode: 0o700});
		return {ok: true, data: sessionPath};
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return {ok: false, reason: `Failed to create session directory ${dir}: ${msg}`};
	}
}

export async function runTelegramAuthScript(
	payload: Record<string, unknown>,
	credentials: {apiId: string; apiHash: string; sessionPath: string},
): Promise<SdkResult<TelegramAuthScriptResult>> {
	const dir = ensureTelegramSessionDir(credentials.sessionPath);
	if (!dir.ok) {
		return dir;
	}
	return runAuthScript(
		{...payload, session_path: credentials.sessionPath},
		{
			TELEGRAM_API_ID: credentials.apiId,
			TELEGRAM_API_HASH: credentials.apiHash,
			TELEGRAM_SESSION_PATH: credentials.sessionPath,
		},
	);
}
