/** GET requests to mpc-auth with optional Bearer JWT (browser HTTPS). */
export type NodeReadAuth = {
	bearerOnGet: boolean;
	jwt: string | null;
};

export function nodeFetchWithReadAuth(
	url: string,
	init: RequestInit | undefined,
	auth: NodeReadAuth,
): Promise<Response> {
	const method = (init?.method ?? 'GET').toUpperCase();
	const headers = new Headers(init?.headers);
	if (auth.bearerOnGet && method === 'GET' && auth.jwt?.trim()) {
		headers.set('Authorization', `Bearer ${auth.jwt.trim()}`);
	}
	return fetch(url, {...init, headers});
}
