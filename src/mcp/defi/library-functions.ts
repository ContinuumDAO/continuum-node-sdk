import {getMcpToolDefinitions} from '@continuumdao/ctm-mpc-defi/agent';
import {listIndicatorCatalog} from '@continuumdao/ctm-market-data';

export type LibraryName = 'defi' | 'market';

export type LibraryField = {
	name: string;
	type: string;
	required: boolean;
	description?: string;
	properties?: LibraryField[];
};

export type LibraryFunctionMatch = {
	library: LibraryName;
	package: string;
	importPath: string;
	exportName: string;
	purpose: string;
	arguments: LibraryField[];
	returns: LibraryField[];
	mcpTool?: string;
};

const DEFI_PACKAGE = '@continuumdao/ctm-mpc-defi';
const MARKET_PACKAGE = '@continuumdao/ctm-market-data';

/** Fields the chat agent supplies. A plugin export does not receive them. */
const HOST_FIELDS = new Set([
	'keyGenId',
	'keyGen',
	'purposeText',
	'useCustomGas',
	'useCustomFees',
	'managementNodeUrl',
	'nodeKey',
	'clientSig',
	'nonce',
	'requestId',
]);

const field = (
	name: string,
	type: string,
	required: boolean,
	description?: string,
	properties?: LibraryField[],
): LibraryField => {
	const out: LibraryField = {name, type, required};
	if (description) out.description = description;
	if (properties?.length) out.properties = properties;
	return out;
};

type StaticFn = {
	importPath: string;
	exportName: string;
	purpose: string;
	keywords: string;
	arguments: LibraryField[];
	returns: LibraryField[];
};

