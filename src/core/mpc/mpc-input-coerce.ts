import {parseAgentBoolean, parseAgentEvmChainId} from '@continuumdao/ctm-mpc-defi/agent';

function asRecord(raw: unknown): Record<string, unknown> | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return null;
	}
	return {...(raw as Record<string, unknown>)};
}

function firstDefined(...values: unknown[]): unknown {
	for (const v of values) {
		if (v === undefined || v === null) continue;
		if (typeof v === 'string' && !v.trim()) continue;
		return v;
	}
	return undefined;
}

/** Shared MCP create fields: purposeText alias, string booleans. */
export function preprocessMpcCommonCreateInput(raw: unknown): unknown {
	const o = asRecord(raw);
	if (!o) return raw;
	const purpose = String(o.purpose ?? o.purposeText ?? '').trim();
	if (purpose) o.purpose = purpose;
	delete o.purposeText;
	if (o.useCustomGas !== undefined && o.useCustomGas !== null) {
		o.useCustomGas = parseAgentBoolean(o.useCustomGas, false);
	}
	if (o.refreshStaleNonces !== undefined && o.refreshStaleNonces !== null) {
		o.refreshStaleNonces = parseAgentBoolean(o.refreshStaleNonces, true);
	}
	return o;
}

function preprocessComposeAction(action: unknown): unknown {
	const o = asRecord(action);
	if (!o) return action;
	const addr = firstDefined(o.contractAddress, o.to, o.address, o.target);
	if (addr != null) {
		o.contractAddress = String(addr);
		delete o.to;
		delete o.address;
		delete o.target;
	}
	const valueWei = firstDefined(o.valueWei, o.value, o.amountWei);
	if (valueWei != null) {
		o.valueWei = String(valueWei);
		delete o.value;
		delete o.amountWei;
	}
	if (Array.isArray(o.args)) {
		o.args = o.args.map(arg => {
			const a = asRecord(arg);
			if (!a) return arg;
			const name = firstDefined(a.name, a.paramName, a.param);
			if (name != null) a.name = String(name);
			const type = firstDefined(a.type, a.paramType);
			if (type != null) a.type = String(type);
			const value = firstDefined(a.value, a.paramValue);
			if (value != null) a.value = String(value);
			return a;
		});
	}
	return o;
}

/** Compose: chainId coercion, action field aliases. */
export function preprocessCreateComposeInput(raw: unknown): unknown {
	const o = asRecord(preprocessMpcCommonCreateInput(raw));
	if (!o) return raw;
	if (o.chainId !== undefined) {
		const chainId = parseAgentEvmChainId(o.chainId);
		if (Number.isFinite(chainId) && chainId > 0) {
			o.chainId = chainId;
		}
	}
	const dest = firstDefined(o.destinationChainID, o.DestinationChainID);
	if (dest != null && o.chainId == null) {
		const chainId = parseAgentEvmChainId(dest);
		if (Number.isFinite(chainId) && chainId > 0) {
			o.chainId = chainId;
		}
	}
	delete o.destinationChainID;
	delete o.DestinationChainID;
	if (Array.isArray(o.actions)) {
		o.actions = o.actions.map(preprocessComposeAction);
	}
	return o;
}

/**
 * Forge: destinationChainID / chainId coercion (fixes 0x8453 → 8453 typo).
 * Accepts numeric chainId and copies to destinationChainID string for bodyForSign.
 */
export function preprocessCreateForgeInput(raw: unknown): unknown {
	const o = asRecord(preprocessMpcCommonCreateInput(raw));
	if (!o) return raw;
	const chainRaw = firstDefined(
		o.destinationChainID,
		o.DestinationChainID,
		o.chainId,
		o.chainID,
	);
	if (chainRaw != null) {
		const chainId = parseAgentEvmChainId(chainRaw);
		if (Number.isFinite(chainId) && chainId > 0) {
			o.destinationChainID = String(chainId);
		} else if (typeof chainRaw === 'string' && chainRaw.trim()) {
			o.destinationChainID = chainRaw.trim();
		} else if (typeof chainRaw === 'number' && chainRaw > 0) {
			o.destinationChainID = String(chainRaw);
		}
	}
	delete o.chainId;
	delete o.chainID;
	delete o.DestinationChainID;
	return o;
}

