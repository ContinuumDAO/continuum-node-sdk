import type {z} from 'zod';
import {
	GroupRequestIdSchema,
	KeyGenRequestSchema,
	KeyGenResultSchema,
	McpGroupRequestSchema,
	McpGroupResultSchema,
	type GroupId,
	type Key,
	type MsgCheck,
	type McpGroupRequest,
	type McpGroupResult,
	type NodeId,
} from '../schemas/extended.js';

export function pick(obj: Record<string, unknown>, keys: string[]): unknown {
	for (const k of keys) {
		if (Object.prototype.hasOwnProperty.call(obj, k)) {
			return obj[k];
		}
	}
	return undefined;
}

function requireString(value: unknown, field: string): string {
	if (typeof value !== 'string' || value.length === 0) {
		throw new Error(`Expected non-empty string field: ${field}`);
	}
	return value;
}

export function asOptionalString(value: unknown): string | undefined {
	if (value === undefined || value === null || value === '') {
		return undefined;
	}
	return typeof value === 'string' ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value) || value.some(v => typeof v !== 'string')) {
		return undefined;
	}
	return value;
}

function asRecordOptional(value: unknown): Record<string, string> {
	if (
		value === undefined ||
		value === null ||
		typeof value !== 'object' ||
		Array.isArray(value)
	) {
		return {};
	}
	const src = value as Record<string, unknown>;
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(src)) {
		if (typeof v === 'string') {
			out[k] = v;
		}
	}
	return out;
}

export function normalizeNodeIdList(nodeIds: readonly string[]): NodeId[] {
	return Array.from(new Set(nodeIds)).sort() as NodeId[];
}

export function isSameNodeSet(left: NodeId[], right: NodeId[]): boolean {
	const leftNormalized = normalizeNodeIdList(left);
	const rightNormalized = normalizeNodeIdList(right);
	if (leftNormalized.length !== rightNormalized.length) {
		return false;
	}
	return leftNormalized.every((value, idx) => value === rightNormalized[idx]);
}

export function normalizeGroupRequest(value: unknown): McpGroupRequest | undefined {
	if (!value || typeof value !== 'object') {
		return undefined;
	}
	const src = value as Record<string, unknown>;
	const dataRaw = pick(src, [
		'NewGroupDataPb',
		'newGroupDataPb',
		'newgroupdatapb',
		'data',
		'newGroupData',
	]);
	const data =
		dataRaw && typeof dataRaw === 'object'
			? (dataRaw as Record<string, unknown>)
			: undefined;
	if (!data) {
		return undefined;
	}

	const normalized = {
		RequestId: requireString(
			pick(src, ['RequestId', 'requestid', 'id']),
			'RequestId',
		),
		NewGroupDataPb: {
			GroupId: requireString(pick(data, ['GroupId', 'groupId']), 'GroupId'),
			KeyList: asStringArray(pick(data, ['KeyList', 'keyList'])) ?? [],
			Addresses: asStringArray(pick(data, ['Addresses', 'addresses'])) ?? [],
			SigList: asRecordOptional(pick(data, ['SigList', 'sigList'])),
			BrokerArray:
				asStringArray(pick(data, ['BrokerArray', 'brokerArray'])) ?? [],
		},
		Timepoint: requireString(
			pick(src, ['Timepoint', 'timepoint']),
			'Timepoint',
		),
		status: requireString(pick(src, ['status']), 'status'),
		originator: requireString(
			pick(src, ['originator', 'Originator']),
			'originator',
		),
	};

	const parsed = McpGroupRequestSchema.safeParse(normalized);
	return parsed.success ? parsed.data : undefined;
}

export function normalizeGroupResult(value: unknown): McpGroupResult | undefined {
	if (!value || typeof value !== 'object') {
		return undefined;
	}
	const src = value as Record<string, unknown>;
	const normalized = {
		requestid: requireString(
			pick(src, ['requestid', 'RequestId', 'id']),
			'requestid',
		),
		GroupId: requireString(
			pick(src, ['GroupId', 'groupId']),
			'GroupId',
		) as GroupId,
		KeyList: asStringArray(pick(src, ['KeyList', 'keyList'])) ?? [],
		Addresses: asStringArray(pick(src, ['Addresses', 'addresses'])) ?? [],
		SigList: asRecordOptional(pick(src, ['SigList', 'sigList'])),
		BrokerArray:
			asStringArray(pick(src, ['BrokerArray', 'brokerArray'])) ?? [],
		timepoint: requireString(
			pick(src, ['timepoint', 'Timepoint']),
			'timepoint',
		),
		originator: asOptionalString(pick(src, ['originator', 'Originator'])) as
			| NodeId
			| undefined,
	};
	const parsed = McpGroupResultSchema.safeParse(normalized);
	return parsed.success ? parsed.data : undefined;
}