const MARKET_FUNCTIONS: StaticFn[] = [
	{
		importPath: 'ta',
		exportName: 'listIndicatorCatalog',
		purpose: 'Every indicator id, its aliases, the input profile it expects, and the kind of values it returns.',
		keywords: 'indicator catalog list technical analysis',
		arguments: [],
		returns: [
			field('id', 'string', true),
			field('aliases', 'string[]', false),
			field('description', 'string', true),
			field('inputProfile', 'string', true, 'close_series, ohlcv_series, candle_objects, or another profile'),
			field('defaultParams', 'object', true),
			field('outputKind', 'string', true, 'numbers, objects, booleans, or levels'),
		],
	},
	{
		importPath: 'ta',
		exportName: 'listTechnicalIndicators',
		purpose: 'Same catalog as listIndicatorCatalog, wrapped as { ok, data.indicators }.',
		keywords: 'list technical indicators',
		arguments: [],
		returns: [field('indicators', 'object[]', true, 'Catalog rows', [
			field('id', 'string', true),
			field('inputProfile', 'string', true),
			field('outputKind', 'string', true),
			field('description', 'string', true),
		])],
	},
	{
		importPath: 'ta',
		exportName: 'resolveIndicatorId',
		purpose: 'Canonical indicator id for a name or alias, or null when nothing matches.',
		keywords: 'resolve indicator id alias',
		arguments: [field('name', 'string', true)],
		returns: [field('id', 'string | null', true)],
	},
	{
		importPath: 'ta',
		exportName: 'suggestIndicator',
		purpose: 'Nearest indicator id when the name is not exact.',
		keywords: 'suggest indicator typo',
		arguments: [field('name', 'string', true)],
		returns: [field('id', 'string | null', true)],
	},
	{
		importPath: 'ta',
		exportName: 'calculateTechnicalIndicator',
		purpose: 'Run one indicator. Pass the id from listIndicatorCatalog. Period indicators take params.period.',
		keywords: 'calculate technical indicator rsi ema sma macd',
		arguments: [
			field('indicator', 'string', true, 'Catalog id'),
			field('params', 'object', false, 'Period and other indicator settings. Keys are strings, values are numbers or booleans.'),
			field('input', 'object', true, 'Candles or parallel arrays. The catalog inputProfile says which fields this indicator reads.', [
				field('candles', 'object[]', false, '{ open, high, low, close, volume? }'),
				field('close', 'number[]', false),
				field('open', 'number[]', false),
				field('high', 'number[]', false),
				field('low', 'number[]', false),
				field('volume', 'number[]', false),
			]),
			field('options', 'object', false, undefined, [
				field('trimWarmup', 'boolean', false),
				field('maxPoints', 'number', false),
			]),
		],
		returns: [
			field('indicator', 'string', true),
			field('params', 'object', true),
			field('inputLength', 'number', true),
			field('outputLength', 'number', true),
			field('warmupCount', 'number', true),
			field('result', 'number[] | object[] | boolean[]', true, 'Shape follows the catalog outputKind'),
		],
	},
	{
		importPath: 'ohlcv',
		exportName: 'extractOhlcvBarsFromUnknown',
		purpose: 'Pull candle rows out of a fetch result, a JSON string, or a wrapper object.',
		keywords: 'extract ohlcv bars fetch result',
		arguments: [
			field('payload', 'unknown', true),
			field('options', 'object', false),
		],
		returns: [field('bars', 'unknown[] | null', true)],
	},
	{
		importPath: 'ohlcv',
		exportName: 'looksLikeOhlcvBar',
		purpose: 'True when a value has open, high, low, and close numbers.',
		keywords: 'ohlcv bar shape',
		arguments: [field('row', 'unknown', true)],
		returns: [field('match', 'boolean', true)],
	},
	{
		importPath: 'ohlcv',
		exportName: 'normalizeOhlcvRow',
		purpose: 'Turn one raw row into a candle record, or null when it is not a candle.',
		keywords: 'normalize ohlcv row candle',
		arguments: [field('raw', 'object', true)],
		returns: [field('row', 'object | null', true, 'open, high, low, close, and optional volume')],
	},
	{
		importPath: 'ohlcv',
		exportName: 'ohlcvToPrepareChartInput',
		purpose: 'Map candle rows to a candlestick series plus an optional volume histogram.',
		keywords: 'prepare chart input candles',
		arguments: [
			field('rows', 'object[]', true, 'open, high, low, close, volume, time'),
			field('options', 'object', true, undefined, [
				field('includeVolume', 'boolean', false),
				field('label', 'string', false),
				field('title', 'string', false),
				field('height', 'number', false),
				field('maxPoints', 'number', false),
			]),
		],
		returns: [
			field('series', 'object[]', true, 'Candlestick series and optional volume'),
			field('title', 'string', false),
			field('height', 'number', false),
		],
	},
	{
		importPath: 'ohlcv',
		exportName: 'prepareChartFromRows',
		purpose: 'Build a chart payload from candle rows or a fetch result. title is required.',
		keywords: 'prepare chart from rows',
		arguments: [
			field('rows', 'unknown[]', false),
			field('toolResult', 'unknown', false, 'Fetch JSON object, not a string'),
			field('title', 'string', true),
			field('label', 'string', false),
			field('height', 'number', false),
			field('overlays', 'object', false),
			field('options', 'object', false),
		],
		returns: [field('chart', 'object', true, 'Prepared chart payload, or { ok: false, reason }')],
	},
	{
		importPath: 'ohlcv',
		exportName: 'analyzeMovingAverages',
		purpose: 'SMA or EMA cross. Omit the periods for SMA 50 and 200. analysis.crossoverState is bullish, bearish, or none.',
		keywords: 'moving average sma ema crossover golden cross',
		arguments: [
			field('rows', 'unknown[]', false),
			field('toolResult', 'unknown', false),
			field('maType', 'string', false, 'sma or ema'),
			field('fastPeriod', 'number', false, 'Default 50'),
			field('slowPeriod', 'number', false, 'Default 200'),
			field('freshCrossoverMaxBars', 'number', false),
		],
		returns: [
			field('analysis', 'object', true, undefined, [
				field('summary', 'string', true),
				field('fastMa', 'number', true),
				field('slowMa', 'number', true),
				field('fastPeriod', 'number', true),
				field('slowPeriod', 'number', true),
				field('maType', 'string', true),
				field('crossoverState', 'string', true, 'bullish, bearish, or none'),
				field('barsSinceCrossover', 'number | null', true),
			]),
		],
	},
	{
		importPath: 'trade-ideas',
		exportName: 'tradeIdeaFromAnalyzeOutput',
		purpose: 'Entry, target, and invalidation from an analyze result. Does not build a transaction.',
		keywords: 'trade idea entry target invalidation',
		arguments: [
			field('toolName', 'string', true, 'Analyze tool name whose setup field should be read'),
			field('analysis', 'object | null', true),
			field('meta', 'object', false, 'Optional protocolId, symbol, and id'),
		],
		returns: [
			field('idea', 'object | null', true, 'Null when the analysis has no trade setup', [
				field('side', 'string', true),
				field('entry', 'object', false),
				field('target', 'object', false),
				field('invalidation', 'object', false),
				field('lastClose', 'number', true),
				field('confidence', 'number', true),
			]),
		],
	},
];

function schemaType(schema: Record<string, unknown>): string {
	if (Array.isArray(schema.enum) && schema.enum.length > 0) {
		return schema.enum.map(item => String(item)).join(' | ');
	}
	if (Array.isArray(schema.type)) {
		return schema.type.map(item => String(item)).join(' | ');
	}
	if (schema.type === 'array') {
		const items = schema.items;
		if (items && typeof items === 'object' && !Array.isArray(items)) {
			return schemaType(items as Record<string, unknown>) + '[]';
		}
		return 'array';
	}
	if (typeof schema.type === 'string') return schema.type;
	if (schema.anyOf || schema.oneOf) return 'union';
	return 'unknown';
}

