import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {tickerDetectionFromYaml, type TickerDetectionConfig} from './ticker-extract.js';

export type SocialSearchDefaults = {
	maxResults: number;
};

export type TelegramChannelEntry = {
	username: string;
	category?: string;
	notes?: string;
};

export type TelegramPlatformConfig = {
	maxMessagesPerChannel: number;
	channels: TelegramChannelEntry[];
};

export type DiscordChannelEntry = {
	channelId: string;
	name?: string;
};

export type DiscordGuildEntry = {
	guildId: string;
	name?: string;
	channels: DiscordChannelEntry[];
};

export type DiscordPlatformConfig = {
	maxMessagesPerChannel: number;
	mentionUserId: string;
	includeNsfw: boolean;
	guilds: DiscordGuildEntry[];
};

export type RedditSort = 'new' | 'top';

export type RedditSubredditEntry = {
	name: string;
	category?: string;
	sort?: RedditSort;
	timeFilter?: string;
};

export type RedditCommentsConfig = {
	includeOnSearch: boolean;
	maxPerPost: number;
	maxPerThread: number;
	maxDepth: number;
	sort: 'top' | 'best' | 'new';
	replaceMoreLimit: number;
};

export type RedditPlatformConfig = {
	maxPostsPerSubreddit: number;
	sort: RedditSort;
	timeFilter: string;
	subreddits: RedditSubredditEntry[];
	comments: RedditCommentsConfig;
};

export type SocialSearchConfig = {
	defaults: SocialSearchDefaults;
	tickers: string[];
	tickerDetection: TickerDetectionConfig;
	telegram: TelegramPlatformConfig;
	discord: DiscordPlatformConfig;
	reddit: RedditPlatformConfig;
};

export type DiscordSearchTarget = {
	guildId: string;
	guildName?: string;
	channelId: string;
	channelName?: string;
};

const DEFAULT_MAX_RESULTS = 50;
const DEFAULT_TELEGRAM_MAX_MESSAGES = 500;
const DEFAULT_DISCORD_MAX_MESSAGES = 500;
const DEFAULT_REDDIT_MAX_POSTS = 100;

const DEFAULT_REDDIT_COMMENTS: RedditCommentsConfig = {
	includeOnSearch: false,
	maxPerPost: 10,
	maxPerThread: 200,
	maxDepth: 3,
	sort: 'top',
	replaceMoreLimit: 0,
};

