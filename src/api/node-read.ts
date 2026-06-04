/** GET, JWT-protected DELETE, and POST /agent/* with optional Bearer JWT (browser HTTPS / loopback). */
export type NodeReadAuth = {
	bearerOnGet: boolean;
	jwt: string | null;
};

const READ_JWT_METHODS = new Set(['GET', 'DELETE']);

function requestPathname(url: string): string {
	try {
		return new URL(url).pathname;
	} catch {
		try {
			return new URL(url, 'http://localhost').pathname;
		} catch {
			return '';
		}
	}
}

/** Management POSTs use signatures only; agent POSTs on browser HTTPS / loopback need the read JWT too. */
function readJwtBearerRequired(method: string, url: string): boolean {
	const m = method.toUpperCase();
	if (READ_JWT_METHODS.has(m)) return true;
	if (m !== 'POST') return false;
	const path = requestPathname(url);
	return path === '/agent' || path.startsWith('/agent/');
}

export function nodeFetchWithReadAuth(
	url: string,
	init: RequestInit | undefined,
	auth: NodeReadAuth,
): Promise<Response> {
	const method = (init?.method ?? 'GET').toUpperCase();
	const headers = new Headers(init?.headers);
	if (auth.bearerOnGet && auth.jwt?.trim() && readJwtBearerRequired(method, url)) {
		headers.set('Authorization', `Bearer ${auth.jwt.trim()}`);
	}
	return fetch(url, {...init, headers});
}
