import {encodeFunctionData, parseAbi} from 'viem';

export type AbiInputArg = {
	readonly name?: string;
	readonly type: string;
	readonly value: string;
};

function getFunctionName(signature: string): string {
	const idx = signature.indexOf('(');
	return idx === -1 ? signature : signature.slice(0, idx);
}

/** Split ABI param list, keeping nested tuples intact. */
export function splitAbiParamList(inner: string): string[] {
	const out: string[] = [];
	let buf = '';
	let depth = 0;
	for (const ch of inner) {
		if (ch === '(') depth += 1;
		if (ch === ')') depth -= 1;
		if (ch === ',' && depth === 0) {
			if (buf.trim()) out.push(buf.trim());
			buf = '';
			continue;
		}
		buf += ch;
	}
	if (buf.trim()) out.push(buf.trim());
	return out;
}

function signatureToAbiInputs(signature: string): {type: string}[] {
	const start = signature.indexOf('(');
	if (start === -1) return [];
	let depth = 0;
	let end = -1;
	for (let i = start; i < signature.length; i++) {
		const ch = signature[i];
		if (ch === '(') depth += 1;
		if (ch === ')') {
			depth -= 1;
			if (depth === 0) {
				end = i;
				break;
			}
		}
	}
	if (end === -1) return [];
	const inner = signature.slice(start + 1, end);
	if (!inner.trim()) return [];
	return splitAbiParamList(inner).map(t => ({type: t}));
}

function coerceAbiValue(
	type: string,
	value: string,
): string | bigint | boolean | unknown[] {
	const trimmed = (value ?? '').trim();

	if (type.startsWith('(') && type.endsWith(')')) {
		const parsed = JSON.parse(trimmed || '[]') as unknown;
		if (!Array.isArray(parsed)) throw new Error('tuple value must be a JSON array');
		const parts = splitAbiParamList(type.slice(1, -1));
		return parts.map((part, i) => {
			const child = parsed[i];
			if (typeof child === 'string') return coerceAbiValue(part, child);
			return coerceAbiValue(part, JSON.stringify(child ?? ''));
		});
	}

	const fixed = type.match(/^(.+)\[(\d+)\]$/);
	if (fixed && !type.endsWith('[]')) {
		const parsed = trimmed.startsWith('[') ? (JSON.parse(trimmed) as unknown) : trimmed.split(',');
		if (!Array.isArray(parsed)) throw new Error('fixed array value must be a JSON array');
		const baseType = fixed[1]!;
		return parsed.map(x => coerceAbiValue(baseType, String(x)));
	}

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
	if (type === 'bytes') {
		const hex = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
		return (hex === '0x' ? '0x' : hex) as `0x${string}`;
	}
	if (type.startsWith('uint') || type.startsWith('int')) return BigInt(trimmed || '0');
	if (type === 'bool') return trimmed === 'true' || trimmed === '1';
	return trimmed;
}

function signatureToParseAbiItem(
	name: string,
	types: readonly {type: string}[],
	inputs: readonly AbiInputArg[],
): string {
	const params = types
		.map((t, i) => {
			const argName = inputs[i]?.name?.trim() || `arg${i}`;
			return `${t.type} ${argName}`;
		})
		.join(', ');
	return `function ${name}(${params})`;
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
	const abiItem = signatureToParseAbiItem(name, types, inputs);
	// parseAbi needs compile-time literal signatures; attachVeCtm and other dynamic compose sigs are runtime-built.
	const abi = parseAbi([abiItem as never]) as import('viem').Abi;
	return encodeFunctionData({
		abi,
		functionName: name,
		args: args as readonly unknown[],
	});
}
