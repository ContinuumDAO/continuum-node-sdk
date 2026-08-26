const DISCORD_API_BASE = 'https://discord.com/api/v10';

export type DiscordUser = {
	id: string;
	username?: string;
};

export type DiscordMessage = {
	id: string;
	channel_id: string;
	author?: DiscordUser;
	content?: string;
	timestamp?: string;
	mentions?: DiscordUser[];
};

export type DiscordSearchResponse = {
	messages?: DiscordMessage[][];
	total_results?: number;
	retry_after?: number;
	message?: string;
	code?: number;
};

export type DiscordGuildSearchParams = {
	content?: string;
	mentions?: string[];
	channelIds?: string[];
	limit?: number;
	offset?: number;
	includeNsfw?: boolean;
};

export type DiscordChannelHistoryParams = {
	before?: string;
	limit?: number;
};

export type DiscordRestClientOptions = {
	token: string;
	fetchImpl?: typeof fetch;
	maxRetries?: number;
};

type DiscordErrorBody = {
	message?: string;
	retry_after?: number;
	code?: number;
};

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(response: Response, body: DiscordErrorBody | null): number {
	const header = response.headers.get('retry-after');
	if (header) {
		const parsed = Number(header);
		if (Number.isFinite(parsed) && parsed >= 0) {
			return Math.ceil(parsed * 1000);
		}
	}
	if (body?.retry_after !== undefined && body.retry_after >= 0) {
		return Math.ceil(body.retry_after * 1000);
	}
	return 1000;
}

async function parseJsonBody(response: Response): Promise<unknown> {
	const text = await response.text();
	if (!text.trim()) {
		return null;
	}
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return null;
	}
}

export class DiscordRestClient {
	private readonly token: string;
	private readonly fetchImpl: typeof fetch;
	private readonly maxRetries: number;

	constructor(options: DiscordRestClientOptions) {
		this.token = options.token;
		this.fetchImpl = options.fetchImpl ?? fetch;
		this.maxRetries = options.maxRetries ?? 5;
	}

	private headers(): HeadersInit {
		return {
			Authorization: `Bot ${this.token}`,
			'Content-Type': 'application/json',
		};
	}

	private async request<T>(
		path: string,
		query?: URLSearchParams,
	): Promise<{ok: true; data: T} | {ok: false; reason: string}> {
		const url = `${DISCORD_API_BASE}${path}${query ? `?${query.toString()}` : ''}`;

		for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
			let response: Response;
			try {
				response = await this.fetchImpl(url, {headers: this.headers()});
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				return {ok: false, reason: `Discord API request failed: ${message}`};
			}

			const body = (await parseJsonBody(response)) as DiscordErrorBody | T | null;

			if (response.status === 202) {
				const delay = retryDelayMs(response, body as DiscordErrorBody | null);
				if (attempt >= this.maxRetries) {
					return {
						ok: false,
						reason:
							(body as DiscordErrorBody | null)?.message ??
							'Discord search index not ready. Try again later.',
					};
				}
				await sleep(delay > 0 ? delay : 1000);
				continue;
			}

			if (response.status === 429) {
				if (attempt >= this.maxRetries) {
					return {ok: false, reason: 'Discord rate limit exceeded.'};
				}
				await sleep(retryDelayMs(response, body as DiscordErrorBody | null));
				continue;
			}

			if (!response.ok) {
				const errBody = body as DiscordErrorBody | null;
				const detail = errBody?.message ?? `HTTP ${response.status}`;
				return {ok: false, reason: `Discord API error: ${detail}`};
			}

			return {ok: true, data: body as T};
		}

		return {ok: false, reason: 'Discord API request failed after retries.'};
	}

	async searchGuildMessages(
		guildId: string,
		params: DiscordGuildSearchParams,
	): Promise<{ok: true; messages: DiscordMessage[]} | {ok: false; reason: string}> {
		const query = new URLSearchParams();
		query.set('sort_by', 'timestamp');
		query.set('sort_order', 'desc');
		const limit = Math.min(Math.max(params.limit ?? 25, 1), 25);
		query.set('limit', String(limit));
		if (params.offset !== undefined && params.offset > 0) {
			query.set('offset', String(Math.min(params.offset, 9975)));
		}
		if (params.content) {
			query.set('content', params.content);
		}
		for (const userId of params.mentions ?? []) {
			query.append('mentions', userId);
		}
		for (const channelId of params.channelIds ?? []) {
			query.append('channel_id', channelId);
		}
		if (params.includeNsfw) {
			query.set('include_nsfw', 'true');
		}

		const result = await this.request<DiscordSearchResponse>(
			`/guilds/${guildId}/messages/search`,
			query,
		);
		if (!result.ok) {
			return result;
		}

		const flat: DiscordMessage[] = [];
		for (const group of result.data.messages ?? []) {
			for (const message of group) {
				flat.push(message);
			}
		}
		return {ok: true, messages: flat};
	}

	async fetchChannelMessages(
		channelId: string,
		params: DiscordChannelHistoryParams,
	): Promise<{ok: true; messages: DiscordMessage[]} | {ok: false; reason: string}> {
		const query = new URLSearchParams();
		const limit = Math.min(Math.max(params.limit ?? 100, 1), 100);
		query.set('limit', String(limit));
		if (params.before) {
			query.set('before', params.before);
		}

		const result = await this.request<DiscordMessage[]>(
			`/channels/${channelId}/messages`,
			query,
		);
		if (!result.ok) {
			return result;
		}
		return {ok: true, messages: Array.isArray(result.data) ? result.data : []};
	}
}

export async function searchGuildMessagesPaginated(
	client: DiscordRestClient,
	guildId: string,
	params: Omit<DiscordGuildSearchParams, 'limit' | 'offset'> & {maxResults: number},
): Promise<{ok: true; messages: DiscordMessage[]} | {ok: false; reason: string}> {
	const collected: DiscordMessage[] = [];
	const seen = new Set<string>();
	let offset = 0;

	while (collected.length < params.maxResults && offset <= 9975) {
		const pageLimit = Math.min(25, params.maxResults - collected.length);
		const page = await client.searchGuildMessages(guildId, {
			...params,
			limit: pageLimit,
			offset,
		});
		if (!page.ok) {
			return page;
		}
		if (page.messages.length === 0) {
			break;
		}
		for (const message of page.messages) {
			if (seen.has(message.id)) {
				continue;
			}
			seen.add(message.id);
			collected.push(message);
		}
		if (page.messages.length < pageLimit) {
			break;
		}
		offset += pageLimit;
	}

	return {ok: true, messages: collected};
}

export async function fetchChannelHistory(
	client: DiscordRestClient,
	channelId: string,
	maxMessages: number,
): Promise<{ok: true; messages: DiscordMessage[]} | {ok: false; reason: string}> {
	const collected: DiscordMessage[] = [];
	let before: string | undefined;

	while (collected.length < maxMessages) {
		const limit = Math.min(100, maxMessages - collected.length);
		const page = await client.fetchChannelMessages(channelId, {before, limit});
		if (!page.ok) {
			return page;
		}
		if (page.messages.length === 0) {
			break;
		}
		collected.push(...page.messages);
		before = page.messages[page.messages.length - 1]!.id;
		if (page.messages.length < limit) {
			break;
		}
	}

	return {ok: true, messages: collected};
}
