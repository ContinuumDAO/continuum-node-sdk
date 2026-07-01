import {encodePacked, keccak256, type Hex} from 'viem';

/** keccak256(abi.encodePacked(nodeKey, hostIpAddress)) — matches continuumdao-node-app vpnHostBinding.ts */
export function computeVpnHostBinding(nodeKey: string, hostIpAddress: string): Hex {
	return keccak256(encodePacked(['string', 'string'], [nodeKey, hostIpAddress]));
}
