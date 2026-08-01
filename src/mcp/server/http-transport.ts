import {randomUUID} from 'node:crypto';
import type {Server} from 'node:http';
import {createMcpExpressApp} from '@modelcontextprotocol/express';
import {toNodeHandler} from '@modelcontextprotocol/node';
import {createMcpHandler, type McpServer} from '@modelcontextprotocol/server';
import type {Request, Response} from 'express';
import {runWithOhlcvSessionAsync} from '../ohlcv-session-context.js';

export type CreateMcpServer = () => McpServer;

export type HttpMcpRoute = {
	path: string;
	createServer: CreateMcpServer;
};

export type HttpTransportOptions = {
	host?: string;
	port?: number;
};

function resolveHttpOptions(
	options: HttpTransportOptions = {},
): Required<HttpTransportOptions> & {port: number} {
	const host = options.host ?? process.env['MCP_HTTP_HOST'] ?? '127.0.0.1';
	const port = Number(
		options.port ?? process.env['MCP_HTTP_PORT'] ?? process.env['MCP_PORT'] ?? '3000',
	);

	if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
		throw new Error(`Invalid MCP HTTP port: ${String(port)}`);
	}

	return {host, port};
}

/**
 * MCP 2026-07-28 only: per-request servers via createMcpHandler (no Mcp-Session-Id).
 * Cross-request chart/OHLCV state must use explicit handles, not transport sessions.
 * Cross-request DeFi load state must use a shared DefiProtocolContext from the route factory
 * (see server/index.ts) — a fresh context per request makes load_defi_protocol a no-op for ctm_*.
 */
function mountMcpRoute(
	app: ReturnType<typeof createMcpExpressApp>,
	route: HttpMcpRoute,
): void {
	const handler = createMcpHandler(route.createServer, {legacy: 'reject'});
	const nodeHandler = toNodeHandler(handler, {
		onerror: error => {
			console.error(`MCP handler error on ${route.path}:`, error);
		},
	});

	const wrapped = async (req: Request, res: Response): Promise<void> => {
		const requestKey = randomUUID();
		await runWithOhlcvSessionAsync(requestKey, async () => {
			// createMcpExpressApp mounts express.json(); pass the pre-parsed body so
			// toNodeHandler does not re-read an already-consumed request stream
			// (empty body → JSON-RPC parse error → go-sdk falls back to initialize → 400).
			await nodeHandler(req, res, req.body);
		});
	};

	app.all(route.path, (req, res, next) => {
		void wrapped(req, res).catch(next);
	});
}

export async function startHttpTransportServer(
	routes: HttpMcpRoute | HttpMcpRoute[],
	options: HttpTransportOptions = {},
): Promise<{urls: URL[]; close: () => Promise<void>}> {
	const routeList = Array.isArray(routes) ? routes : [routes];
	if (routeList.length === 0) {
		throw new Error('At least one MCP HTTP route is required');
	}

	const {host, port} = resolveHttpOptions(options);
	const app = createMcpExpressApp({host});
	const urls: URL[] = [];

	for (const route of routeList) {
		mountMcpRoute(app, route);
		urls.push(new URL(`http://${host}:${port}${route.path}`));
	}

	const httpServer = await new Promise<Server>((resolve, reject) => {
		const listener = app.listen(port, host, (error?: Error) => {
			if (error) {
				reject(error);
				return;
			}
			resolve(listener);
		});
	});

	for (const url of urls) {
		console.error(`Continuum MCP Server listening on ${url.toString()} (MCP 2026-07-28)`);
	}

	const close = async (): Promise<void> => {
		await new Promise<void>((resolve, reject) => {
			httpServer.close(error => {
				if (error) {
					reject(error);
					return;
				}
				resolve();
			});
		});
	};

	const shutdown = (): void => {
		void close().finally(() => {
			process.exit(0);
		});
	};

	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);

	return {urls, close};
}
