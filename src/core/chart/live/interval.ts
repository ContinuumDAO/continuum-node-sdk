const INTERVAL_BUCKET_SEC: Record<string, number> = {
	'1m': 60,
	'3m': 180,
	'5m': 300,
	'15m': 900,
	'30m': 1800,
	'1h': 3600,
	'2h': 7200,
	'4h': 14_400,
	'8h': 28_800,
	'12h': 43_200,
	'1d': 86_400,
	'3d': 259_200,
	'1w': 604_800,
	'1M': 2_592_000,
};

/** Map interval label (15m, 1h, 4h, …) to bar bucket width in seconds. */
export function intervalLabelToBucketSec(interval: string): number | null {
	const key = interval.trim();
	if (!key) {
		return null;
	}
	const direct = INTERVAL_BUCKET_SEC[key];
	if (direct != null) {
		return direct;
	}
	const lower = key.toLowerCase();
	return INTERVAL_BUCKET_SEC[lower] ?? null;
}
