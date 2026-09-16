/** HTTP wait for GET /connectivityHealth. Must exceed the node per-ping timeout. */
export function connectivityHealthFetchTimeoutMs(pingTimeoutSec?: number): number {
	const sec =
		typeof pingTimeoutSec === 'number' && Number.isFinite(pingTimeoutSec) && pingTimeoutSec > 0
			? pingTimeoutSec
			: 10;
	return Math.min(120_000, Math.max(30_000, sec * 1000 + 15_000));
}
