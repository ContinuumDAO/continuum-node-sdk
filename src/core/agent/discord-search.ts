import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../result.js';
import {getEnvironmentVariable} from './environment-variables.js';
import {
	type DiscordSearchTarget,
	type SocialSearchConfig,
	listDiscordSearchTargets,
	loadSocialSearchConfig,
} from './social-search-config.js';
import {
	DiscordRestClient,
	type DiscordMessage,
	fetchChannelHistory,
	searchGuildMessagesPaginated,
} from './discord-rest-client.js';
import {findTickersInMessage} from './ticker-extract.js';
import type {
	SearchDiscordMessagesInput,
	SearchDiscordMessagesResult,
	SearchDiscordTickersInput,
	SearchDiscordTickersResult,
} from '../../schemas/extended.js';

export const DISCORD_SEARCH_ENV = {
	botToken: 'DISCORD_BOT_TOKEN',
	applicationId: 'DISCORD_APPLICATION_ID',
} as const;

const moduleUrl = import.meta.url;

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
			reason: `Missing ${name}. Set Node Variable or process env for Discord search.`,
		};
	}
	const value = row.data.value.trim();
	if (!value) {
		return {ok: false, reason: `${name} is empty.`};
	}
	return {ok: true, data: value};
}

async function discordBotToken(config: NodeSdkConfig): Promise<SdkResult<string>> {
	return readEnvCredential(config, DISCORD_SEARCH_ENV.botToken);
}

function parseSince(raw: string | undefined): Date | null {
	if (!raw) {
		return null;
	}
	let text = raw.trim();
	if (text.endsWith('Z')) {
		text = `${text.slice(0, -1)}+00:00`;
	}
	const dt = new Date(text);
	if (Number.isNaN(dt.getTime())) {
		return null;
	}
	return dt;
}

function messagePostedAt(message: DiscordMessage): string | null {
	return message.timestamp ?? null;
}

function isBeforeSince(message: DiscordMessage, since: Date | null): boolean {
	if (!since) {
		return false;
	}
	const posted = messagePostedAt(message);
	if (!posted) {
		return false;
	}
	return new Date(posted).getTime() < since.getTime();
}

function resolveSearchTargets(
	inputGuildIds: string[] | undefined,
	inputChannelIds: string[] | undefined,
	cfg: SocialSearchConfig,
): DiscordSearchTarget[] {
	const all = listDiscordSearchTargets(cfg);
	if ((!inputGuildIds || inputGuildIds.length === 0) && (!inputChannelIds || inputChannelIds.length === 0)) {
		return all;
	}

	const guildSet =
		inputGuildIds && inputGuildIds.length > 0
			? new Set(inputGuildIds.map((id) => id.trim()).filter(Boolean))
			: null;
	const channelSet =
		inputChannelIds && inputChannelIds.length > 0
			? new Set(inputChannelIds.map((id) => id.trim()).filter(Boolean))
			: null;

	return all.filter((target) => {
		if (guildSet && !guildSet.has(target.guildId)) {
			return false;
		}
		if (channelSet && !channelSet.has(target.channelId)) {
			return false;
		}
		return true;
	});
}

function normalizeSearchMessage(
	message: DiscordMessage,
	target: DiscordSearchTarget,
): SearchDiscordMessagesResult['messages'][number] {
	const guildId = target.guildId;
	const channelId = message.channel_id || target.channelId;
	const messageId = message.id;
	return {
		guild_id: guildId,
		guild_name: target.guildName ?? null,
		channel_id: channelId,
		channel_name: target.channelName ?? null,
		message_id: messageId,
		content: message.content ?? '',
		author_id: message.author?.id ?? null,
		author_username: message.author?.username ?? null,
		posted_at: messagePostedAt(message),
		url: `https://discord.com/channels/${guildId}/${channelId}/${messageId}`,
		mention_user_ids: message.mentions?.map((user) => user.id) ?? [],
	};
}

function sortByPostedAtDesc<T extends {posted_at?: string | null}>(rows: T[]): T[] {
	return [...rows].sort((a, b) => (b.posted_at ?? '').localeCompare(a.posted_at ?? ''));
}

