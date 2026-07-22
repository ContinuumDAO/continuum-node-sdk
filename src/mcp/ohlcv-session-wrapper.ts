import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import type {SdkResult} from '../core/result.js';
import {
	bindOhlcvSessionFetch,
	buildOhlcvSessionBindHint,
	getBoundOhlcvFetch,
	resolveOhlcvSessionInput,
	type OhlcvSessionResolveInput,
} from '../core/chart/ohlcv-session-store.js';
import {
	bindChartPatternAnalysis,
	resolveChartPatternApplyInput,
} from '../core/chart/chart-pattern-session-store.js';
import {
	attachFetchMetaToPayload,
	buildFetchLoadMeta,
	slimFetchOutputForAgent,
} from '../core/chart/fetch-agent-view.js';
import {extractChartMetadataFromFetchPayload} from '../core/chart/fetch-metadata.js';
import {extractOhlcvBarsFromUnknown} from '../core/chart/fetch-result.js';
import type {PrepareChartOutput} from '../core/chart/schemas.js';
import {slimChartOutputForAgent} from '../core/chart/chart-agent-view.js';
import {getOhlcvSessionKey} from './ohlcv-session-context.js';
import {mcpStructuredContent, sdkResultToCallToolResult} from './tool-utils.js';

const OHLCV_CONSUMER_TOOL_NAMES = new Set([
	'prepare_chart_from_rows',
	'analyze_trend_structure',
	'analyze_elliott_waves',
	'analyze_key_levels',
	'analyze_key_level_fibonacci',
	'analyze_momentum',
	'analyze_range_volatility',
	'analyze_bollinger_bands',
	'analyze_candlestick_patterns',
	'analyze_chart_patterns',
	'calculate_key_levels',
	'calculate_pivot_points',
	'calculate_fibonacci_range',
	'calculate_trend_lines',
	'calculate_chart_pattern_drawings',
	'calculate_elliott_wave_drawings',
	'apply_chart_drawings',
	'apply_chart_pattern_drawings',
	'apply_elliott_wave_drawings',
	'apply_trend_line_drawings',
]);

const PATTERN_APPLY_TOOL_NAMES = new Set(['apply_chart_pattern_drawings']);

function consumesOhlcvTool(name: string): boolean {
	return OHLCV_CONSUMER_TOOL_NAMES.has(name);
}

function consumesPatternApplyTool(name: string): boolean {
	return PATTERN_APPLY_TOOL_NAMES.has(name);
}

function isFetchOhlcvTool(name: string): boolean {
	return name.includes('fetch_ohlcv');
}

function asInputRecord(raw: unknown): Record<string, unknown> {
	if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
		return raw as Record<string, unknown>;
	}
	return {};
}

function attachSessionBindToStructured(
	data: Record<string, unknown>,
	hint: ReturnType<typeof buildOhlcvSessionBindHint>,
): Record<string, unknown> {
	if (!hint) {
		return data;
	}
	const meta =
		data.meta && typeof data.meta === 'object' && !Array.isArray(data.meta)
			? {...(data.meta as Record<string, unknown>)}
			: {};
	meta.sessionBind = hint;
	return {...data, meta};
}

function resolveFetchBindTitle(payload: unknown, inputTitle?: string): string | undefined {
	const explicit = inputTitle?.trim();
	if (explicit) {
		return explicit;
	}
	return extractChartMetadataFromFetchPayload(payload).title;
}

function maybeBindFromPayload(sessionKey: string, payload: unknown, title?: string): void {
	if (payload == null) {
		return;
	}
	const bars = extractOhlcvBarsFromUnknown(payload, {maxPoints: 10_000});
	if (!bars?.length) {
		return;
	}
	bindOhlcvSessionFetch(sessionKey, payload, {title: resolveFetchBindTitle(payload, title)});
}

function maybeBindChartPatternAnalysis(
	sessionKey: string,
	toolName: string,
	result: CallToolResult,
	inputTitle?: string,
): void {
	if (result.isError || toolName !== 'analyze_chart_patterns') {
		return;
	}
	const structured = result.structuredContent;
	if (!structured || typeof structured !== 'object' || Array.isArray(structured)) {
		return;
	}
	const record = structured as Record<string, unknown>;
	const analysis = record.analysis;
	if (!analysis || typeof analysis !== 'object') {
		return;
	}
	const bound = getBoundOhlcvFetch(sessionKey);
	bindChartPatternAnalysis(sessionKey, analysis as import('../core/chart-patterns/types.js').ChartPatternAnalysis, {
		title: inputTitle ?? (typeof record.meta === 'object' ? (record.meta as Record<string, unknown>).title as string : undefined),
		ohlcvDigest: bound?.fingerprint?.digest,
	});
}