/** Transfer helpers: common fields + optional chainId coercion. */
export function preprocessTransferChainInput(raw: unknown): unknown {
	const o = asRecord(preprocessMpcCommonCreateInput(raw));
	if (!o) return raw;
	if (o.chainId !== undefined) {
		o.chainId = preprocessOptionalEvmChainId(o.chainId);
	}
	return o;
}

export function preprocessTransferC3Input(raw: unknown): unknown {
	const o = asRecord(preprocessTransferChainInput(raw));
	if (!o) return raw;
	if (o.toChainIdStr !== undefined) {
		o.toChainIdStr = preprocessToChainIdStr(o.toChainIdStr);
	}
	return o;
}

/** Optional chainId on transfer / gas-option inputs. */
export function preprocessOptionalEvmChainId(raw: unknown): unknown {
	if (raw === undefined || raw === null) return undefined;
	const chainId = parseAgentEvmChainId(raw);
	if (Number.isFinite(chainId) && chainId > 0) return chainId;
	return raw;
}

/** TransferC3 toChainIdStr — decimal chain id string. */
export function preprocessToChainIdStr(raw: unknown): unknown {
	if (typeof raw !== 'string' && typeof raw !== 'number') return raw;
	const chainId = parseAgentEvmChainId(raw);
	if (Number.isFinite(chainId) && chainId > 0) return String(chainId);
	if (typeof raw === 'string') return raw.trim();
	return String(raw);
}

/** Non-negative int (e.g. firstNonce); accepts decimal or 0x hex strings. */
export function parseAgentNonNegativeInt(raw: unknown): number {
	if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) {
		return raw;
	}
	if (typeof raw !== 'string') return Number.NaN;
	const t = raw.trim();
	if (!t) return Number.NaN;
	if (t.toLowerCase().startsWith('0x')) {
		const n = Number.parseInt(t, 16);
		return Number.isFinite(n) && n >= 0 ? n : Number.NaN;
	}
	const n = Number.parseInt(t, 10);
	return Number.isFinite(n) && n >= 0 ? n : Number.NaN;
}

function normalizeJoinPayload(raw: unknown): Record<string, unknown> | undefined {
	if (raw == null) return undefined;
	let value: unknown = raw;
	if (typeof value === 'string') {
		const t = value.trim();
		if (!t) return undefined;
		try {
			value = JSON.parse(t) as unknown;
		} catch {
			return undefined;
		}
	}
	if (typeof value !== 'object' || Array.isArray(value)) return undefined;
	return {...(value as Record<string, unknown>)};
}

