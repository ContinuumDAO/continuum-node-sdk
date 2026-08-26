import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../result.js';
import {getEnvironmentVariable} from './environment-variables.js';
import {
	channelUsernames,
	loadSocialSearchConfig,
	type SocialSearchConfig,
} from './social-search-config.js';
import {tickerDetectionForPython} from './ticker-extract.js';
import type {
	SearchTelegramMessagesInput,
	SearchTelegramMessagesResult,
	SearchTelegramTickersInput,
	SearchTelegramTickersResult,
} from '../../schemas/extended.js';

export const TELEGRAM_SEARCH_ENV = {
	apiId: 'TELEGRAM_API_ID',
	apiHash: 'TELEGRAM_API_HASH',
	sessionPath: 'TELEGRAM_SESSION_PATH',
	python: 'TELEGRAM_SEARCH_PYTHON',
} as const;

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

async function readEnvCredential(
	config: NodeSdkConfig,
	name: string,
): Promise<SdkResult<string>> {
	const fromProcess = process.env[name]?.trim();
	if (fromProcess) {
		return {ok: true, data: fromProcess};
	}
	const row = await getEnvironmentVariable(config, {name});
	if (!row.ok) {
		return {
			ok: false,
			reason: `Missing ${name}. Set Node Variable or process env for Telethon search.`,
		};
	}
	const value = row.data.value.trim();
	if (!value) {
		return {ok: false, reason: `${name} is empty.`};
	}
	return {ok: true, data: value};
}

async function telethonEnv(
	config: NodeSdkConfig,
): Promise<SdkResult<Record<string, string>>> {
	const apiId = await readEnvCredential(config, TELEGRAM_SEARCH_ENV.apiId);
	if (!apiId.ok) {
		return apiId;
	}
	const apiHash = await readEnvCredential(config, TELEGRAM_SEARCH_ENV.apiHash);
	if (!apiHash.ok) {
		return apiHash;
	}
	const sessionPath = await readEnvCredential(
		config,
		TELEGRAM_SEARCH_ENV.sessionPath,
	);
	if (!sessionPath.ok) {
		return sessionPath;
	}
	return {
		ok: true,
		data: {
			TELEGRAM_API_ID: apiId.data,
			TELEGRAM_API_HASH: apiHash.data,
			TELEGRAM_SESSION_PATH: sessionPath.data,
		},
	};
}

function runPythonScript(
	scriptName: string,
	payload: Record<string, unknown>,
	env: Record<string, string>,
): Promise<SdkResult<unknown[]>> {
	return new Promise((resolve) => {
		const scriptPath = path.join(scriptDir(), scriptName);
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
				reason: `Failed to start ${python} for Telegram search: ${err.message}`,
			});
		});
		child.on('close', (code) => {
			if (code !== 0) {
				const detail = stderr.trim() || stdout.trim() || `exit ${code}`;
				resolve({
					ok: false,
					reason: `Telegram search script failed: ${detail}`,
				});
				return;
			}
			try {
				const parsed = JSON.parse(stdout || '[]') as unknown;
				if (!Array.isArray(parsed)) {
					resolve({ok: false, reason: 'Telegram search returned non-array JSON.'});
					return;
				}
				resolve({ok: true, data: parsed});
			} catch {
				resolve({ok: false, reason: 'Telegram search returned invalid JSON.'});
			}
		});
		child.stdin.write(JSON.stringify(payload));
		child.stdin.end();
	});
}

function resolveChannels(
	inputChannels: string[] | undefined,
	cfg: SocialSearchConfig,
): string[] {
	if (inputChannels && inputChannels.length > 0) {
		return inputChannels.map((c) => c.trim().replace(/^@/, '')).filter(Boolean);
	}
	return channelUsernames(cfg);
}

function sortByPostedAtDesc<T extends {posted_at?: string | null}>(rows: T[]): T[] {
	return [...rows].sort((a, b) => (b.posted_at ?? '').localeCompare(a.posted_at ?? ''));
}

export async function searchTelegramMessages(
	config: NodeSdkConfig,
	input: SearchTelegramMessagesInput,
): Promise<SdkResult<SearchTelegramMessagesResult>> {
	const yamlConfig = await loadSocialSearchConfig(moduleUrl);
	const channels = resolveChannels(input.channels, yamlConfig);
	if (channels.length === 0) {
		return {ok: false, reason: 'No Telegram channels configured or provided.'};
	}

	const env = await telethonEnv(config);
	if (!env.ok) {
		return env;
	}

	const payload = {
		query: input.query,
		channels,
		max_results: input.maxResults ?? yamlConfig.defaults.maxResults,
		max_messages_per_channel:
			input.maxMessagesPerChannel ?? yamlConfig.telegram.maxMessagesPerChannel,
		regex: input.regex ?? false,
		...(input.since ? {since: input.since} : {}),
	};

	const ran = await runPythonScript('search_public_channels.py', payload, env.data);
	if (!ran.ok) {
		return ran;
	}

	const messages = sortByPostedAtDesc(ran.data as SearchTelegramMessagesResult['messages'])
		.slice(0, payload.max_results as number);

	return {ok: true, data: {messages}};
}

export async function searchTelegramTickers(
	config: NodeSdkConfig,
	input: SearchTelegramTickersInput,
): Promise<SdkResult<SearchTelegramTickersResult>> {
	const yamlConfig = await loadSocialSearchConfig(moduleUrl);
	const channels = resolveChannels(input.channels, yamlConfig);
	if (channels.length === 0) {
		return {ok: false, reason: 'No Telegram channels configured or provided.'};
	}

	const env = await telethonEnv(config);
	if (!env.ok) {
		return env;
	}

	const tickers =
		input.tickers !== undefined ? input.tickers : yamlConfig.tickers;

	const payload: Record<string, unknown> = {
		channels,
		tickers,
		ticker_detection: tickerDetectionForPython(yamlConfig.tickerDetection),
		max_results: input.maxResults ?? yamlConfig.defaults.maxResults,
		max_messages_per_channel:
			input.maxMessagesPerChannel ?? yamlConfig.telegram.maxMessagesPerChannel,
		...(input.since ? {since: input.since} : {}),
	};

	const ran = await runPythonScript('scan_tickers.py', payload, env.data);
	if (!ran.ok) {
		return ran;
	}

	const messages = sortByPostedAtDesc(
		ran.data as SearchTelegramTickersResult['messages'],
	).slice(0, payload.max_results as number);

	return {ok: true, data: {messages}};
}
