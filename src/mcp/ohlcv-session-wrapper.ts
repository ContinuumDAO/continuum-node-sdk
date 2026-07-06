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
import {extractOhlcvBarsFromUnknown} from '../core/chart/fetch-result.js';
import type {PrepareChartOutput} from '../core/chart/schemas.js';
import {slimChartOutputForAgent} from '../core/chart/chart-agent-view.js';
import {getOhlcvSessionKey} from './ohlcv-session-context.js';
import {mcpStructuredContent, sdkResultToCallToolResult} from './tool-utils.js';

const OHLCV_CONSUMER_TOOL_NAMES = new Set([
	'prepare_chart_from_rows',
	'analyze_trend_structure',
	'analyze_key_levels',
	'analyze_momentum',
	'analyze_range_volatility',
	'analyze_candlestick_patterns',
	'analyze_chart_patterns',
	'calculate_key_levels',
	'calculate_pivot_points',
	'calculate_fibonacci_range',
	'calculate_trend_lines',
	'calculate_chart_pattern_drawings',
	'apply_chart_drawings',
	'apply_chart_pattern_drawings',
]);

function consumesOhlcvTool(name: string): boolean {
	return OHLCV_CONSUMER_TOOL_NAMES.has(name);
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

function maybeBindFromPayload(sessionKey: string, payload: unknown, title?: string): void {
	if (payload == null) {
		return;
	}
	const bars = extractOhlcvBarsFromUnknown(payload, {maxPoints: 10_000});
	if (!bars?.length) {
		return;
	}
	bindOhlcvSessionFetch(sessionKey, payload, {title});
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
	maybeBindFromPayload(sessionKey, result.structuredContent, inputTitle);
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
	return {
		content: [{type: 'text', text: `${prefixText}\n${JSON.stringify(slimStructured)}`}],
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

			const result = await (handler as (input: unknown, extra: unknown) => Promise<CallToolResult>)(
				input,
				extra,
			);
			const inputTitle =
				typeof asInputRecord(input).title === 'string'
					? String(asInputRecord(input).title)
					: undefined;
			maybeBindFromCallToolResult(sessionKey, name, result, inputTitle);
			return result;
		};

		return originalRegister(name, config, wrappedHandler as typeof handler);
	}) as typeof server.registerTool;
}

export {slimChartCallToolResult};