export function normalizeLegacyGroupListEntry(
	value: unknown,
): McpGroupResult | undefined {
	if (!value || typeof value !== 'object') {
		return undefined;
	}
	const src = value as Record<string, unknown>;
	const groupId = asOptionalString(pick(src, ['groupId', 'GroupId']));
	const keyList = asStringArray(pick(src, ['nodeKeys', 'KeyList', 'keyList']));
	if (!groupId || !keyList) {
		return undefined;
	}
	const requestIdRaw = `legacy_${groupId}`;
	const requestId = GroupRequestIdSchema.safeParse(requestIdRaw).success
		? requestIdRaw
		: requestIdRaw;
	return normalizeGroupResult({
		requestid: requestId,
		GroupId: groupId,
		KeyList: keyList,
		Addresses: [],
		SigList: {},
		BrokerArray: [],
		timepoint: '',
	});
}

export function normalizeKeyGenRequest(
	value: unknown,
): z.infer<typeof KeyGenRequestSchema> | undefined {
	if (!value || typeof value !== 'object') {
		return undefined;
	}
	const src = value as Record<string, unknown>;
	const threshold = pick(src, ['Threshold', 'threshold']);
	if (typeof threshold !== 'number' || Number.isNaN(threshold)) {
		return undefined;
	}
	const normalized = {
		requestid: requireString(
			pick(src, ['requestid', 'RequestId', 'id']),
			'requestid',
		),
		GroupId: requireString(pick(src, ['GroupId', 'groupId']), 'GroupId') as GroupId,
		KeyType: requireString(pick(src, ['KeyType', 'keyType']), 'KeyType') as Key,
		MsgCheck: requireString(
			pick(src, ['MsgCheck', 'msgCheck']),
			'MsgCheck',
		) as MsgCheck,
		SigList: asRecordOptional(pick(src, ['SigList', 'sigList'])),
		Gate: threshold + 1,
		timepoint: requireString(
			pick(src, ['timepoint', 'Timepoint']),
			'timepoint',
		),
		status: asOptionalString(pick(src, ['status'])),
		originator: asOptionalString(pick(src, ['originator', 'Originator'])) as
			| NodeId
			| undefined,
	};
	const parsed = KeyGenRequestSchema.safeParse(normalized);
	return parsed.success ? parsed.data : undefined;
}

export function normalizeKeyGenResult(
	value: unknown,
): z.infer<typeof KeyGenResultSchema> | undefined {
	if (!value || typeof value !== 'object') {
		return undefined;
	}
	const src = value as Record<string, unknown>;
	const rawThreshold = pick(src, ['threshold', 'Threshold']);
	const gate =
		typeof rawThreshold === 'number' && !Number.isNaN(rawThreshold)
			? rawThreshold + 1
			: undefined;
	const normalized = {
		requestid: requireString(
			pick(src, ['requestid', 'RequestId', 'id']),
			'requestid',
		),
		pubkeyhex: asOptionalString(pick(src, ['pubkeyhex', 'PubKeyHex'])),
		ethereumaddress: asOptionalString(
			pick(src, ['ethereumaddress', 'EthereumAddress']),
		),
		solanaaddress: asOptionalString(pick(src, ['solanaaddress', 'SolanaAddress'])),
		sorobanaddress: asOptionalString(
			pick(src, ['sorobanaddress', 'SorobanAddress']),
		),
		nearaddress: asOptionalString(pick(src, ['nearaddress', 'NearAddress'])),
		tonaddress: asOptionalString(pick(src, ['tonaddress', 'TonAddress'])),
		keylist: asStringArray(pick(src, ['keylist', 'KeyList'])) as NodeId[] | undefined,
		groupid: asOptionalString(pick(src, ['groupid', 'GroupId'])) as GroupId | undefined,
		gate,
		keytype: asOptionalString(pick(src, ['keytype', 'KeyType'])) as Key | undefined,
		msgcheck: asOptionalString(pick(src, ['msgcheck', 'MsgCheck'])) as MsgCheck | undefined,
		savedata: asOptionalString(pick(src, ['savedata', 'SaveData'])),
		globalnonce:
			typeof pick(src, ['globalnonce', 'GlobalNonce']) === 'number'
				? (pick(src, ['globalnonce', 'GlobalNonce']) as number)
				: undefined,
		timepoint: requireString(
			pick(src, ['timepoint', 'Timepoint']),
			'timepoint',
		),
		status: asOptionalString(pick(src, ['status'])),
	};
	const parsed = KeyGenResultSchema.safeParse(normalized);
	return parsed.success ? parsed.data : undefined;
}

export function extractStatus(payload: unknown): string | undefined {
	if (!payload || typeof payload !== 'object') {
		return undefined;
	}
	const status = (payload as Record<string, unknown>).status;
	return typeof status === 'string' ? status : undefined;
}

export function normalizeKnownAddressForChain(
	chainType: string,
	address: string,
): string {
	const t = chainType.trim().toLowerCase();
	const a = address.trim();
	if (t === 'ethereum' && /^0x[a-fA-F0-9]{40}$/.test(a)) {
		return a.toLowerCase();
	}
	return a;
}

export function normalizeChainId(chainId: string | number): string {
	return typeof chainId === 'number' ? String(chainId) : chainId.trim();
}
