/** GET and JWT-protected DELETE to mpc-auth with optional Bearer JWT (browser HTTPS / loopback). */
export type NodeReadAuth = {
	bearerOnGet: boolean;
	jwt: string | null;
};

const READ_JWT_METHODS = new Set(['GET', 'DELETE']);

export function nodeFetchWithReadAuth(
	url: string,
	init: RequestInit | undefined,
	auth: NodeReadAuth,
): Promise<Response> {
	const method = (init?.method ?? 'GET').toUpperCase();
	const headers = new Headers(init?.headers);
	if (auth.bearerOnGet && READ_JWT_METHODS.has(method) && auth.jwt?.trim()) {
		headers.set('Authorization', `Bearer ${auth.jwt.trim()}`);
	}
	return fetch(url, {...init, headers});
}
