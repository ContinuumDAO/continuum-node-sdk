import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {tickerDetectionFromYaml, type TickerDetectionConfig} from './ticker-extract.js';

export type TelegramChannelEntry = {
	username: string;
	category?: string;
	notes?: string;
};

export type TelegramChannelsDefaults = {
	maxResults: number;
	maxMessagesPerChannel: number;
};

export type TelegramChannelsConfig = {
	defaults: TelegramChannelsDefaults;
	tickers: string[];
	tickerDetection: TickerDetectionConfig;
	channels: TelegramChannelEntry[];
};

const DEFAULTS: TelegramChannelsDefaults = {
	maxResults: 50,
	maxMessagesPerChannel: 500,
};

function packageRootFromModule(moduleUrl: string): string {
	return path.resolve(path.dirname(fileURLToPath(moduleUrl)), '../../..');
}

export function resolveTelegramChannelsYamlPath(moduleUrl: string): string {
	return path.join(
		packageRootFromModule(moduleUrl),
		'dist',
		'mcp',
		'resources',
		'telegram-channels.yaml',
	);
}

/** Minimal YAML parser for telegram-channels.yaml (no external deps). */
export function parseTelegramChannelsYaml(text: string): TelegramChannelsConfig {
	const lines = text.split(/\r?\n/);
	let section = '';
	const defaults: Record<string, number> = {};
	const tickers: string[] = [];
	const exclude: string[] = [];
	const channels: TelegramChannelEntry[] = [];
	const detection: Record<string, unknown> = {exclude};

	let currentChannel: TelegramChannelEntry | null = null;

	const setDetection = (key: string, raw: string) => {
		if (key === 'min_length' || key === 'max_length') {
			detection[key] = Number(raw);
			return;
		}
		if (key === 'include_bare_caps') {
			detection[key] = raw === 'true';
		}
	};

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) {
			continue;
		}

		if (trimmed === 'defaults:') {
			section = 'defaults';
			currentChannel = null;
			continue;
		}
		if (trimmed === 'tickers:') {
			section = 'tickers';
			currentChannel = null;
			continue;
		}
		if (trimmed === 'ticker_detection:') {
			section = 'ticker_detection';
			currentChannel = null;
			continue;
		}
		if (trimmed === 'channels:') {
			section = 'channels';
			currentChannel = null;
			continue;
		}
		if (trimmed === 'exclude:') {
			section = 'exclude';
			continue;
		}

		const listMatch = trimmed.match(/^- (.+)$/);
		if (listMatch) {
			const value = listMatch[1]!.trim();
			if (section === 'tickers') {
				tickers.push(value);
			} else if (section === 'exclude') {
				exclude.push(value);
			} else if (section === 'channels') {
				if (value.startsWith('username:')) {
					currentChannel = {username: value.slice('username:'.length).trim()};
					channels.push(currentChannel);
				} else if (currentChannel && value.startsWith('category:')) {
					currentChannel.category = value.slice('category:'.length).trim();
				} else if (currentChannel && value.startsWith('notes:')) {
					currentChannel.notes = value.slice('notes:'.length).trim();
				}
			}
			continue;
		}

		const kv = trimmed.match(/^([a-z_]+):\s*(.*)$/);
		if (!kv) {
			continue;
		}
		const key = kv[1]!;
		const value = kv[2]!.trim();
		if (section === 'defaults') {
			if (key === 'max_results') {
				defaults.maxResults = Number(value);
			} else if (key === 'max_messages_per_channel') {
				defaults.maxMessagesPerChannel = Number(value);
			}
		} else if (section === 'ticker_detection') {
			setDetection(key, value);
		} else if (section === 'channels' && key === 'username') {
			currentChannel = {username: value};
			channels.push(currentChannel);
		} else if (currentChannel && section === 'channels') {
			if (key === 'category') {
				currentChannel.category = value;
			} else if (key === 'notes') {
				currentChannel.notes = value;
			}
		}
	}

	detection.exclude = exclude;

	return {
		defaults: {
			maxResults: defaults.maxResults ?? DEFAULTS.maxResults,
			maxMessagesPerChannel:
				defaults.maxMessagesPerChannel ?? DEFAULTS.maxMessagesPerChannel,
		},
		tickers,
		tickerDetection: tickerDetectionFromYaml(detection),
		channels,
	};
}

let cachedConfig: TelegramChannelsConfig | null = null;

export async function loadTelegramChannelsConfig(
	moduleUrl: string,
): Promise<TelegramChannelsConfig> {
	if (cachedConfig) {
		return cachedConfig;
	}
	const filePath = resolveTelegramChannelsYamlPath(moduleUrl);
	const text = await fs.readFile(filePath, 'utf8');
	cachedConfig = parseTelegramChannelsYaml(text);
	return cachedConfig;
}

export function channelUsernames(config: TelegramChannelsConfig): string[] {
	return config.channels
		.map((c) => c.username.trim().replace(/^@/, ''))
		.filter(Boolean);
}

/** Reset cached config (tests). */
export function resetTelegramChannelsConfigCache(): void {
	cachedConfig = null;
}
