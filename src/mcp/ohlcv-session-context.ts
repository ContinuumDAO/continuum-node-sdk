import {AsyncLocalStorage} from 'node:async_hooks';

const sessionStorage = new AsyncLocalStorage<string>();

const DEFAULT_SESSION_KEY = 'default';

export function getOhlcvSessionKey(): string {
	return sessionStorage.getStore() ?? DEFAULT_SESSION_KEY;
}

export function runWithOhlcvSession<T>(sessionKey: string | undefined, fn: () => T): T {
	return sessionStorage.run(sessionKey?.trim() || DEFAULT_SESSION_KEY, fn);
}

export async function runWithOhlcvSessionAsync<T>(
	sessionKey: string | undefined,
	fn: () => Promise<T>,
): Promise<T> {
	return sessionStorage.run(sessionKey?.trim() || DEFAULT_SESSION_KEY, fn);
}
