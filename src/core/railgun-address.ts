/** The saved 0zk address is the KeyGen wallet. A low quorum must not mint a replacement. */
export function existingRailgunKeyGenAddress(record: {
	walletConfigured: boolean;
	railgunAddress: string;
}): string {
	const address = record.railgunAddress.trim();
	if (!record.walletConfigured || !address) return '';
	return address;
}
