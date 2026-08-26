import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../result.js';
import {getEnvironmentVariable} from './environment-variables.js';
import {
	type RedditSort,
	type RedditSubredditEntry,
	type SocialSearchConfig,
	loadSocialSearchConfig,
	subredditNames,
} from './social-search-config.js';
import {tickerDetectionForPython} from './ticker-extract.js';
import type {
	GetRedditThreadInput,
	GetRedditThreadResult,
	SearchRedditPostsInput,
	SearchRedditPostsResult,
	SearchRedditTickersInput,
	SearchRedditTickersResult,
} from '../../schemas/extended.js';

export const REDDIT_SEARCH_ENV = {
	clientId: 'REDDIT_CLIENT_ID',
	clientSecret: 'REDDIT_CLIENT_SECRET',
	userAgent: 'REDDIT_USER_AGENT',
	python: 'REDDIT_SEARCH_PYTHON',
} as const;

const moduleUrl = import.meta.url;

function packageRoot(): string {
	return path.resolve(path.dirname(fileURLToPath(moduleUrl)), '../../..');
}

function scriptDir(): string {
	return path.join(packageRoot(), 'scripts', 'reddit-search');
}

function resolvePythonExecutable(): string {
	return process.env[REDDIT_SEARCH_ENV.python]?.trim() || 'python3';
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
			reason: `Missing ${name}. Set Node Variable or process env for Reddit search.`,
		};
	}
	const value = row.data.value.trim();
	if (!value) {
		return {ok: false, reason: `${name} is empty.`};
	}
	return {ok: true, data: value};
}

async function redditEnv(config: NodeSdkConfig): Promise<SdkResult<Record<string, string>>> {
	const clientId = await readEnvCredential(config, REDDIT_SEARCH_ENV.clientId);
	if (!clientId.ok) {
		return clientId;
	}
	const clientSecret = await readEnvCredential(config, REDDIT_SEARCH_ENV.clientSecret);
	if (!clientSecret.ok) {
		return clientSecret;
	}
	const userAgent = await readEnvCredential(config, REDDIT_SEARCH_ENV.userAgent);
	if (!userAgent.ok) {
		return userAgent;
	}
	return {
		ok: true,
		data: {
			REDDIT_CLIENT_ID: clientId.data,
			REDDIT_CLIENT_SECRET: clientSecret.data,
			REDDIT_USER_AGENT: userAgent.data,
		},
	};
}

function runPythonScript(
	scriptName: string,
	payload: Record<string, unknown>,
	env: Record<string, string>,
): Promise<SdkResult<unknown>> {
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
				reason: `Failed to start ${python} for Reddit search: ${err.message}`,
			});
		});
		child.on('close', (code) => {
			if (code !== 0) {
				const detail = stderr.trim() || stdout.trim() || `exit ${code}`;
				resolve({
					ok: false,
					reason: `Reddit search script failed: ${detail}`,
				});
				return;
			}
			try {
				resolve({ok: true, data: JSON.parse(stdout || 'null')});
			} catch {
				resolve({ok: false, reason: 'Reddit search returned invalid JSON.'});
			}
		});
		child.stdin.write(JSON.stringify(payload));
		child.stdin.end();
	});
}