function maybeBindFromCallToolResult(
	sessionKey: string,
	toolName: string,
	result: CallToolResult,
	inputTitle?: string,
): void {
	if (result.isError || !result.structuredContent || !isFetchOhlcvTool(toolName)) {
		return;
	}
	const payload = result.structuredContent;
	const record =
		payload && typeof payload === 'object' && !Array.isArray(payload)
			? (payload as Record<string, unknown>)
			: undefined;
	const bindPayload =
		record && record.meta && typeof record.meta === 'object' && !Array.isArray(record.meta)
			? Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'meta'))
			: payload;
	maybeBindFromPayload(sessionKey, bindPayload, inputTitle);
}

function slimFetchCallToolResult(
	result: CallToolResult,
	sessionKey: string,
	inputTitle?: string,
): CallToolResult {
	if (result.isError || !result.structuredContent) {
		return result;
	}
	const rawPayload = result.structuredContent;
	const record =
		rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
			? (rawPayload as Record<string, unknown>)
			: undefined;
	const payload =
		record && record.meta && typeof record.meta === 'object' && !Array.isArray(record.meta)
			? Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'meta'))
			: rawPayload;
	const bound = getBoundOhlcvFetch(sessionKey);
	const bindHint = bound ? buildOhlcvSessionBindHint(bound) : undefined;
	const meta = buildFetchLoadMeta(payload, {
		title: resolveFetchBindTitle(payload, inputTitle),
		fingerprint: bound?.fingerprint,
		sessionBind: bindHint,
	});
	if (!meta) {
		return result;
	}
	const structuredContent = attachFetchMetaToPayload(payload, meta);
	const slimStructured = slimFetchOutputForAgent(payload, meta);
	const prefixLines = [meta.dataPolicy];
	if (meta.warnings?.length) {
		prefixLines.push(...meta.warnings);
	}
	return {
		content: [{type: 'text', text: `${prefixLines.join('\n')}\n${JSON.stringify(slimStructured)}`}],
		structuredContent,
	};
}

function slimChartCallToolResult(
	result: SdkResult<PrepareChartOutput>,
	prefixText: string,
): CallToolResult {
	if (!result.ok) {
		return sdkResultToCallToolResult(result);
	}
	const sessionKey = getOhlcvSessionKey();
	const bound = getBoundOhlcvFetch(sessionKey);
	const bindHint = bound ? buildOhlcvSessionBindHint(bound) : undefined;
	const fullStructured = attachSessionBindToStructured(
		mcpStructuredContent(result.data),
		bindHint,
	);
	const slimStructured = attachSessionBindToStructured(
		slimChartOutputForAgent(result.data),
		bindHint,
	);
	// Trailing full JSON line lets clients without structuredContent (some MCP HTTP clients) recover the
	// plotted chart envelope for Telegram Mini App delivery; agent LLM still sees the slim summary only.
	const fullLine = JSON.stringify(fullStructured);
	return {
		content: [{type: 'text', text: `${prefixText}\n${JSON.stringify(slimStructured)}\n${fullLine}`}],
		structuredContent: fullStructured,
	};
}

export function installOhlcvSessionToolWrapper(server: McpServer): void {
	const originalRegister = server.registerTool.bind(server);

	server.registerTool = ((name, config, handler) => {
		const wrappedHandler = async (rawInput: unknown, extra: unknown) => {
			const sessionKey = getOhlcvSessionKey();
			let input = rawInput;

			if (consumesOhlcvTool(name)) {
				const resolved = resolveOhlcvSessionInput(
					sessionKey,
					asInputRecord(rawInput) as OhlcvSessionResolveInput,
				);
				if (!resolved.ok) {
					return sdkResultToCallToolResult(resolved);
				}
				input = resolved.data;
				if (
					resolved.data.toolResult != null &&
					typeof resolved.data.toolResult === 'object'
				) {
					bindOhlcvSessionFetch(sessionKey, resolved.data.toolResult, {
						title: typeof resolved.data.title === 'string' ? resolved.data.title : undefined,
					});
				}
			}

			if (consumesPatternApplyTool(name)) {
				const patternResolved = resolveChartPatternApplyInput(
					sessionKey,
					asInputRecord(input),
				);
				if (!patternResolved.ok) {
					return sdkResultToCallToolResult(patternResolved);
				}
				input = patternResolved.data;
			}

			const result = await (handler as (input: unknown, extra: unknown) => Promise<CallToolResult>)(
				input,
				extra,
			);
			const inputTitle =
				typeof asInputRecord(input).title === 'string'
					? String(asInputRecord(input).title)
					: undefined;
			maybeBindFromCallToolResult(sessionKey, name, result, inputTitle);
			maybeBindChartPatternAnalysis(sessionKey, name, result, inputTitle);
			if (isFetchOhlcvTool(name)) {
				return slimFetchCallToolResult(result, sessionKey, inputTitle);
			}
			return result;
		};

		return originalRegister(name, config, wrappedHandler as typeof handler);
	}) as typeof server.registerTool;
}

export {slimChartCallToolResult};