function fieldsFromSchema(schema: unknown, depth = 0): LibraryField[] {
	if (depth > 1 || !schema || typeof schema !== 'object' || Array.isArray(schema)) return [];
	const record = schema as Record<string, unknown>;
	const props = record.properties;
	if (!props || typeof props !== 'object' || Array.isArray(props)) {
		if (depth === 0) {
			return [field('(value)', schemaType(record), true, typeof record.description === 'string' ? record.description : undefined)];
		}
		return [];
	}
	const required = new Set(Array.isArray(record.required) ? record.required.map(item => String(item)) : []);
	const out: LibraryField[] = [];
	for (const [name, raw] of Object.entries(props as Record<string, unknown>)) {
		if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
		const prop = raw as Record<string, unknown>;
		let description = typeof prop.description === 'string' ? prop.description : undefined;
		if (HOST_FIELDS.has(name)) {
			description = description
				? description + ' The plugin does not pass this.'
				: 'The plugin does not pass this.';
		}
		const nested = fieldsFromSchema(prop, depth + 1);
		out.push(field(name, schemaType(prop), required.has(name), description, nested.length ? nested : undefined));
	}
	return out;
}

function tokens(query: string): string[] {
	return query
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(token => token.length > 1);
}

function scoreText(query: string, parts: string[]): number {
	const blob = parts.join(' ').toLowerCase();
	const wanted = tokens(query);
	if (wanted.length === 0) return 0;
	const compact = wanted.join('');
	let score = 0;
	if (blob.replace(/[^a-z0-9]/g, '').includes(compact) && compact.length > 3) score += 30;
	for (const token of wanted) {
		if (blob.includes(token)) score += 12;
	}
	const exportName = (parts[0] ?? '').toLowerCase();
	if (exportName === compact || exportName === wanted.join('')) score += 80;
	for (const token of wanted) {
		if (exportName.includes(token)) score += 20;
	}
	return score;
}

function marketMatches(query: string): Array<LibraryFunctionMatch & {score: number}> {
	const hits: Array<LibraryFunctionMatch & {score: number}> = [];
	for (const fn of MARKET_FUNCTIONS) {
		const score = scoreText(query, [fn.exportName, fn.purpose, fn.keywords, fn.importPath]);
		if (score <= 0) continue;
		hits.push({
			score,
			library: 'market',
			package: MARKET_PACKAGE,
			importPath: fn.importPath,
			exportName: fn.exportName,
			purpose: fn.purpose,
			arguments: fn.arguments,
			returns: fn.returns,
		});
	}
	for (const indicator of listIndicatorCatalog()) {
		const names = [indicator.id, ...(indicator.aliases ?? [])];
		const score = scoreText(query, [indicator.id, indicator.description, names.join(' '), 'calculateTechnicalIndicator']);
		if (score < 24) continue;
		const defaults = Object.entries(indicator.defaultParams)
			.map(([key, value]) => key + '=' + String(value))
			.join(', ');
		hits.push({
			score: score + 5,
			library: 'market',
			package: MARKET_PACKAGE,
			importPath: 'ta',
			exportName: 'calculateTechnicalIndicator',
			purpose: indicator.id + ': ' + indicator.description,
			arguments: [
				field('indicator', 'string', true, 'Pass "' + indicator.id + '"' + (indicator.aliases?.length ? '. Aliases: ' + indicator.aliases.join(', ') : '')),
				field('params', 'object', false, defaults ? 'Defaults ' + defaults : 'Optional indicator settings'),
				field('input', 'object', true, 'inputProfile ' + indicator.inputProfile + '. Use candles or the arrays that profile names.'),
			],
			returns: [
				field('result', indicator.outputKind, true, 'outputKind ' + indicator.outputKind),
				field('outputLength', 'number', true),
				field('warmupCount', 'number', true),
			],
		});
	}
	return hits;
}

function defiMatches(query: string): Array<LibraryFunctionMatch & {score: number}> {
	const best = new Map<string, LibraryFunctionMatch & {score: number}>();
	for (const tool of getMcpToolDefinitions()) {
		const exportName = tool.handler?.exportName;
		const importPath = tool.handler?.importPath;
		if (!exportName || !importPath) continue;
		const score = scoreText(query, [exportName, tool.description, tool.protocolId, importPath, tool.name, tool.actionId]);
		if (score <= 0) continue;
		const key = importPath + '\0' + exportName;
		const hit: LibraryFunctionMatch & {score: number} = {
			score,
			library: 'defi',
			package: DEFI_PACKAGE,
			importPath,
			exportName,
			purpose: tool.description,
			arguments: fieldsFromSchema(tool.inputSchema),
			returns: fieldsFromSchema(tool.outputSchema),
			mcpTool: tool.name,
		};
		const prev = best.get(key);
		if (!prev || hit.score > prev.score) best.set(key, hit);
	}
	return [...best.values()];
}

export function findLibraryFunctions(
	query: string,
	options?: {library?: LibraryName; limit?: number},
): {query: string; matches: LibraryFunctionMatch[]} {
	const q = query.trim();
	const limit = Math.min(Math.max(options?.limit ?? 5, 1), 8);
	const library = options?.library;
	const hits = [
		...(library === 'market' ? [] : defiMatches(q)),
		...(library === 'defi' ? [] : marketMatches(q)),
	];
	hits.sort((a, b) => b.score - a.score || a.exportName.localeCompare(b.exportName));
	return {
		query: q,
		matches: hits.slice(0, limit).map(({score: _score, ...match}) => match),
	};
}
