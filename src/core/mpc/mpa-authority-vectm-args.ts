export type VeCtmNodeInfo = {
	forum?: string;
	forumHandle?: string;
	email?: string;
	hardware?: [number, number, number, number];
	ipv4?: [number, number, number, number];
	specs?: [number, number, number, number, number, number, number, number];
	ipv6?: [number, number, number, number, number, number, number, number];
	hosting?: string;
	ram?: bigint | number | string;
	cpu?: bigint | number | string;
	ip?: string;
	vps?: string;
	dIDType?: string;
	dID?: string;
	extra?: string;
};

export const VECTM_NODE_INFO_TUPLE =
	'(string,string,uint8[4],uint16[8],string,uint256,uint256,string,string,bytes)' as const;

export const ATTACH_VECTM_SIGNATURE =
	`attachVeCtm(string,uint256,${VECTM_NODE_INFO_TUPLE},string)` as const;

export function encodeNodeInfoTupleValue(info: VeCtmNodeInfo | undefined): string {
	const ipv4 = info?.ipv4 ?? info?.hardware ?? [0, 0, 0, 0];
	const ipv6 = info?.ipv6 ?? info?.specs ?? [0, 0, 0, 0, 0, 0, 0, 0];
	return JSON.stringify([
		info?.forumHandle ?? info?.forum ?? '',
		info?.email ?? '',
		ipv4,
		ipv6,
		info?.vps ?? info?.hosting ?? '',
		String(info?.ram ?? 0),
		String(info?.cpu ?? 0),
		info?.dIDType ?? '',
		info?.dID ?? '',
		info?.extra ?? '0x',
	]);
}

export function attachVeCtmComposeArgs(
	nodeKey: string,
	tokenId: string,
	nodeInfo: VeCtmNodeInfo | undefined,
	groupId: string,
) {
	return [
		{name: 'nodeKey', type: 'string', value: nodeKey},
		{name: 'tokenId', type: 'uint256', value: tokenId},
		{
			name: 'nodeInfo',
			type: VECTM_NODE_INFO_TUPLE,
			value: encodeNodeInfoTupleValue(nodeInfo),
		},
		{name: 'groupId', type: 'string', value: groupId},
	];
}
