import {encodeFunctionData} from 'viem';

export type AbiInputArg = {
	readonly name?: string;
	readonly type: string;
	readonly value: string;
};

function getFunctionName(signature: string): string {
	const idx = signature.indexOf('(');
	return idx === -1 ? signature : signature.slice(0, idx);
}

function signatureToAbiInputs(signature: string): {type: string}[] {
	const match = signature.match(/\(([^)]*)\)/);
	if (!match?.[1]) return [];
	return match[1].split(',').map(t => ({type: t.trim()}));
}

function coerceAbiValue(
	type: string,
	value: string,
): string | bigint | boolean | (string | bigint | boolean)[] {
	const trimmed = (value ?? '').trim();

	if (type.endsWith('[]')) {
		let arr: string[];
		if (trimmed.startsWith('[')) {
			try {
				const parsed = JSON.parse(trimmed) as unknown;
				if (!Array.isArray(parsed)) throw new Error('not array');
				arr = parsed.map(x => String(x).trim());
			} catch {
				arr = [];
			}
		} else {
			arr = trimmed ? trimmed.split(',').map(s => s.trim()) : [];
		}
		const baseType = type.slice(0, -2);
		if (baseType === 'address') return arr.map(v => v as `0x${string}`);
		if (baseType.startsWith('uint') || baseType.startsWith('int')) {
			return arr.map(v => BigInt(v || '0'));
		}
		if (baseType === 'bool') return arr.map(v => v === 'true' || v === '1');
		return arr;
	}

	if (type === 'address') return trimmed as `0x${string}`;
	if (type.startsWith('uint') || type.startsWith('int')) return BigInt(trimmed || '0');
	if (type === 'bool') return trimmed === 'true' || trimmed === '1';
	return trimmed;
}

export function encodeActionCalldata(
	signature: string,
	inputs: readonly AbiInputArg[],
): `0x${string}` {
	const name = getFunctionName(signature);
	const types = signatureToAbiInputs(signature);
	if (types.length !== inputs.length) {
		throw new Error('encodeActionCalldata: inputs length mismatch');
	}
	const args = inputs.map((inp, i) => coerceAbiValue(types[i]!.type, inp.value));
	const fragment = {
		type: 'function' as const,
		name,
		inputs: types.map((t, i) => ({
			name: inputs[i]?.name ?? `arg${i}`,
			type: t.type,
		})),
		outputs: [],
		stateMutability: 'nonpayable' as const,
	};
	return encodeFunctionData({abi: [fragment], functionName: name, args});
}
