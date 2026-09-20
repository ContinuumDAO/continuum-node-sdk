import type {SdkResult} from '../result.js';
import {
	CONTINUUMDAO_API_DEFAULT_BASE,
	CONTINUUMDAO_API_USER_AGENT,
	FETCH_TIMEOUT_MS,
} from './constants.js';
import {CtmMetricsRawSchema, type CtmMetricsRaw} from './schemas.js';

export type ContinuumDaoApiDeps = {
	fetchImpl?: typeof fetch;
	apiBaseUrl?: string;
};

export function resolveContinuumDaoApiBase(deps?: ContinuumDaoApiDeps): string {
	const fromDeps = deps?.apiBaseUrl?.trim();
	if (fromDeps) {
		return fromDeps.replace(/\/$/, '');
	}
	const fromEnv = process.env['CONTINUUMDAO_API_BASE_URL']?.trim();
	if (fromEnv) {
		return fromEnv.replace(/\/$/, '');
	}
	return CONTINUUMDAO_API_DEFAULT_BASE;
}

export async function continuumDaoApiGet(
	path: string,
	deps?: ContinuumDaoApiDeps,
): Promise<SdkResult<unknown>> {
	const fetchImpl = deps?.fetchImpl ?? fetch;
	const url = `${resolveContinuumDaoApiBase(deps)}${path.startsWith('/') ? path : `/${path}`}`;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const resp = await fetchImpl(url, {
			method: 'GET',
			headers: {
				Accept: 'application/json',
				'User-Agent': CONTINUUMDAO_API_USER_AGENT,
				'Cache-Control': 'no-cache',
			},
			signal: controller.signal,
		});
		const text = await resp.text();
		if (!resp.ok) {
			return {
				ok: false,
				reason: `ContinuumDAO API ${path} failed: HTTP ${resp.status} ${resp.statusText}`.trim(),
			};
		}
		if (!text.trim()) {
			return {ok: false, reason: `ContinuumDAO API ${path} returned an empty body.`};
		}
		try {
			return {ok: true, data: JSON.parse(text) as unknown};
		} catch {
			return {ok: false, reason: `ContinuumDAO API ${path} returned invalid JSON.`};
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {ok: false, reason: `ContinuumDAO API ${path} failed: ${message}`};
	} finally {
		clearTimeout(timer);
	}
}

function readAddressPayload(raw: unknown): string | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return null;
	}
	const address = (raw as {address?: unknown}).address;
	return typeof address === 'string' && address.trim() ? address.trim() : null;
}

export type ContinuumDaoProtocolApi = {
	ctm: string;
	ve: string;
	dao: string;
	c3gov: string;
	dist: string;
	networks: Array<{
		name: string;
		label: string;
		chainId: string;
		c3governor: string;
	}>;
};

export async function fetchProtocolFromApi(
	deps?: ContinuumDaoApiDeps,
): Promise<SdkResult<ContinuumDaoProtocolApi>> {
	const [ctm, ve, dao, c3gov, dist, networks] = await Promise.all([
		continuumDaoApiGet('/protocol/ctm', deps),
		continuumDaoApiGet('/protocol/ve', deps),
		continuumDaoApiGet('/protocol/dao', deps),
		continuumDaoApiGet('/protocol/c3gov', deps),
		continuumDaoApiGet('/protocol/dist', deps),
		continuumDaoApiGet('/protocol/networks', deps),
	]);
	for (const result of [ctm, ve, dao, c3gov, dist, networks]) {
		if (!result.ok) {
			return result;
		}
	}
	const ctmAddr = readAddressPayload(ctm.ok ? ctm.data : null);
	const veAddr = readAddressPayload(ve.ok ? ve.data : null);
	const daoAddr = readAddressPayload(dao.ok ? dao.data : null);
	const c3Addr = readAddressPayload(c3gov.ok ? c3gov.data : null);
	const distAddr = readAddressPayload(dist.ok ? dist.data : null);
	if (!ctmAddr || !veAddr || !daoAddr || !c3Addr || !distAddr) {
		return {ok: false, reason: 'ContinuumDAO API /protocol/* missing address fields.'};
	}
	if (!networks.ok || !Array.isArray(networks.data)) {
		return {ok: false, reason: 'ContinuumDAO API /protocol/networks must be an array.'};
	}
	const parsedNetworks: ContinuumDaoProtocolApi['networks'] = [];
	for (const row of networks.data) {
		if (!row || typeof row !== 'object' || Array.isArray(row)) {
			return {ok: false, reason: 'ContinuumDAO API /protocol/networks has an invalid row.'};
		}
		const rec = row as Record<string, unknown>;
		if (
			typeof rec.name !== 'string' ||
			typeof rec.label !== 'string' ||
			typeof rec.chainId !== 'string' ||
			typeof rec.c3governor !== 'string'
		) {
			return {ok: false, reason: 'ContinuumDAO API /protocol/networks row is missing fields.'};
		}
		parsedNetworks.push({
			name: rec.name,
			label: rec.label,
			chainId: rec.chainId,
			c3governor: rec.c3governor,
		});
	}
	return {
		ok: true,
		data: {
			ctm: ctmAddr,
			ve: veAddr,
			dao: daoAddr,
			c3gov: c3Addr,
			dist: distAddr,
			networks: parsedNetworks,
		},
	};
}