function resolveSubredditNames(
	inputSubreddits: string[] | undefined,
	cfg: SocialSearchConfig,
): string[] {
	if (inputSubreddits && inputSubreddits.length > 0) {
		return inputSubreddits.map((s) => s.trim().replace(/^r\//i, '')).filter(Boolean);
	}
	return subredditNames(cfg);
}

function resolveSubredditSpecs(
	inputSubreddits: string[] | undefined,
	cfg: SocialSearchConfig,
): RedditSubredditEntry[] {
	if (inputSubreddits && inputSubreddits.length > 0) {
		const names = inputSubreddits
			.map((s) => s.trim().replace(/^r\//i, ''))
			.filter(Boolean);
		const byName = new Map(cfg.reddit.subreddits.map((entry) => [entry.name, entry]));
		return names.map((name) => byName.get(name) ?? {name});
	}
	return cfg.reddit.subreddits;
}

function subredditSpecsPayload(
	specs: RedditSubredditEntry[],
	defaultSort: RedditSort,
	defaultTimeFilter: string,
): Array<Record<string, string>> {
	return specs.map((spec) => {
		const sort = spec.sort ?? defaultSort;
		const row: Record<string, string> = {name: spec.name, sort};
		const timeFilter = spec.timeFilter ?? (sort === 'top' ? defaultTimeFilter : undefined);
		if (timeFilter) {
			row.time_filter = timeFilter;
		}
		return row;
	});
}

function sortPostsByMode<T extends {created_at?: string; score?: number}>(
	rows: T[],
	sort: RedditSort | 'relevance',
): T[] {
	if (sort === 'top') {
		return [...rows].sort((a, b) => {
			const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
			if (scoreDiff !== 0) {
				return scoreDiff;
			}
			return (b.created_at ?? '').localeCompare(a.created_at ?? '');
		});
	}
	return [...rows].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
}

export async function searchRedditPosts(
	config: NodeSdkConfig,
	input: SearchRedditPostsInput,
): Promise<SdkResult<SearchRedditPostsResult>> {
	const yamlConfig = await loadSocialSearchConfig(moduleUrl);
	const subreddits = resolveSubredditNames(input.subreddits, yamlConfig);
	if (subreddits.length === 0) {
		return {ok: false, reason: 'No Reddit subreddits configured or provided.'};
	}

	const env = await redditEnv(config);
	if (!env.ok) {
		return env;
	}

	const sort = input.sort ?? yamlConfig.reddit.sort;
	const timeFilter = input.timeFilter ?? yamlConfig.reddit.timeFilter;
	const includeComments = input.includeComments ?? yamlConfig.reddit.comments.includeOnSearch;

	const payload: Record<string, unknown> = {
		query: input.query,
		subreddits,
		max_results: input.maxResults ?? yamlConfig.defaults.maxResults,
		max_posts_per_subreddit:
			input.maxPostsPerSubreddit ?? yamlConfig.reddit.maxPostsPerSubreddit,
		sort: input.query ? (input.sort ?? 'relevance') : sort,
		...(timeFilter ? {time_filter: timeFilter} : {}),
		...(input.since ? {since: input.since} : {}),
		include_comments: includeComments,
		max_comments_per_post:
			input.maxCommentsPerPost ?? yamlConfig.reddit.comments.maxPerPost,
		comment_sort: yamlConfig.reddit.comments.sort,
		replace_more_limit: yamlConfig.reddit.comments.replaceMoreLimit,
	};

	const ran = await runPythonScript('search_posts.py', payload, env.data);
	if (!ran.ok) {
		return ran;
	}
	if (!Array.isArray(ran.data)) {
		return {ok: false, reason: 'Reddit search returned non-array JSON.'};
	}

	const posts = sortPostsByMode(
		ran.data as SearchRedditPostsResult['posts'],
		sort,
	).slice(0, payload.max_results as number);

	return {ok: true, data: {posts}};
}

export async function searchRedditTickers(
	config: NodeSdkConfig,
	input: SearchRedditTickersInput,
): Promise<SdkResult<SearchRedditTickersResult>> {
	const yamlConfig = await loadSocialSearchConfig(moduleUrl);
	const specs = resolveSubredditSpecs(input.subreddits, yamlConfig);
	if (specs.length === 0) {
		return {ok: false, reason: 'No Reddit subreddits configured or provided.'};
	}

	const env = await redditEnv(config);
	if (!env.ok) {
		return env;
	}

	const tickers = input.tickers !== undefined ? input.tickers : yamlConfig.tickers;
	const sort = input.sort ?? yamlConfig.reddit.sort;
	const timeFilter = input.timeFilter ?? yamlConfig.reddit.timeFilter;
	const includeComments = input.includeComments ?? yamlConfig.reddit.comments.includeOnSearch;

	const payload: Record<string, unknown> = {
		subreddit_specs: subredditSpecsPayload(specs, sort, timeFilter),
		subreddits: specs.map((s) => s.name),
		tickers,
		ticker_detection: tickerDetectionForPython(yamlConfig.tickerDetection),
		max_results: input.maxResults ?? yamlConfig.defaults.maxResults,
		max_posts_per_subreddit:
			input.maxPostsPerSubreddit ?? yamlConfig.reddit.maxPostsPerSubreddit,
		default_sort: sort,
		default_time_filter: timeFilter,
		...(input.since ? {since: input.since} : {}),
		include_comments: includeComments,
		max_comments_per_post:
			input.maxCommentsPerPost ?? yamlConfig.reddit.comments.maxPerPost,
		comment_sort: yamlConfig.reddit.comments.sort,
		replace_more_limit: yamlConfig.reddit.comments.replaceMoreLimit,
	};

	const ran = await runPythonScript('scan_tickers.py', payload, env.data);
	if (!ran.ok) {
		return ran;
	}
	if (!Array.isArray(ran.data)) {
		return {ok: false, reason: 'Reddit ticker scan returned non-array JSON.'};
	}

	const posts = sortPostsByMode(
		ran.data as SearchRedditTickersResult['posts'],
		sort,
	).slice(0, payload.max_results as number);

	return {ok: true, data: {posts}};
}

export async function getRedditThread(
	config: NodeSdkConfig,
	input: GetRedditThreadInput,
): Promise<SdkResult<GetRedditThreadResult>> {
	const yamlConfig = await loadSocialSearchConfig(moduleUrl);
	const env = await redditEnv(config);
	if (!env.ok) {
		return env;
	}

	const payload: Record<string, unknown> = {
		...(input.postId ? {post_id: input.postId} : {}),
		...(input.permalink ? {permalink: input.permalink} : {}),
		max_comments: input.maxComments ?? yamlConfig.reddit.comments.maxPerThread,
		max_depth: input.maxDepth ?? yamlConfig.reddit.comments.maxDepth,
		sort: input.sort ?? yamlConfig.reddit.comments.sort,
		replace_more_limit:
			input.replaceMoreLimit ?? yamlConfig.reddit.comments.replaceMoreLimit,
	};

	const ran = await runPythonScript('get_thread.py', payload, env.data);
	if (!ran.ok) {
		return ran;
	}
	if (!ran.data || typeof ran.data !== 'object' || Array.isArray(ran.data)) {
		return {ok: false, reason: 'Reddit thread fetch returned invalid JSON object.'};
	}

	return {ok: true, data: ran.data as GetRedditThreadResult};
}