function stripYamlScalar(raw: string): string {
	return raw.trim().replace(/^["']|["']$/g, '');
}

function packageRootFromModule(moduleUrl: string): string {
	return path.resolve(path.dirname(fileURLToPath(moduleUrl)), '../../..');
}

export function resolveSocialSearchYamlPath(moduleUrl: string): string {
	return path.join(
		packageRootFromModule(moduleUrl),
		'dist',
		'mcp',
		'resources',
		'social-search.yaml',
	);
}

export function resolveLegacyTelegramChannelsYamlPath(moduleUrl: string): string {
	return path.join(
		packageRootFromModule(moduleUrl),
		'dist',
		'mcp',
		'resources',
		'telegram-channels.yaml',
	);
}

/** Minimal YAML parser for social-search.yaml (no external deps). */
export function parseSocialSearchYaml(text: string): SocialSearchConfig {
	const lines = text.split(/\r?\n/);
	let section = '';
	let platformSection = '';
	let subSection = '';

	const defaults: Record<string, number> = {};
	const tickers: string[] = [];
	const exclude: string[] = [];
	const detection: Record<string, unknown> = {exclude};

	const telegramChannels: TelegramChannelEntry[] = [];
	let telegramMaxMessages = DEFAULT_TELEGRAM_MAX_MESSAGES;

	const discordGuilds: DiscordGuildEntry[] = [];
	let discordMaxMessages = DEFAULT_DISCORD_MAX_MESSAGES;
	let discordMentionUserId = '';
	let discordIncludeNsfw = false;

	const redditSubreddits: RedditSubredditEntry[] = [];
	let redditMaxPosts = DEFAULT_REDDIT_MAX_POSTS;
	let redditSort: RedditSort = 'new';
	let redditTimeFilter = 'month';
	const redditComments: Partial<RedditCommentsConfig> = {};

	let currentTelegramChannel: TelegramChannelEntry | null = null;
	let currentDiscordGuild: DiscordGuildEntry | null = null;
	let currentDiscordChannel: DiscordChannelEntry | null = null;
	let currentRedditSubreddit: RedditSubredditEntry | null = null;

	const setDetection = (key: string, raw: string) => {
		if (key === 'min_length' || key === 'max_length') {
			detection[key] = Number(raw);
			return;
		}
		if (key === 'include_bare_caps') {
			detection[key] = raw === 'true';
		}
	};

	const setRedditComment = (key: string, raw: string) => {
		if (key === 'include_on_search') {
			redditComments.includeOnSearch = raw === 'true';
		} else if (key === 'max_per_post') {
			redditComments.maxPerPost = Number(raw);
		} else if (key === 'max_per_thread') {
			redditComments.maxPerThread = Number(raw);
		} else if (key === 'max_depth') {
			redditComments.maxDepth = Number(raw);
		} else if (key === 'sort') {
			redditComments.sort = raw as RedditCommentsConfig['sort'];
		} else if (key === 'replace_more_limit') {
			redditComments.replaceMoreLimit = Number(raw);
		}
	};

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) {
			continue;
		}

		if (trimmed === 'defaults:') {
			section = 'defaults';
			platformSection = '';
			subSection = '';
			continue;
		}
		if (trimmed === 'tickers:') {
			section = 'tickers';
			platformSection = '';
			subSection = '';
			continue;
		}
		if (trimmed === 'ticker_detection:') {
			section = 'ticker_detection';
			platformSection = '';
			subSection = '';
			continue;
		}
		if (trimmed === 'telegram:') {
			section = 'telegram';
			platformSection = '';
			subSection = '';
			continue;
		}
		if (trimmed === 'discord:') {
			section = 'discord';
			platformSection = '';
			subSection = '';
			continue;
		}
		if (trimmed === 'reddit:') {
			section = 'reddit';
			platformSection = '';
			subSection = '';
			continue;
		}
		if (trimmed === 'exclude:') {
			section = 'exclude';
			continue;
		}

		if (section === 'telegram' && trimmed === 'channels:') {
			platformSection = 'telegram_channels';
			continue;
		}
		if (section === 'discord' && trimmed === 'guilds:') {
			platformSection = 'discord_guilds';
			subSection = '';
			continue;
		}
		if (section === 'discord' && platformSection === 'discord_guilds' && trimmed === 'channels:') {
			subSection = 'discord_channels';
			continue;
		}
		if (section === 'reddit' && trimmed === 'subreddits:') {
			platformSection = 'reddit_subreddits';
			continue;
		}
		if (section === 'reddit' && trimmed === 'comments:') {
			platformSection = 'reddit_comments';
			continue;
		}

		const listMatch = trimmed.match(/^- (.+)$/);
		if (listMatch) {
			const value = listMatch[1]!.trim();
			if (section === 'tickers') {
				tickers.push(value);
			} else if (section === 'exclude') {
				exclude.push(value);
			} else if (section === 'telegram' && platformSection === 'telegram_channels') {
				if (value.startsWith('username:')) {
					currentTelegramChannel = {
						username: stripYamlScalar(value.slice('username:'.length)),
					};
					telegramChannels.push(currentTelegramChannel);
				} else if (currentTelegramChannel && value.startsWith('category:')) {
					currentTelegramChannel.category = stripYamlScalar(value.slice('category:'.length));
				} else if (currentTelegramChannel && value.startsWith('notes:')) {
					currentTelegramChannel.notes = stripYamlScalar(value.slice('notes:'.length));
				}
			} else if (section === 'discord' && platformSection === 'discord_guilds' && !subSection) {
				if (value.startsWith('guild_id:')) {
					currentDiscordGuild = {
						guildId: stripYamlScalar(value.slice('guild_id:'.length)),
						channels: [],
					};
					discordGuilds.push(currentDiscordGuild);
					currentDiscordChannel = null;
				} else if (currentDiscordGuild && value.startsWith('name:')) {
					currentDiscordGuild.name = stripYamlScalar(value.slice('name:'.length));
				}
			} else if (section === 'discord' && subSection === 'discord_channels') {
				if (value.startsWith('channel_id:')) {
					currentDiscordChannel = {
						channelId: stripYamlScalar(value.slice('channel_id:'.length)),
					};
					currentDiscordGuild?.channels.push(currentDiscordChannel);
				} else if (currentDiscordChannel && value.startsWith('name:')) {
					currentDiscordChannel.name = stripYamlScalar(value.slice('name:'.length));
				}
			} else if (section === 'reddit' && platformSection === 'reddit_subreddits') {
				if (value.startsWith('name:')) {
					currentRedditSubreddit = {name: stripYamlScalar(value.slice('name:'.length))};
					redditSubreddits.push(currentRedditSubreddit);
				} else if (currentRedditSubreddit && value.startsWith('category:')) {
					currentRedditSubreddit.category = stripYamlScalar(value.slice('category:'.length));
				} else if (currentRedditSubreddit && value.startsWith('sort:')) {
					currentRedditSubreddit.sort = stripYamlScalar(value.slice('sort:'.length)) as RedditSort;
				} else if (currentRedditSubreddit && value.startsWith('time_filter:')) {
					currentRedditSubreddit.timeFilter = stripYamlScalar(value.slice('time_filter:'.length));
				}
			}
			continue;
		}

		const kv = trimmed.match(/^([a-z_]+):\s*(.*)$/);
		if (!kv) {
			continue;
		}
		const key = kv[1]!;
		const value = stripYamlScalar(kv[2]!);

		if (section === 'defaults' && key === 'max_results') {
			defaults.maxResults = Number(value);
		} else if (section === 'ticker_detection') {
			setDetection(key, value);
		} else if (section === 'telegram') {
			if (key === 'max_messages_per_channel') {
				telegramMaxMessages = Number(value);
			} else if (platformSection === 'telegram_channels' && key === 'username') {
				currentTelegramChannel = {username: value};
				telegramChannels.push(currentTelegramChannel);
			} else if (currentTelegramChannel && platformSection === 'telegram_channels') {
				if (key === 'category') {
					currentTelegramChannel.category = value;
				} else if (key === 'notes') {
					currentTelegramChannel.notes = value;
				}
			}
		} else if (section === 'discord') {
			if (platformSection === '' && key === 'max_messages_per_channel') {
				discordMaxMessages = Number(value);
			} else if (platformSection === '' && key === 'mention_user_id') {
				discordMentionUserId = value;
			} else if (platformSection === '' && key === 'include_nsfw') {
				discordIncludeNsfw = value === 'true';
			} else if (platformSection === 'discord_guilds' && key === 'guild_id') {
				currentDiscordGuild = {guildId: value, channels: []};
				discordGuilds.push(currentDiscordGuild);
				currentDiscordChannel = null;
			} else if (
				platformSection === 'discord_guilds' &&
				subSection !== 'discord_channels' &&
				currentDiscordGuild &&
				key === 'name'
			) {
				currentDiscordGuild.name = value;
			} else if (subSection === 'discord_channels' && key === 'channel_id') {
				currentDiscordChannel = {channelId: value};
				currentDiscordGuild?.channels.push(currentDiscordChannel);
			} else if (subSection === 'discord_channels' && currentDiscordChannel && key === 'name') {
				currentDiscordChannel.name = value;
			}
		} else if (section === 'reddit') {
			if (platformSection === '' && key === 'max_posts_per_subreddit') {
				redditMaxPosts = Number(value);
			} else if (platformSection === '' && key === 'sort') {
				redditSort = value as RedditSort;
			} else if (platformSection === '' && key === 'time_filter') {
				redditTimeFilter = value;
			} else if (platformSection === 'reddit_subreddits' && key === 'name') {
				currentRedditSubreddit = {name: value.replace(/^r\//, '')};
				redditSubreddits.push(currentRedditSubreddit);
			} else if (currentRedditSubreddit && platformSection === 'reddit_subreddits') {
				if (key === 'category') {
					currentRedditSubreddit.category = value;
				} else if (key === 'sort') {
					currentRedditSubreddit.sort = value as RedditSort;
				} else if (key === 'time_filter') {
					currentRedditSubreddit.timeFilter = value;
				}
			} else if (platformSection === 'reddit_comments') {
				setRedditComment(key, value);
			}
		}
	}

	detection.exclude = exclude;

	return {
		defaults: {
			maxResults: defaults.maxResults ?? DEFAULT_MAX_RESULTS,
		},
		tickers,
		tickerDetection: tickerDetectionFromYaml(detection),
		telegram: {
			maxMessagesPerChannel: telegramMaxMessages,
			channels: telegramChannels,
		},
		discord: {
			maxMessagesPerChannel: discordMaxMessages,
			mentionUserId: discordMentionUserId,
			includeNsfw: discordIncludeNsfw,
			guilds: discordGuilds,
		},
		reddit: {
			maxPostsPerSubreddit: redditMaxPosts,
			sort: redditSort,
			timeFilter: redditTimeFilter,
			subreddits: redditSubreddits,
			comments: {
				includeOnSearch:
					redditComments.includeOnSearch ?? DEFAULT_REDDIT_COMMENTS.includeOnSearch,
				maxPerPost: redditComments.maxPerPost ?? DEFAULT_REDDIT_COMMENTS.maxPerPost,
				maxPerThread: redditComments.maxPerThread ?? DEFAULT_REDDIT_COMMENTS.maxPerThread,
				maxDepth: redditComments.maxDepth ?? DEFAULT_REDDIT_COMMENTS.maxDepth,
				sort: redditComments.sort ?? DEFAULT_REDDIT_COMMENTS.sort,
				replaceMoreLimit:
					redditComments.replaceMoreLimit ?? DEFAULT_REDDIT_COMMENTS.replaceMoreLimit,
			},
		},
	};
}

/** Legacy telegram-channels.yaml → unified config shape (telegram slice only). */
export function parseLegacyTelegramChannelsYaml(text: string): SocialSearchConfig {
	const lines = text.split(/\r?\n/);
	let section = '';
	const defaults: Record<string, number> = {};
	const tickers: string[] = [];
	const exclude: string[] = [];
	const detection: Record<string, unknown> = {exclude};
	const channels: TelegramChannelEntry[] = [];
	let currentChannel: TelegramChannelEntry | null = null;

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) {
			continue;
		}
		if (trimmed === 'defaults:') {
			section = 'defaults';
			continue;
		}
		if (trimmed === 'tickers:') {
			section = 'tickers';
			continue;
		}
		if (trimmed === 'ticker_detection:') {
			section = 'ticker_detection';
			continue;
		}
		if (trimmed === 'channels:') {
			section = 'channels';
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
		const value = stripYamlScalar(kv[2]!);
		if (section === 'defaults') {
			if (key === 'max_results') {
				defaults.maxResults = Number(value);
			} else if (key === 'max_messages_per_channel') {
				defaults.maxMessagesPerChannel = Number(value);
			}
		} else if (section === 'ticker_detection') {
			if (key === 'min_length' || key === 'max_length') {
				detection[key] = Number(value);
			} else if (key === 'include_bare_caps') {
				detection[key] = value === 'true';
			}
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
	const maxMessages =
		defaults.maxMessagesPerChannel ?? DEFAULT_TELEGRAM_MAX_MESSAGES;

	return {
		defaults: {maxResults: defaults.maxResults ?? DEFAULT_MAX_RESULTS},
		tickers,
		tickerDetection: tickerDetectionFromYaml(detection),
		telegram: {maxMessagesPerChannel: maxMessages, channels},
		discord: {
			maxMessagesPerChannel: DEFAULT_DISCORD_MAX_MESSAGES,
			mentionUserId: '',
			includeNsfw: false,
			guilds: [],
		},
		reddit: {
			maxPostsPerSubreddit: DEFAULT_REDDIT_MAX_POSTS,
			sort: 'new',
			timeFilter: 'month',
			subreddits: [],
			comments: {...DEFAULT_REDDIT_COMMENTS},
		},
	};
}

let cachedConfig: SocialSearchConfig | null = null;

export async function loadSocialSearchConfig(moduleUrl: string): Promise<SocialSearchConfig> {
	if (cachedConfig) {
		return cachedConfig;
	}

	const unifiedPath = resolveSocialSearchYamlPath(moduleUrl);
	try {
		const text = await fs.readFile(unifiedPath, 'utf8');
		cachedConfig = parseSocialSearchYaml(text);
		return cachedConfig;
	} catch (err) {
		const code = (err as NodeJS.ErrnoException).code;
		if (code !== 'ENOENT') {
			throw err;
		}
	}

	const legacyPath = resolveLegacyTelegramChannelsYamlPath(moduleUrl);
	const legacyText = await fs.readFile(legacyPath, 'utf8');
	cachedConfig = parseLegacyTelegramChannelsYaml(legacyText);
	return cachedConfig;
}

export function channelUsernames(config: SocialSearchConfig): string[] {
	return config.telegram.channels
		.map((c) => c.username.trim().replace(/^@/, ''))
		.filter(Boolean);
}

export function subredditNames(config: SocialSearchConfig): string[] {
	return config.reddit.subreddits
		.map((s) => s.name.trim().replace(/^r\//, ''))
		.filter(Boolean);
}

export function listDiscordSearchTargets(config: SocialSearchConfig): DiscordSearchTarget[] {
	const targets: DiscordSearchTarget[] = [];
	for (const guild of config.discord.guilds) {
		for (const channel of guild.channels) {
			if (!guild.guildId.trim() || !channel.channelId.trim()) {
				continue;
			}
			targets.push({
				guildId: guild.guildId.trim(),
				guildName: guild.name,
				channelId: channel.channelId.trim(),
				channelName: channel.name,
			});
		}
	}
	return targets;
}

export function resetSocialSearchConfigCache(): void {
	cachedConfig = null;
}
