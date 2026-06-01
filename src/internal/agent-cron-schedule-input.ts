/** Coerce LLM-friendly schedule inputs into AgentCronSchedule-shaped objects. */
export function coerceAgentCronScheduleInput(raw: unknown): unknown {
	if (raw == null) {
		return raw;
	}
	if (typeof raw === 'object' && !Array.isArray(raw)) {
		return raw;
	}
	if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
		return {kind: 'every', everyMs: Math.floor(raw)};
	}
	if (typeof raw !== 'string') {
		return raw;
	}

	const trimmed = raw.trim();
	if (!trimmed) {
		return raw;
	}

	if (trimmed.startsWith('{')) {
		try {
			return JSON.parse(trimmed) as unknown;
		} catch {
			return raw;
		}
	}

	if (trimmed.split(/\s+/).length === 5) {
		return {kind: 'cron', expr: trimmed, tz: 'UTC'};
	}

	const everyMs = parseEveryIntervalMs(trimmed);
	if (everyMs != null) {
		return {kind: 'every', everyMs};
	}

	return raw;
}

function parseEveryIntervalMs(text: string): number | null {
	const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');

	const compact = normalized.match(/^(\d+)(ms|s|m|h)$/);
	if (compact) {
		return scaleInterval(Number(compact[1]), compact[2]);
	}

	const everyPhrase = normalized.match(
		/^(?:every\s+)?(\d+(?:\.\d+)?)\s*(ms|milliseconds|s|secs?|seconds|m|mins?|minutes|h|hrs?|hours)?$/,
	);
	if (everyPhrase) {
		const amount = Number(everyPhrase[1]);
		if (!Number.isFinite(amount) || amount <= 0) {
			return null;
		}
		const unit = everyPhrase[2] ?? 'minutes';
		return scaleInterval(amount, unit);
	}

	return null;
}

function scaleInterval(amount: number, unit: string): number | null {
	if (!Number.isFinite(amount) || amount <= 0) {
		return null;
	}
	switch (unit) {
		case 'ms':
		case 'millisecond':
		case 'milliseconds':
			return Math.floor(amount);
		case 's':
		case 'sec':
		case 'secs':
		case 'second':
		case 'seconds':
			return Math.floor(amount * 1_000);
		case 'm':
		case 'min':
		case 'mins':
		case 'minute':
		case 'minutes':
			return Math.floor(amount * 60_000);
		case 'h':
		case 'hr':
		case 'hrs':
		case 'hour':
		case 'hours':
			return Math.floor(amount * 3_600_000);
		default:
			return null;
	}
}