export async function fetchMetricsFromApi(
	deps?: ContinuumDaoApiDeps,
): Promise<SdkResult<CtmMetricsRaw>> {
	const result = await continuumDaoApiGet('/metrics', deps);
	if (!result.ok) {
		return result;
	}
	const parsed = CtmMetricsRawSchema.safeParse(result.data);
	if (!parsed.success) {
		return {ok: false, reason: 'ContinuumDAO API /metrics response failed validation.'};
	}
	return {ok: true, data: parsed.data};
}

export type ApiVeTokenRow = {
	id: string;
	locked: string;
	end: number;
	votes: string;
};

function parseVeTokenRows(raw: unknown): ApiVeTokenRow[] | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return null;
	}
	const tokens = (raw as {tokens?: unknown}).tokens;
	if (!Array.isArray(tokens)) {
		return null;
	}
	const rows: ApiVeTokenRow[] = [];
	for (const token of tokens) {
		if (!token || typeof token !== 'object' || Array.isArray(token)) {
			return null;
		}
		const rec = token as Record<string, unknown>;
		if (typeof rec.id !== 'string' || typeof rec.locked !== 'string' || typeof rec.votes !== 'string') {
			return null;
		}
		const end = typeof rec.end === 'number' ? rec.end : Number(rec.end);
		if (!Number.isFinite(end)) {
			return null;
		}
		rows.push({id: rec.id, locked: rec.locked, end, votes: rec.votes});
	}
	return rows;
}

export async function fetchUserTokensFromApi(
	address: string,
	deps?: ContinuumDaoApiDeps,
): Promise<SdkResult<ApiVeTokenRow[]>> {
	const result = await continuumDaoApiGet(`/user/${address}`, deps);
	if (!result.ok) {
		return result;
	}
	const tokens = parseVeTokenRows(result.data);
	if (!tokens) {
		return {ok: false, reason: 'ContinuumDAO API /user/:address response failed validation.'};
	}
	return {ok: true, data: tokens};
}

export async function fetchTokensFromApi(
	input: {page?: number; ids?: readonly string[]},
	deps?: ContinuumDaoApiDeps,
): Promise<SdkResult<{tokens: ApiVeTokenRow[]; total?: number}>> {
	const ids = input.ids?.filter(Boolean) ?? [];
	const path =
		ids.length > 0
			? `/tokens?ids=${ids.map(id => encodeURIComponent(id)).join(',')}`
			: `/tokens?page=${input.page ?? 0}`;
	const result = await continuumDaoApiGet(path, deps);
	if (!result.ok) {
		return result;
	}
	const tokens = parseVeTokenRows(result.data);
	if (!tokens) {
		return {ok: false, reason: 'ContinuumDAO API /tokens response failed validation.'};
	}
	const totalRaw =
		result.data && typeof result.data === 'object' && !Array.isArray(result.data)
			? (result.data as {total?: unknown}).total
			: undefined;
	const total = typeof totalRaw === 'number' ? totalRaw : undefined;
	return {ok: true, data: {tokens, ...(total !== undefined ? {total} : {})}};
}
