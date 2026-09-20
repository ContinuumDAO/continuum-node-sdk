import {getAddress} from 'viem';
import {LINEA_MAINNET_DEFAULT_EXPLORER} from '../../config/mpa-wallet.js';
import {
	ETHERSCAN_EXPLORER_BASE,
	ETHEREUM_CHAIN_ID,
	LINEA_CHAIN_ID,
} from './constants.js';

export function explorerBaseForChain(chainId: number): string | null {
	if (chainId === ETHEREUM_CHAIN_ID) {
		return ETHERSCAN_EXPLORER_BASE;
	}
	if (chainId === LINEA_CHAIN_ID) {
		return LINEA_MAINNET_DEFAULT_EXPLORER.replace(/\/$/, '');
	}
	return null;
}

export function checksumAddress(address: string): string {
	return getAddress(address);
}

export function contractExplorerUrl(chainId: number, address: string): string | undefined {
	const base = explorerBaseForChain(chainId);
	if (!base) {
		return undefined;
	}
	return `${base}/address/${checksumAddress(address)}`;
}

export function tokenExplorerUrl(chainId: number, address: string): string | undefined {
	const base = explorerBaseForChain(chainId);
	if (!base) {
		return undefined;
	}
	return `${base}/token/${checksumAddress(address)}`;
}

export function veNftExplorerUrl(votingEscrow: string, tokenId: string): string {
	const ve = checksumAddress(votingEscrow);
	const base = LINEA_MAINNET_DEFAULT_EXPLORER.replace(/\/$/, '');
	return `${base}/token/${ve}?a=${encodeURIComponent(tokenId)}`;
}

export function walletExplorerUrl(address: string): string {
	const base = LINEA_MAINNET_DEFAULT_EXPLORER.replace(/\/$/, '');
	return `${base}/address/${checksumAddress(address)}`;
}