/** Join: payload aliases, JSON-string payloads, firstNonce coercion, purposeText. */
export function preprocessJoinMultiSignRequestsInput(raw: unknown): unknown {
	const o = asRecord(raw);
	if (!o) return raw;

	const payloadA = firstDefined(o.payloadA, o.payload_a, o.payload1);
	if (payloadA != null) {
		const norm = normalizeJoinPayload(payloadA);
		if (norm) o.payloadA = norm;
	}
	const payloadAFilePath = firstDefined(
		o.payloadAFilePath,
		o.payload_a_file_path,
		o.payloadAPath,
		o.payload_a_path,
	);
	if (payloadAFilePath != null && String(payloadAFilePath).trim()) {
		o.payloadAFilePath = String(payloadAFilePath).trim();
	}
	const payloadB = firstDefined(o.payloadB, o.payload_b, o.payload2);
	if (payloadB != null) {
		const norm = normalizeJoinPayload(payloadB);
		if (norm) o.payloadB = norm;
	}
	const payloadBFilePath = firstDefined(
		o.payloadBFilePath,
		o.payload_b_file_path,
		o.payloadBPath,
		o.payload_b_path,
	);
	if (payloadBFilePath != null && String(payloadBFilePath).trim()) {
		o.payloadBFilePath = String(payloadBFilePath).trim();
	}
	delete o.payload_a;
	delete o.payload_b;
	delete o.payload1;
	delete o.payload2;
	delete o.payload_a_file_path;
	delete o.payload_b_file_path;
	delete o.payloadAPath;
	delete o.payload_a_path;
	delete o.payloadBPath;
	delete o.payload_b_path;

	const nonceRaw = firstDefined(
		o.firstNonce,
		o.first_nonce,
		o.startingNonce,
		o.starting_nonce,
	);
	if (nonceRaw != null) {
		const n = parseAgentNonNegativeInt(nonceRaw);
		if (Number.isFinite(n) && n >= 0) o.firstNonce = n;
	}
	delete o.first_nonce;
	delete o.startingNonce;
	delete o.starting_nonce;

	const purpose = String(o.purpose ?? o.purposeText ?? '').trim();
	if (purpose) o.purpose = purpose;
	delete o.purposeText;

	return o;
}

/** Join forge dry-runs: shared create fields + firstNonce aliases + A/B path aliases. */
export function preprocessImportAndJoinForgeDryRunsInput(raw: unknown): unknown {
	const o = asRecord(preprocessMpcCommonCreateInput(raw));
	if (!o) return raw;

	const firstNonceRaw = firstDefined(
		o.firstNonce,
		o.first_nonce,
		o.startingNonce,
		o.starting_nonce,
	);
	if (firstNonceRaw != null) {
		const n = parseAgentNonNegativeInt(firstNonceRaw);
		if (Number.isFinite(n) && n >= 0) o.firstNonce = n;
	}
	delete o.first_nonce;
	delete o.startingNonce;
	delete o.starting_nonce;

	const pathA = firstDefined(
		o.dryRunFilePathA,
		o.dry_run_file_path_a,
		o.dryRunPathA,
	);
	if (pathA != null && String(pathA).trim()) {
		o.dryRunFilePathA = String(pathA).trim();
	}
	const pathB = firstDefined(
		o.dryRunFilePathB,
		o.dry_run_file_path_b,
		o.dryRunPathB,
	);
	if (pathB != null && String(pathB).trim()) {
		o.dryRunFilePathB = String(pathB).trim();
	}
	const jsonA = firstDefined(o.dryRunJsonA, o.dry_run_json_a);
	if (jsonA != null && String(jsonA).trim()) o.dryRunJsonA = String(jsonA).trim();
	const jsonB = firstDefined(o.dryRunJsonB, o.dry_run_json_b);
	if (jsonB != null && String(jsonB).trim()) o.dryRunJsonB = String(jsonB).trim();

	delete o.dry_run_file_path_a;
	delete o.dry_run_file_path_b;
	delete o.dryRunPathA;
	delete o.dryRunPathB;
	delete o.dry_run_json_a;
	delete o.dry_run_json_b;

	return o;
}

/** Parse destination chain for forge handler (after Zod). */
export function parseForgeDestinationChainId(
	destinationChainID: string | undefined,
	broadcastFallback: string | number | undefined,
): number {
	if (destinationChainID?.trim()) {
		const n = parseAgentEvmChainId(destinationChainID);
		if (Number.isFinite(n) && n > 0) return n;
		const dec = Number.parseInt(destinationChainID.trim(), 10);
		if (Number.isFinite(dec) && dec > 0) return dec;
	}
	const n = parseAgentEvmChainId(broadcastFallback ?? '');
	if (Number.isFinite(n) && n > 0) return n;
	const dec = Number.parseInt(String(broadcastFallback ?? '0'), 10);
	return Number.isFinite(dec) && dec > 0 ? dec : Number.NaN;
}
