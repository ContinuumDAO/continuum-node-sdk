import {randomUUID} from 'node:crypto';
import type {Server} from 'node:http';
import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {createMcpExpressApp} from '@modelcontextprotocol/sdk/server/express.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {isInitializeRequest} from '@modelcontextprotocol/sdk/types.js';
import type {Request, Response} from 'express';

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
		process.env['MCP_HTTP_PORT'] ?? process.env['MCP_PORT'] ?? '3000',
	);

	if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
		throw new Error(`Invalid MCP HTTP port: ${String(port)}`);
	}

	return {host, port};
}

function createMcpRouteHandlers(createServer: CreateMcpServer): {
	mcpPostHandler: (req: Request, res: Response) => Promise<void>;
	mcpGetHandler: (req: Request, res: Response) => Promise<void>;
	mcpDeleteHandler: (req: Request, res: Response) => Promise<void>;
	closeTransports: () => Promise<void>;
} {
	const transports: Record<string, StreamableHTTPServerTransport> = {};

	const mcpPostHandler = async (req: Request, res: Response): Promise<void> => {
		const sessionIdHeader = req.headers['mcp-session-id'];
		const sessionId = Array.isArray(sessionIdHeader)
			? sessionIdHeader[0]
			: sessionIdHeader;

		try {
			let transport: StreamableHTTPServerTransport | undefined;

			if (sessionId && transports[sessionId]) {
				transport = transports[sessionId];
			} else if (!sessionId && isInitializeRequest(req.body)) {
				transport = new StreamableHTTPServerTransport({
					sessionIdGenerator: () => randomUUID(),
					onsessioninitialized: initializedSessionId => {
						transports[initializedSessionId] = transport!;
					},
				});

				transport.onclose = () => {
					const sid = transport?.sessionId;
					if (sid && transports[sid]) {
						delete transports[sid];
					}
				};

				const server = createServer();
				await server.connect(transport);
				await transport.handleRequest(req, res, req.body);
				return;
			} else {
				res.status(400).json({
					jsonrpc: '2.0',
					error: {
						code: -32_000,
						message: 'Bad Request: No valid session ID provided',
					},
					id: null,
				});
				return;
			}

			await transport.handleRequest(req, res, req.body);
		} catch (error) {
			console.error('Error handling MCP request:', error);
			if (!res.headersSent) {
				res.status(500).json({
					jsonrpc: '2.0',
					error: {
						code: -32_603,
						message: 'Internal server error',
					},
					id: null,
				});
			}
		}
	};

	const mcpGetHandler = async (req: Request, res: Response): Promise<void> => {
		const sessionIdHeader = req.headers['mcp-session-id'];
		const sessionId = Array.isArray(sessionIdHeader)
			? sessionIdHeader[0]
			: sessionIdHeader;

		if (!sessionId || !transports[sessionId]) {
			res.status(400).send('Invalid or missing session ID');
			return;
		}

		await transports[sessionId].handleRequest(req, res);
	};

	const mcpDeleteHandler = async (
		req: Request,
		res: Response,
	): Promise<void> => {
		const sessionIdHeader = req.headers['mcp-session-id'];
		const sessionId = Array.isArray(sessionIdHeader)
			? sessionIdHeader[0]
			: sessionIdHeader;

		if (!sessionId || !transports[sessionId]) {
			res.status(400).send('Invalid or missing session ID');
			return;
		}

		try {
			await transports[sessionId].handleRequest(req, res);
		} catch (error) {
			console.error('Error handling session termination:', error);
			if (!res.headersSent) {
				res.status(500).send('Error processing session termination');
			}
		}
	};

	const closeTransports = async (): Promise<void> => {
		for (const activeSessionId of Object.keys(transports)) {
			try {
				await transports[activeSessionId].close();
				delete transports[activeSessionId];
			} catch (error) {
				console.error(
					`Error closing transport for session ${activeSessionId}:`,
					error,
				);
			}
		}
	};

	return {mcpPostHandler, mcpGetHandler, mcpDeleteHandler, closeTransports};
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
	const closeHandlers: Array<() => Promise<void>> = [];
	const urls: URL[] = [];

	for (const route of routeList) {
		const {mcpPostHandler, mcpGetHandler, mcpDeleteHandler, closeTransports} =
			createMcpRouteHandlers(route.createServer);

		app.post(route.path, mcpPostHandler);
		app.get(route.path, mcpGetHandler);
		app.delete(route.path, mcpDeleteHandler);
		closeHandlers.push(closeTransports);
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
		console.error(`Continuum MCP Server listening on ${url.toString()}`);
	}

	const close = async (): Promise<void> => {
		for (const closeTransports of closeHandlers) {
			await closeTransports();
		}

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
