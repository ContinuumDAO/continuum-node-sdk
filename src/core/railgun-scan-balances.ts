export type StoredRailgunBalance = {
	tokenAddress: string;
	spendable: string;
	pending: string;
};

/** A finished scan can stay on screen. An error scan's amount belongs to that attempt only. */
export function balancesCarriedIntoScan(
	chain: {scanStatus: string; balances: StoredRailgunBalance[]} | undefined,
): StoredRailgunBalance[] {
	if (!chain || (chain.scanStatus !== 'ready' && chain.scanStatus !== 'empty')) return [];
	return chain.balances;
}

/** An unfinished scan must not save a balance it did not decrypt. */
export function balancesSavedFromScan(args: {
	scanned: StoredRailgunBalance[];
	live: StoredRailgunBalance[];
	settled: boolean | undefined;
}): StoredRailgunBalance[] {
	if (args.scanned.length > 0) return args.scanned;
	if (args.settled === false) return [];
	return args.live;
}
