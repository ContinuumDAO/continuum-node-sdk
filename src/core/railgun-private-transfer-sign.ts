function cappedRailgunNote(value: string | undefined): string {
	return [...(value ?? '').trim()].slice(0, 256).join('');
}

/** Fields signed by POST /keyGenRailgunPrivateTransferSign. Empty notes are omitted so they match the server's omitempty JSON. */
export function railgunPrivateTransferSignFields(spend: {
	keyGenId: string;
	chainId: number;
	tokenAddress: string;
	amountWei: string;
	recipientAddress: string;
	memoText?: string;
	purpose?: string;
}): Record<string, unknown> {
	const note = cappedRailgunNote(spend.purpose) || cappedRailgunNote(spend.memoText);
	const fields: Record<string, unknown> = {
		amountWei: spend.amountWei.trim(),
		chainId: spend.chainId,
		keyGenId: spend.keyGenId.trim(),
		recipientAddress: spend.recipientAddress.trim(),
		tokenAddress: spend.tokenAddress.trim(),
	};
	if (note) {
		fields.memoText = note;
		fields.purpose = note;
	}
	return fields;
}

/** Fields signed by POST /keyGenRailgunUnshieldSign. An empty purpose is omitted so it matches the server's omitempty JSON. */
export function railgunUnshieldSignFields(spend: {
	keyGenId: string;
	chainId: number;
	tokenAddress: string;
	amountWei: string;
	recipientAddress: string;
	purpose?: string;
}): Record<string, unknown> {
	const purpose = cappedRailgunNote(spend.purpose);
	const fields: Record<string, unknown> = {
		amountWei: spend.amountWei.trim(),
		chainId: spend.chainId,
		keyGenId: spend.keyGenId.trim(),
		recipientAddress: spend.recipientAddress.trim(),
		tokenAddress: spend.tokenAddress.trim(),
	};
	if (purpose) fields.purpose = purpose;
	return fields;
}

/** Fields signed by POST /keyGenRailgunSpendExecute. Empty broadcaster fields are omitted. */
export function railgunSpendExecuteFields(spend: {
	keyGenId: string;
	spendId: string;
	broadcasterAddress?: string;
	broadcasterFeesId?: string;
}): Record<string, unknown> {
	const fields: Record<string, unknown> = {
		keyGenId: spend.keyGenId.trim(),
		spendId: spend.spendId.trim(),
	};
	const broadcasterAddress = spend.broadcasterAddress?.trim() ?? '';
	const broadcasterFeesId = spend.broadcasterFeesId?.trim() ?? '';
	if (broadcasterAddress) fields.broadcasterAddress = broadcasterAddress;
	if (broadcasterFeesId) fields.broadcasterFeesId = broadcasterFeesId;
	return fields;
}