function matchesRegexQuery(text: string, query: string): boolean {
	if (!text) {
		return false;
	}
	try {
		return new RegExp(query, 'i').test(text);
	} catch {
		return false;
	}
}

function groupTargetsByGuild(
	targets: DiscordSearchTarget[],
): Map<string, DiscordSearchTarget[]> {
	const byGuild = new Map<string, DiscordSearchTarget[]>();
	for (const target of targets) {
		const list = byGuild.get(target.guildId) ?? [];
		list.push(target);
		byGuild.set(target.guildId, list);
	}
	return byGuild;
}

async function searchViaGuildApi(
	client: DiscordRestClient,
	targets: DiscordSearchTarget[],
	options: {
		query?: string;
		mentionUserId?: string;
		maxResults: number;
		includeNsfw: boolean;
		since: Date | null;
	},
): Promise<SdkResult<SearchDiscordMessagesResult['messages']>> {
	const byGuild = groupTargetsByGuild(targets);
	const collected: SearchDiscordMessagesResult['messages'] = [];
	const seen = new Set<string>();

	for (const [guildId, guildTargets] of byGuild) {
		if (collected.length >= options.maxResults) {
			break;
		}
		const channelIds = guildTargets.map((t) => t.channelId);
		const channelMeta = new Map(guildTargets.map((t) => [t.channelId, t]));
		const remaining = options.maxResults - collected.length;

		const searchParams: {
			content?: string;
			mentions?: string[];
			channelIds: string[];
			includeNsfw: boolean;
			maxResults: number;
		} = {
			channelIds,
			includeNsfw: options.includeNsfw,
			maxResults: remaining,
		};
		if (options.query) {
			searchParams.content = options.query;
		}
		if (options.mentionUserId) {
			searchParams.mentions = [options.mentionUserId];
		}

		const page = await searchGuildMessagesPaginated(client, guildId, searchParams);
		if (!page.ok) {
			return page;
		}

		for (const message of page.messages) {
			if (options.since && isBeforeSince(message, options.since)) {
				continue;
			}
			const target = channelMeta.get(message.channel_id) ?? guildTargets[0]!;
			const key = `${target.guildId}:${message.id}`;
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			collected.push(normalizeSearchMessage(message, target));
		}
	}

	return {ok: true, data: sortByPostedAtDesc(collected).slice(0, options.maxResults)};
}

async function searchViaChannelHistory(
	client: DiscordRestClient,
	targets: DiscordSearchTarget[],
	options: {
		query: string;
		regex: boolean;
		maxMessagesPerChannel: number;
		maxResults: number;
		since: Date | null;
	},
): Promise<SdkResult<SearchDiscordMessagesResult['messages']>> {
	const collected: SearchDiscordMessagesResult['messages'] = [];

	for (const target of targets) {
		if (collected.length >= options.maxResults) {
			break;
		}
		const history = await fetchChannelHistory(
			client,
			target.channelId,
			options.maxMessagesPerChannel,
		);
		if (!history.ok) {
			return history;
		}

		for (const message of history.messages) {
			if (options.since && isBeforeSince(message, options.since)) {
				continue;
			}
			const content = message.content ?? '';
			const matches = options.regex
				? matchesRegexQuery(content, options.query)
				: content.toLowerCase().includes(options.query.toLowerCase());
			if (!matches) {
				continue;
			}
			collected.push(normalizeSearchMessage(message, target));
			if (collected.length >= options.maxResults) {
				break;
			}
		}
	}

	return {ok: true, data: sortByPostedAtDesc(collected).slice(0, options.maxResults)};
}

export async function searchDiscordMessages(
	config: NodeSdkConfig,
	input: SearchDiscordMessagesInput,
): Promise<SdkResult<SearchDiscordMessagesResult>> {
	const yamlConfig = await loadSocialSearchConfig(moduleUrl);
	const targets = resolveSearchTargets(input.guilds, input.channels, yamlConfig);
	if (targets.length === 0) {
		return {ok: false, reason: 'No Discord guild channels configured or provided.'};
	}

	const token = await discordBotToken(config);
	if (!token.ok) {
		return token;
	}

	const mentionUserId =
		input.mentionUserId?.trim() || yamlConfig.discord.mentionUserId.trim() || undefined;
	const query = input.query?.trim() || undefined;
	if (!query && !mentionUserId) {
		return {ok: false, reason: 'Provide query and/or mentionUserId for Discord message search.'};
	}

	const maxResults = input.maxResults ?? yamlConfig.defaults.maxResults;
	const maxMessagesPerChannel =
		input.maxMessagesPerChannel ?? yamlConfig.discord.maxMessagesPerChannel;
	const includeNsfw = input.includeNsfw ?? yamlConfig.discord.includeNsfw;
	const since = parseSince(input.since);
	const regex = input.regex ?? false;
	const client = new DiscordRestClient({token: token.data});

	let rows: SdkResult<SearchDiscordMessagesResult['messages']>;
	if (regex && query) {
		rows = await searchViaChannelHistory(client, targets, {
			query,
			regex: true,
			maxMessagesPerChannel,
			maxResults,
			since,
		});
	} else {
		rows = await searchViaGuildApi(client, targets, {
			query,
			mentionUserId,
			maxResults,
			includeNsfw,
			since,
		});
	}

	if (!rows.ok) {
		return rows;
	}

	return {ok: true, data: {messages: rows.data}};
}

export async function searchDiscordTickers(
	config: NodeSdkConfig,
	input: SearchDiscordTickersInput,
): Promise<SdkResult<SearchDiscordTickersResult>> {
	const yamlConfig = await loadSocialSearchConfig(moduleUrl);
	const targets = resolveSearchTargets(input.guilds, input.channels, yamlConfig);
	if (targets.length === 0) {
		return {ok: false, reason: 'No Discord guild channels configured or provided.'};
	}

	const token = await discordBotToken(config);
	if (!token.ok) {
		return token;
	}

	const tickers = input.tickers !== undefined ? input.tickers : yamlConfig.tickers;
	const allowlist = tickers.length > 0 ? tickers : null;
	const maxResults = input.maxResults ?? yamlConfig.defaults.maxResults;
	const maxMessagesPerChannel =
		input.maxMessagesPerChannel ?? yamlConfig.discord.maxMessagesPerChannel;
	const since = parseSince(input.since);
	const client = new DiscordRestClient({token: token.data});

	const collected: SearchDiscordTickersResult['messages'] = [];

	for (const target of targets) {
		if (collected.length >= maxResults) {
			break;
		}
		const history = await fetchChannelHistory(client, target.channelId, maxMessagesPerChannel);
		if (!history.ok) {
			return history;
		}

		for (const message of history.messages) {
			if (since && isBeforeSince(message, since)) {
				continue;
			}
			const content = message.content ?? '';
			if (!content.trim()) {
				continue;
			}
			const matched = findTickersInMessage(content, allowlist, yamlConfig.tickerDetection);
			if (matched.length === 0) {
				continue;
			}
			collected.push({
				...normalizeSearchMessage(message, target),
				matched_tickers: matched,
			});
			if (collected.length >= maxResults) {
				break;
			}
		}
	}

	const messages = sortByPostedAtDesc(collected).slice(0, maxResults);
	return {ok: true, data: {messages}};
}

/** Test helper — resolve targets without loading YAML from disk. */
export function resolveDiscordSearchTargetsForTest(
	inputGuildIds: string[] | undefined,
	inputChannelIds: string[] | undefined,
	cfg: SocialSearchConfig,
): DiscordSearchTarget[] {
	return resolveSearchTargets(inputGuildIds, inputChannelIds, cfg);
}

/** Test helper — normalize a Discord API message row. */
export function normalizeDiscordSearchMessageForTest(
	message: DiscordMessage,
	target: DiscordSearchTarget,
): SearchDiscordMessagesResult['messages'][number] {
	return normalizeSearchMessage(message, target);
}
